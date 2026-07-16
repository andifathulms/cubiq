from __future__ import annotations
import threading
import time
from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import kociemba

from cube import scramble_to_facelet
from solver import solve_all_crosses
from cfop import solve_cfop, solve_xcross, FACES
from cfop444 import solve_444
from solver222 import solve_222, get_table as warm_222_table
from solverpyram import solve_pyram, get_table as warm_pyram_table
from solvermega import solve_mega, warm_pair_tables as warm_mega_tables
from f2l import warm_tables
from mdp import train as mdp_train
from mdp.env import CubeEnv
from mdp.agent import greedy_solve, mcts_solve, policy_distribution

app = FastAPI(title="cubiq-ml", version="0.1.0")

# Load any persisted training status from disk on startup
@app.on_event("startup")
def _startup():
    mdp_train.load_persisted_status()
    # Build/load the F2L and 2x2 distance tables off the request path
    threading.Thread(target=warm_tables, daemon=True).start()
    threading.Thread(target=warm_222_table, daemon=True).start()
    threading.Thread(target=warm_pyram_table, daemon=True).start()
    threading.Thread(target=warm_mega_tables, daemon=True).start()

_mdp_env = CubeEnv()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_MODEL = "kociemba"
_VERSION = "0.1.0"


# ── /health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "model": _MODEL, "version": _VERSION}


# ── /solve ────────────────────────────────────────────────────────────────────

class SolveRequest(BaseModel):
    state: str                      # scramble string (WCA notation)
    method: str = "kociemba"        # reserved for future MDP/RL method


class SolveResponse(BaseModel):
    moves: list[str]
    move_count: int
    time_ms: float


@app.post("/solve", response_model=SolveResponse)
def solve(req: SolveRequest):
    t0 = time.perf_counter()
    try:
        facelet = scramble_to_facelet(req.state)
        solution = kociemba.solve(facelet)
        moves = solution.split() if solution.strip() else []
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return SolveResponse(
        moves=moves,
        move_count=len(moves),
        time_ms=(time.perf_counter() - t0) * 1000,
    )


# ── /solve/cross ──────────────────────────────────────────────────────────────

class CrossSolveRequest(BaseModel):
    state: str                      # scramble string
    face: str                       # D | U | F | B | R | L


class CrossSolveResponse(BaseModel):
    face: str
    rotation: str
    moves: list[str]
    move_count: int
    alternatives: list[list[str]] = []
    time_ms: float


@app.post("/solve/cross", response_model=CrossSolveResponse)
def solve_cross(req: CrossSolveRequest):
    face = req.face.upper()
    if face not in ('D', 'U', 'F', 'B', 'R', 'L'):
        raise HTTPException(status_code=422, detail=f"Invalid face '{req.face}'")
    t0 = time.perf_counter()
    try:
        solutions = solve_all_crosses(req.state)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    result = next((s for s in solutions if s['face'] == face), None)
    if result is None:
        raise HTTPException(status_code=500, detail="Solver returned no result")
    return CrossSolveResponse(
        **result,
        time_ms=(time.perf_counter() - t0) * 1000,
    )


# ── /solve/cfop ───────────────────────────────────────────────────────────────

class CFOPSolveRequest(BaseModel):
    state: str                      # scramble string (WCA notation)
    face: str = 'best'              # D | U | F | B | R | L | best
    beam_width: int = 4
    cross_alternatives: int = 2
    pair_variants: int = 2
    try_xcross: bool = True


