from __future__ import annotations
import threading
import time
from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import kociemba

from cube import scramble_to_facelet
from solver import solve_all_crosses
from mdp import train as mdp_train
from mdp.env import CubeEnv
from mdp.agent import greedy_solve, mcts_solve, policy_distribution

app = FastAPI(title="cubiq-ml", version="0.1.0")

# Load any persisted training status from disk on startup
@app.on_event("startup")
def _startup():
    mdp_train.load_persisted_status()

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
