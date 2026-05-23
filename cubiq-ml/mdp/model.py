"""
Dual-head value + policy network for the Rubik's Cube MDP.

Architecture (matches DeepCubeA in spirit):
  Input (480) → shared trunk → value head (scalar) + policy head (18 logits)

Value head:  estimates the number of moves to the solved state (regression)
Policy head: probability distribution over the 18 actions (classification)
"""
from __future__ import annotations
import torch
import torch.nn as nn
from mdp.env import N_ACTIONS
from mdp.state import STATE_DIM


class ResBlock(nn.Module):
    def __init__(self, dim: int):
        super().__init__()
        self.block = nn.Sequential(
            nn.Linear(dim, dim),
            nn.BatchNorm1d(dim),
            nn.ELU(),
            nn.Linear(dim, dim),
            nn.BatchNorm1d(dim),
        )
        self.act = nn.ELU()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.act(x + self.block(x))


class CubeNet(nn.Module):
    """
    Dual-head network.

    Forward returns (value, policy_logits):
      value:         (batch,) — estimated moves to solved (unbounded positive)
      policy_logits: (batch, 18) — raw logits (apply softmax for probabilities)
    """

    def __init__(self, hidden: int = 4096, trunk_layers: int = 2):
        super().__init__()
        self.input_proj = nn.Sequential(
            nn.Linear(STATE_DIM, hidden),
            nn.BatchNorm1d(hidden),
            nn.ELU(),
        )
        self.trunk = nn.Sequential(
            *[ResBlock(hidden) for _ in range(trunk_layers)]
        )
        mid = hidden // 2
        self.value_head = nn.Sequential(
            nn.Linear(hidden, mid),
            nn.ELU(),
            nn.Linear(mid, 1),
            nn.ReLU(),           # value ≥ 0
        )
        self.policy_head = nn.Sequential(
            nn.Linear(hidden, mid),
            nn.ELU(),
            nn.Linear(mid, N_ACTIONS),
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        h = self.trunk(self.input_proj(x))
        value = self.value_head(h).squeeze(-1)
        policy_logits = self.policy_head(h)
        return value, policy_logits

    def predict(self, state_vec, device: str = 'cpu'):
        """Convenience: numpy state → (value float, policy probs numpy array)."""
        import numpy as np
        self.eval()
        with torch.no_grad():
            x = torch.tensor(state_vec, dtype=torch.float32).unsqueeze(0).to(device)
            v, logits = self(x)
            probs = torch.softmax(logits, dim=-1).squeeze(0).cpu().numpy()
            return float(v.item()), probs


def build_model(hidden: int = 4096, trunk_layers: int = 2) -> CubeNet:
    return CubeNet(hidden=hidden, trunk_layers=trunk_layers)