@app.post("/solve/cfop")
def solve_cfop_endpoint(req: CFOPSolveRequest):
    face = req.face if req.face == 'best' else req.face.upper()
    if face != 'best' and face not in FACES:
        raise HTTPException(status_code=422, detail=f"Invalid face '{req.face}'")
    try:
        return solve_cfop(
            req.state,
            face=face,
            beam_width=max(1, min(req.beam_width, 8)),
            cross_alternatives=max(1, min(req.cross_alternatives, 5)),
            pair_variants=max(1, min(req.pair_variants, 3)),
            try_xcross=req.try_xcross,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── /solve/xcross ─────────────────────────────────────────────────────────────

class XCrossSolveRequest(BaseModel):
    state: str                      # scramble string (WCA notation)
    face: str = 'D'
    max_solutions: int = 2


@app.post("/solve/xcross")
def solve_xcross_endpoint(req: XCrossSolveRequest):
    face = req.face.upper()
    if face not in FACES:
        raise HTTPException(status_code=422, detail=f"Invalid face '{req.face}'")
    try:
        return solve_xcross(req.state, face=face,
                            max_solutions=max(1, min(req.max_solutions, 3)))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── /solve/444 ────────────────────────────────────────────────────────────────

class Solve444Request(BaseModel):
    state: str                      # 4x4 scramble (WCA notation: R, Rw, 2R...)
    cfop_face: str = 'D'            # cross face for the 3x3 stage ('best' allowed)
    try_xcross: bool = True


@app.post("/solve/444")
def solve_444_endpoint(req: Solve444Request):
    face = req.cfop_face if req.cfop_face == 'best' else req.cfop_face.upper()
    if face != 'best' and face not in FACES:
        raise HTTPException(status_code=422, detail=f"Invalid face '{req.cfop_face}'")
    try:
        return solve_444(req.state, cfop_face=face, try_xcross=req.try_xcross)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── /solve/222 ────────────────────────────────────────────────────────────────

class Solve222Request(BaseModel):
    state: str                      # 2x2 scramble (any outer faces)
    max_alternatives: int = 3


@app.post("/solve/222")
def solve_222_endpoint(req: Solve222Request):
    t0 = time.perf_counter()
    try:
        result = solve_222(req.state, max_alternatives=max(1, min(req.max_alternatives, 5)))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    result['time_ms'] = (time.perf_counter() - t0) * 1000
    return result


# ── /solve/pyram ──────────────────────────────────────────────────────────────

class SolvePyramRequest(BaseModel):
    state: str                      # pyraminx scramble (U L R B + tips u l r b)
    max_alternatives: int = 3


@app.post("/solve/pyram")
def solve_pyram_endpoint(req: SolvePyramRequest):
    t0 = time.perf_counter()
    try:
        result = solve_pyram(req.state, max_alternatives=max(1, min(req.max_alternatives, 5)))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    result['time_ms'] = (time.perf_counter() - t0) * 1000
    return result


# ── /solve/minx ───────────────────────────────────────────────────────────────

class SolveMinxRequest(BaseModel):
    state: str                      # WCA megaminx scramble (R++ D-- ... U')


@app.post("/solve/minx")
def solve_minx_endpoint(req: SolveMinxRequest):
    try:
        return solve_mega(req.state)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── /mdp/* ────────────────────────────────────────────────────────────────────

@app.get("/mdp/status")
def mdp_status():
    s = mdp_train.get_status()
    return {
        'trained':     s.get('trained', False),
        'running':     s.get('running', False),
        'epoch':       s.get('epoch', 0),
        'loss':        s.get('loss'),
        'value_loss':  s.get('value_loss'),
        'policy_loss': s.get('policy_loss'),
        'solve_rate':  s.get('solve_rate'),
        'model':       'mdp-adi',
    }


class TrainRequest(BaseModel):
    epochs:       int   = 50
    k:            int   = 10    # max scramble depth per batch
    l:            int   = 20    # scrambles per depth
    lr:           float = 1e-4
    eval_every:   int   = 5
    resume:       bool  = True


@app.post("/mdp/train")
def mdp_train_start(req: TrainRequest, background_tasks: BackgroundTasks):
    status = mdp_train.get_status()
    if status.get('running'):
        return {'started': False, 'message': 'Training already running'}
    background_tasks.add_task(
        mdp_train.train,
        epochs=req.epochs,
        k=req.k,
        l=req.l,
        lr=req.lr,
        eval_every=req.eval_every,
        resume=req.resume,
    )
    return {'started': True, 'message': f'Training started: {req.epochs} epochs, k={req.k}, l={req.l}'}


@app.post("/mdp/train/stop")
def mdp_train_stop():
    mdp_train.stop_training()
    return {'stopped': True}


class MDPSolveRequest(BaseModel):
    state:       str   = ''          # WCA scramble string
    method:      str   = 'greedy'    # 'greedy' | 'mcts'
    simulations: int   = 200         # MCTS only
    max_moves:   int   = 50


@app.post("/mdp/solve")
def mdp_solve(req: MDPSolveRequest):
    model = mdp_train.load_model()
    if model is None:
        raise HTTPException(status_code=503, detail='No trained model yet. Run /mdp/train first.')
    try:
        cube = _mdp_env.cube_from_scramble(req.state)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f'Invalid scramble: {exc}')
    if req.method == 'mcts':
        result = mcts_solve(model, cube, _mdp_env, simulations=req.simulations, max_moves=req.max_moves)
    else:
        result = greedy_solve(model, cube, _mdp_env, max_moves=req.max_moves)
    return result


@app.get("/mdp/policy")
def mdp_policy(state: str = Query(default='')):
    model = mdp_train.load_model()
    if model is None:
        raise HTTPException(status_code=503, detail='No trained model yet.')
    try:
        cube = _mdp_env.cube_from_scramble(state)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return policy_distribution(model, cube)


@app.get("/mdp/metrics")
def mdp_metrics():
    s = mdp_train.get_status()
    return {'epochs': s.get('history', [])}
