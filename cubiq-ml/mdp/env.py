"""
Rubik's Cube MDP environment.

State:  480-dim float32 numpy vector (see state.py)
Action: integer index into ACTION_SPACE (18 WCA moves)
Transition: deterministic
Reward: 1.0 if the resulting state is solved, 0.0 otherwise
"""
from __future__ import annotations
import random
import numpy as np
import pycuber as pc
from mdp.state import _cube_to_state, solved_state, STATE_DIM

# 18 WCA quarter-turn and half-turn moves
ACTION_SPACE: list[str] = [
    'U', "U'", 'U2',
    'D', "D'", 'D2',
    'F', "F'", 'F2',
    'B', "B'", 'B2',
    'R', "R'", 'R2',
    'L', "L'", 'L2',
]
N_ACTIONS = len(ACTION_SPACE)

# Inverse moves — used to avoid cancellations in scramble generation
_INVERSE: dict[str, str] = {
    'U': "U'", "U'": 'U', 'U2': 'U2',
    'D': "D'", "D'": 'D', 'D2': 'D2',
    'F': "F'", "F'": 'F', 'F2': 'F2',
    'B': "B'", "B'": 'B', 'B2': 'B2',
    'R': "R'", "R'": 'R', 'R2': 'R2',
    'L': "L'", "L'": 'L', 'L2': 'L2',
}


class CubeEnv:
    """
    Gym-style interface for the Rubik's Cube MDP.

    The environment does NOT maintain a mutable cube between calls;
    each step takes a pycuber Cube object and returns a new one,
    so it is safe to use from multiple threads.
    """

    def reset(self) -> tuple[np.ndarray, pc.Cube]:
        """Return (state_vec, cube) for the solved state."""
        cube = pc.Cube()
        return _cube_to_state(cube), cube

    def scramble(self, depth: int, cube: pc.Cube | None = None) -> tuple[np.ndarray, pc.Cube, list[str]]:
        """
        Apply `depth` random moves (no immediate cancellations) starting from
        `cube` (defaults to solved).  Returns (state_vec, new_cube, moves_applied).
        """
        if cube is None:
            cube = pc.Cube()
        moves: list[str] = []
        last_move: str | None = None
        for _ in range(depth):
            pool = [m for m in ACTION_SPACE if last_move is None or m != _INVERSE[last_move]]
            move = random.choice(pool)
            cube = self._apply_move(cube, move)
            moves.append(move)
            last_move = move
        return _cube_to_state(cube), cube, moves

    def step(self, cube: pc.Cube, action: int) -> tuple[np.ndarray, float, bool, pc.Cube]:
        """
        Apply action (int index) to cube.
        Returns (next_state_vec, reward, done, next_cube).
        """
        move = ACTION_SPACE[action]
        next_cube = self._apply_move(cube, move)
        next_state = _cube_to_state(next_cube)
        done = self.is_solved(next_cube)
        reward = 1.0 if done else 0.0
        return next_state, reward, done, next_cube

    def apply_move_str(self, cube: pc.Cube, move: str) -> tuple[np.ndarray, pc.Cube]:
        """Apply a move string (e.g. "U'") and return (state_vec, new_cube)."""
        next_cube = self._apply_move(cube, move)
        return _cube_to_state(next_cube), next_cube

    def neighbors(self, cube: pc.Cube) -> list[tuple[str, np.ndarray, pc.Cube]]:
        """Return all 18 (move, next_state_vec, next_cube) neighbors."""
        result = []
        for move in ACTION_SPACE:
            nc = self._apply_move(cube, move)
            result.append((move, _cube_to_state(nc), nc))
        return result

    @staticmethod
    def is_solved(cube: pc.Cube) -> bool:
        ref = pc.Cube()
        for face in ['U', 'R', 'F', 'D', 'L', 'B']:
            if cube.get_face(face) != ref.get_face(face):
                return False
        return True

    @staticmethod
    def _apply_move(cube: pc.Cube, move: str) -> pc.Cube:
        c = cube.copy()
        c(pc.Formula(move))
        return c

    def cube_from_scramble(self, scramble: str) -> pc.Cube:
        cube = pc.Cube()
        if scramble.strip():
            cube(pc.Formula(scramble.strip()))
        return cube
