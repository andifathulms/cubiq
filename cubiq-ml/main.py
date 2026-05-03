from __future__ import annotations
import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import kociemba

from cube import scramble_to_facelet
from solver import solve_all_crosses

app = FastAPI(title="cubiq-ml", version="0.1.0")

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
