"""
Square-1 solver: shape stage (optimal BFS) + macro-greedy pieces stage.

Model (matching cubing.js's square1 kpuzzle exactly, so its referee works):
  - 24 wedges: slots 0-11 top layer, 12-23 bottom, all individually tracked
  - twist (u, d): rotate top by u wedges, bottom by d (their U_SQ_/D_SQ_)
  - slash: swap slots 6-11 with 12-17 pairwise; toggles the equator
  - BANDAGING: corners occupy two adjacent wedges. Slash is legal only when
    no corner straddles a cut boundary — the boundaries are (5|6), (11|0),
    (17|18), (23|12). Corner-first pieces: 0,3,6,9 / 12,15,18,21 (partner
    is piece+1); edges: 2,5,8,11 / 14,17,20,23.

Stage 1 (shape): the wedge-TYPE pattern space is tiny — BFS from the
current shape to cube shape over composite (u, d, /) moves is optimal.

Stage 2 (pieces): macros = short sequences of composite moves that leave
cube shape as cube shape, DISCOVERED by DFS over the shape graph. Greedy
placement on a wedges-home metric with the usual reshape/lookahead
machinery; twists are free alignment moves.
"""
from __future__ import annotations
import os
import pickle
import random
import time
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

N = 24
_TOP = list(range(12))
_BOT = list(range(12, 24))

CORNER_FIRST = {0, 3, 6, 9, 12, 15, 18, 21}
EDGES = {2, 5, 8, 11, 14, 17, 20, 23}

SOLVED = tuple(range(24))


def twist(w: Tuple[int, ...], u: int, d: int) -> Tuple[int, ...]:
    u %= 12
    d %= 12
    top = [w[(i - u) % 12] for i in range(12)]
    bot = [w[12 + (i - d) % 12] for i in range(12)]
    return tuple(top + bot)


def slash_legal(w: Tuple[int, ...]) -> bool:
    for a, b in ((5, 6), (11, 0), (17, 18), (23, 12)):
        pa = w[a]
        if pa in CORNER_FIRST and w[b] == pa + 1:
            return False
    return True


def slash(w: Tuple[int, ...]) -> Tuple[int, ...]:
    lst = list(w)
    for i in range(6):
        lst[6 + i], lst[12 + i] = lst[12 + i], lst[6 + i]
    return tuple(lst)


def parse_scramble(scramble: str) -> List[Tuple[str, int, int]]:
    """Tokens: ('twist', u, d) and ('slash', 0, 0)."""
    out = []
    s = scramble.replace('/', ' / ')
    for tok in s.split():
        if tok == '/':
            out.append(('slash', 0, 0))
        elif tok.startswith('('):
            u, d = tok.strip('()').split(',')
            out.append(('twist', int(u), int(d)))
        elif tok:
            raise ValueError(f'bad square-1 token {tok!r}')
    return out


def apply_tokens(w: Tuple[int, ...], eq: int,
                 tokens: Sequence[Tuple[str, int, int]],
                 check: bool = True) -> Tuple[Tuple[int, ...], int]:
    for kind, u, d in tokens:
        if kind == 'twist':
            w = twist(w, u, d)
        else:
            if check and not slash_legal(w):
                raise ValueError('illegal slash (corner straddles the cut)')
            w = slash(w)
            eq ^= 1
    return w, eq


def tokens_to_str(tokens: Sequence[Tuple[str, int, int]]) -> str:
    parts = []
    for kind, u, d in tokens:
        if kind == 'twist':
            parts.append(f'({_norm(u)},{_norm(d)})')
        else:
            parts.append('/')
    return ' '.join(parts)


def _norm(x: int) -> int:
    x %= 12
    return x - 12 if x > 6 else x


# ── Shape space ───────────────────────────────────────────────────────────────
# type per slot: 0 = corner-first, 1 = corner-second, 2 = edge

def shape_of(w: Tuple[int, ...]) -> Tuple[int, ...]:
    out = []
    for p in w:
        if p in CORNER_FIRST:
            out.append(0)
        elif p in EDGES:
            out.append(2)
        else:
            out.append(1)
    return tuple(out)


CUBE_SHAPE = shape_of(SOLVED)


def legal_twists(w: Tuple[int, ...]) -> List[Tuple[int, int]]:
    """(u, d) twist pairs after which a slash is legal. Deduplicated at the
    shape level per layer offset."""
    tops = []
    for u in range(12):
        t = twist(w, u, 0)
        for a, b in ((5, 6), (11, 0)):
            pa = t[a]
            if pa in CORNER_FIRST and t[b] == pa + 1:
                break
        else:
            tops.append(u)
    bots = []
    for d in range(12):
        t = twist(w, 0, d)
        for a, b in ((17, 18), (23, 12)):
            pa = t[a]
            if pa in CORNER_FIRST and t[b] == pa + 1:
                break
        else:
            bots.append(d)
    return [(u, d) for u in tops for d in bots]


def solve_shape(w: Tuple[int, ...]) -> Optional[List[Tuple[str, int, int]]]:
    """Optimal (fewest-slash) token sequence bringing the puzzle to cube
    shape (any layer rotation)."""
    def canon(shape):
        return shape

    start = shape_of(w)
    if _is_cube_shape(start):
        return []
    # BFS over shapes with representative wedge states for move generation
    prev: Dict[tuple, Tuple[tuple, Tuple[int, int]]] = {start: (None, None)}
    reps = {start: w}
    frontier = [start]
    while frontier:
        nxt = []
        for sh in frontier:
            rep = reps[sh]
            for (u, d) in legal_twists(rep):
                w2 = slash(twist(rep, u, d))
                sh2 = shape_of(w2)
                if sh2 in prev:
                    continue
                prev[sh2] = (sh, (u, d))
                reps[sh2] = w2
                if _is_cube_shape(sh2):
                    # reconstruct
                    path = []
                    cur = sh2
                    while prev[cur][0] is not None:
                        p, ud = prev[cur]
                        path.append(ud)
                        cur = p
                    path.reverse()
                    tokens: List[Tuple[str, int, int]] = []
                    for (uu, dd) in path:
                        tokens.append(('twist', uu, dd))
                        tokens.append(('slash', 0, 0))
                    return tokens
                nxt.append(sh2)
        frontier = nxt
    return None


def _is_cube_shape(shape: Tuple[int, ...]) -> bool:
    """Cube shape at ANY layer rotation: each layer's type pattern is a
    rotation of the solved layer pattern."""
    base_top = CUBE_SHAPE[:12]
    top, bot = shape[:12], shape[12:]
    def rot_match(pat):
        for r in range(12):
            if tuple(pat[(i - r) % 12] for i in range(12)) == base_top:
                return True
        return False
    return rot_match(top) and rot_match(bot)


# ── Pieces stage ──────────────────────────────────────────────────────────────

_MACROS: Optional[List[dict]] = None


def _discover_macros(max_slashes: int = 3, cap: int = 40000) -> List[dict]:
    """Cube->cube move sequences with <= max_slashes slashes, discovered by
    DFS with shape-distance pruning. Effects recorded as (perm, eq_flips)."""
    global _MACROS
    if _MACROS is not None:
        return _MACROS

    # shape-distance-to-cube table via reverse BFS over shape space
    dist: Dict[tuple, int] = {}
    reps: Dict[tuple, tuple] = {}
    # seed: all 144 layer rotations of the solved state (all cube shapes)
    frontier = []
    for u in range(12):
        for d in range(12):
            w = twist(SOLVED, u, d)
            sh = shape_of(w)
            if sh not in dist:
                dist[sh] = 0
                reps[sh] = w
                frontier.append(sh)
    while frontier:
        nxt = []
        for sh in frontier:
            rep = reps[sh]
            for (u, d) in legal_twists(rep):
                w2 = slash(twist(rep, u, d))
                sh2 = shape_of(w2)
                if sh2 not in dist:
                    dist[sh2] = dist[sh] + 1
                    reps[sh2] = w2
                    nxt.append(sh2)
        frontier = nxt

    macros: List[dict] = []
    seen = set()

    def consider(tokens: List[Tuple[str, int, int]], w: Tuple[int, ...], flips: int):
        key = (w, flips & 1)
        if key in seen or w == SOLVED and flips % 2 == 0:
            return
        seen.add(key)
        macros.append({'tokens': list(tokens), 'perm': w, 'eq': flips & 1,
                       'slashes': flips})

    def dfs(w: Tuple[int, ...], tokens: List[Tuple[str, int, int]], slashes: int):
        if len(macros) >= cap:
            return
        sh = shape_of(w)
        if sh == CUBE_SHAPE and slashes > 0:
            consider(tokens, w, slashes)
        if slashes >= max_slashes:
            return
        rem = max_slashes - slashes
        for (u, d) in legal_twists(w):
            w2 = slash(twist(w, u, d))
            if dist.get(shape_of(w2), 99) > rem - 1:
                continue
            tokens.append(('twist', u, d))
            tokens.append(('slash', 0, 0))
            dfs(w2, tokens, slashes + 1)
            tokens.pop()
            tokens.pop()

    dfs(SOLVED, [], 0)
    # sort: fewest slashes, then smallest support
    for m in macros:
        m['support'] = sum(1 for i in range(24) if m['perm'][i] != i)
    macros.sort(key=lambda m: (m['slashes'], m['support']))
    _MACROS = macros
    return macros


def _wedges_home(w: Tuple[int, ...]) -> int:
    return sum(1 for i in range(24) if w[i] == i)


def _apply_perm(w: Tuple[int, ...], perm: Tuple[int, ...]) -> Tuple[int, ...]:
    """perm expressed as a solved-state image: result[i] = w[pre[i]] where
    pre is derived from perm (perm = image of SOLVED under the macro)."""
    # perm[i] = SOLVED piece that lands on slot i == source slot index
    return tuple(w[perm[i]] for i in range(24))


# ── Exact two-phase piece solving ─────────────────────────────────────────────
#
# Greedy metric search dies in local optima here (only 5 corner-preserving
# macros exist at <=3 slashes), so the pieces stage is exact instead:
#   phase 1: BFS distance table over the corner projection (8! states). The
#            projection is a true quotient — every cube->cube generator maps
#            corner slots to corner slots — so table descent is exact.
#   phase 2: the same over (edge projection, equator), with generators that
#            preserve corners EXACTLY: composites t1·m1·t2·m2 whose corner
#            effects cancel, found by indexing the macro library on its
#            corner signature (the conjugation trick from the 5x5, done in
#            bulk via dictionary lookup).

CORNER_SLOTS = sorted(CORNER_FIRST)
EDGE_SLOTS = sorted(EDGES)
_CIDX = {s: i for i, s in enumerate(CORNER_SLOTS)}
_EIDX = {s: i for i, s in enumerate(EDGE_SLOTS)}
_TABLES: Optional[dict] = None
_TABLES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            'tables', 'sq1_pieces_v2.pkl')


def _compose(p: Tuple[int, ...], q: Tuple[int, ...]) -> Tuple[int, ...]:
    """Perm of 'apply p, then q' (image-of-SOLVED convention)."""
    return tuple(p[i] for i in q)


def _invert(p: Tuple[int, ...]) -> Tuple[int, ...]:
    inv = [0] * 24
    for i, v in enumerate(p):
        inv[v] = i
    return tuple(inv)


def _inv_tokens(tokens: Sequence[Tuple[str, int, int]]) -> List[Tuple[str, int, int]]:
    out: List[Tuple[str, int, int]] = []
    for kind, u, d in reversed(tokens):
        if kind == 'twist':
            out.append(('twist', (-u) % 12, (-d) % 12))
        else:
            out.append(('slash', 0, 0))
    return out


def _rank8(p: Sequence[int]) -> int:
    p = list(p)
    r = 0
    for i in range(8):
        r = r * (8 - i) + p[i]
        for j in range(i + 1, 8):
            if p[j] > p[i]:
                p[j] -= 1
    return r


def _rank8_np(arr: np.ndarray) -> np.ndarray:
    a = arr.astype(np.int64).copy()
    r = np.zeros(len(a), dtype=np.int64)
    for i in range(8):
        r = r * (8 - i) + a[:, i]
        for j in range(i + 1, 8):
            a[:, j] -= (a[:, j] > a[:, i])
    return r


def _bfs_dist(maps: List[Tuple[int, ...]], eqs: Optional[List[int]]) -> np.ndarray:
    """Distance-from-identity table over the projected space, vectorized.
    Generators must be inverse-closed so distances are symmetric."""
    use_eq = eqs is not None
    dist = np.full(40320 * (2 if use_eq else 1), -1, dtype=np.int8)
    dist[0] = 0
    states = np.arange(8, dtype=np.uint8)[None, :]
    seq = np.zeros(1, dtype=np.uint8)
    gmaps = [np.array(m, dtype=np.intp) for m in maps]
    d = 0
    while len(states):
        d += 1
        nxt_s: List[np.ndarray] = []
        nxt_e: List[np.ndarray] = []
        for gi, gm in enumerate(gmaps):
            ns = states[:, gm]
            idx = _rank8_np(ns)
            if use_eq:
                ne = seq ^ eqs[gi]
                idx = idx * 2 + ne
            fresh = np.flatnonzero(dist[idx] < 0)
            if len(fresh) == 0:
                continue
            _, first = np.unique(idx[fresh], return_index=True)
            keep = fresh[first]
            dist[idx[keep]] = d
            nxt_s.append(ns[keep])
            if use_eq:
                nxt_e.append(ne[keep])
        if not nxt_s:
            break
        states = np.concatenate(nxt_s)
        seq = (np.concatenate(nxt_e) if use_eq
               else np.zeros(len(states), dtype=np.uint8))
    return dist


def _perm_parity(vals: Sequence[int]) -> int:
    idx = {v: i for i, v in enumerate(sorted(vals))}
    p = [idx[v] for v in vals]
    seen, par = [False] * len(p), 0
    for i in range(len(p)):
        if seen[i]:
            continue
        length, j = 0, i
        while not seen[j]:
            seen[j] = True
            j = p[j]
            length += 1
        par ^= (length - 1) & 1
    return par


def _coupling(w: Tuple[int, ...]) -> int:
    """0 when corner-perm parity == edge-perm parity. Every cube->cube
    sequence of <=5 slashes is coupled (verified exhaustively), so macro
    composition alone can never reach decoupled states — half of all legal
    positions. Decoupled primitives need ~7+ slashes."""
    return (_perm_parity([w[s] for s in CORNER_SLOTS])
            ^ _perm_parity([w[s] for s in EDGE_SLOTS]))


def _decoupled_primitives(count: int = 12, seed: int = 123) -> List[dict]:
    """Find cube->cube sequences whose corner/edge parities DIFFER, by
    random legal walks + optimal shape return. These are the square-1
    'parity algs' — the bridge to the other half of the piece group."""
    rng = random.Random(seed)
    found: List[dict] = []
    while len(found) < count:
        w, eq = SOLVED, 0
        toks: List[Tuple[str, int, int]] = []
        for _ in range(rng.randint(4, 9)):
            opts = legal_twists(w)
            u, d = opts[rng.randrange(len(opts))]
            toks += [('twist', u, d), ('slash', 0, 0)]
            w, eq = apply_tokens(w, eq, toks[-2:])
        back = solve_shape(w)
        if back is None:
            continue
        toks += back
        w, eq = apply_tokens(w, eq, back)
        for cu in range(12):
            done = False
            for cd in range(12):
                if shape_of(twist(w, cu, cd)) == CUBE_SHAPE:
                    if (cu, cd) != (0, 0):
                        toks.append(('twist', cu, cd))
                        w = twist(w, cu, cd)
                    done = True
                    break
            if done:
                break
        if _coupling(w) == 1:
            found.append({'tokens': toks, 'perm': w, 'eq': eq,
                          'slashes': sum(1 for t in toks if t[0] == 'slash'),
                          'support': sum(1 for i in range(24) if w[i] != i)})
    found.sort(key=lambda m: (m['slashes'], m['support']))
    return found


def _build_edge_gens(macros: List[dict], extras: List[dict],
                     m1_cap: int = 1500, keep: int = 900) -> List[dict]:
    """Corner-preserving generators: t1·m1·t2 (when its corner effect is
    already identity) and t1·m1·t2·m2 where m2's corner signature cancels
    the prefix's — a dict lookup, not a search."""
    csig: Dict[tuple, List[dict]] = {}
    for m in macros:
        csig.setdefault(tuple(m['perm'][c] for c in CORNER_SLOTS), []).append(m)
    twists16 = [((u, d), twist(SOLVED, u, d))
                for u in (0, 3, 6, 9) for d in (0, 3, 6, 9)]

    best: Dict[tuple, tuple] = {}

    def record(perm, e, sl, tokens):
        if perm == SOLVED and e == 0:
            return
        sup = sum(1 for s in EDGE_SLOTS if perm[s] != s)
        key = (perm, e)
        if key not in best or (sl, sup) < best[key][:2]:
            best[key] = (sl, sup, tokens)

    for ud1, tp1 in twists16:
        t1tok = [] if ud1 == (0, 0) else [('twist', ud1[0], ud1[1])]
        for m1 in macros[:m1_cap] + extras:
            p1 = _compose(tp1, m1['perm'])
            for ud2, tp2 in twists16:
                P = _compose(p1, tp2)
                t2tok = [] if ud2 == (0, 0) else [('twist', ud2[0], ud2[1])]
                pre = t1tok + m1['tokens'] + t2tok
                if all(P[c] == c for c in CORNER_SLOTS):
                    record(P, m1['eq'], m1['slashes'], pre)
                Pi = _invert(P)
                need = tuple(Pi[c] for c in CORNER_SLOTS)
                for m2 in csig.get(need, ()):
                    record(_compose(P, m2['perm']), m1['eq'] ^ m2['eq'],
                           m1['slashes'] + m2['slashes'], pre + m2['tokens'])

    gens = [{'perm': k[0], 'eq': k[1], 'slashes': v[0], 'support': v[1],
             'tokens': v[2]} for k, v in best.items()]
    gens.sort(key=lambda g: (g['support'], g['slashes']))
    # keep must span BOTH parity cosets or the edge table only covers half
    coupled = [g for g in gens if _coupling(g['perm']) == 0]
    decoupled = [g for g in gens if _coupling(g['perm']) == 1]
    gens = coupled[:keep - min(len(decoupled), 100)] + decoupled[:100]
    seen = {(g['perm'], g['eq']) for g in gens}
    for g in list(gens):
        ip = _invert(g['perm'])
        if (ip, g['eq']) not in seen:
            seen.add((ip, g['eq']))
            gens.append({'perm': ip, 'eq': g['eq'], 'slashes': g['slashes'],
                         'support': g['support'],
                         'tokens': _inv_tokens(g['tokens'])})
    return gens


def _build_tables() -> dict:
    macros = _discover_macros()

    cg: List[dict] = []
    for u in (0, 3, 6, 9):
        for d in (0, 3, 6, 9):
            if (u, d) != (0, 0):
                cg.append({'tokens': [('twist', u, d)],
                           'perm': twist(SOLVED, u, d), 'eq': 0})
    cg += [{'tokens': m['tokens'], 'perm': m['perm'], 'eq': m['eq']}
           for m in macros[:1200]]
    seen = {(g['perm'], g['eq']) for g in cg}
    for g in list(cg):
        ip = _invert(g['perm'])
        if (ip, g['eq']) not in seen:
            seen.add((ip, g['eq']))
            cg.append({'tokens': _inv_tokens(g['tokens']), 'perm': ip,
                       'eq': g['eq']})
    for g in cg:
        g['cmap'] = tuple(_CIDX[g['perm'][s]] for s in CORNER_SLOTS)
    cdist = _bfs_dist([g['cmap'] for g in cg], None)

    eg = _build_edge_gens(macros, _decoupled_primitives())
    for g in eg:
        g['emap'] = tuple(_EIDX[g['perm'][s]] for s in EDGE_SLOTS)
    edist = _bfs_dist([g['emap'] for g in eg], [g['eq'] for g in eg])

    return {
        'cgens': [{'tokens': g['tokens'], 'cmap': g['cmap']} for g in cg],
        'cdist': cdist,
        'egens': [{'tokens': g['tokens'], 'emap': g['emap'], 'eq': g['eq']}
                  for g in eg],
        'edist': edist,
    }


def _tables() -> dict:
    global _TABLES
    if _TABLES is not None:
        return _TABLES
    if os.path.exists(_TABLES_PATH):
        with open(_TABLES_PATH, 'rb') as f:
            _TABLES = pickle.load(f)
        return _TABLES
    t0 = time.perf_counter()
    _TABLES = _build_tables()
    os.makedirs(os.path.dirname(_TABLES_PATH), exist_ok=True)
    with open(_TABLES_PATH, 'wb') as f:
        pickle.dump(_TABLES, f)
    ccov = int((_TABLES['cdist'] >= 0).sum())
    ecov = int((_TABLES['edist'] >= 0).sum())
    print(f'[sq1] piece tables built in {time.perf_counter() - t0:.0f}s: '
          f'corner coverage {ccov}/40320, edge coverage {ecov}/80640')
    return _TABLES


def _descend(w: Tuple[int, ...], eq: int, gens: List[dict],
             dist: np.ndarray, slots: List[int], idxmap: Dict[int, int],
             mkey: str, use_eq: bool,
             rng: Optional[random.Random]) -> Optional[tuple]:
    order = list(range(len(gens)))
    if rng is not None:
        rng.shuffle(order)
    tokens: List[Tuple[str, int, int]] = []
    for _ in range(64):
        proj = tuple(idxmap[w[s]] for s in slots)
        idx = _rank8(proj) * 2 + eq if use_eq else _rank8(proj)
        d0 = int(dist[idx])
        if d0 < 0:
            return None
        if d0 == 0:
            return tokens, w, eq
        moved = False
        for gi in order:
            g = gens[gi]
            p2 = tuple(proj[m] for m in g[mkey])
            e2 = eq ^ g['eq'] if use_eq else eq
            i2 = _rank8(p2) * 2 + e2 if use_eq else _rank8(p2)
            if 0 <= dist[i2] < d0:
                w, eq = apply_tokens(w, eq, g['tokens'])
                tokens += g['tokens']
                moved = True
                break
        if not moved:
            return None
    return None


def solve_pieces(w: Tuple[int, ...], eq: int,
                 max_attempts: int = 25) -> Optional[List[Tuple[str, int, int]]]:
    """Exact two-phase descent: corners home via the corner table, then
    edges + equator via corner-preserving generators. Phase-1 gen order is
    reshuffled between attempts so a phase-2-uncovered endpoint can be
    routed around."""
    T = _tables()
    rng = random.Random(0xC0B1)
    for attempt in range(max_attempts):
        r1 = _descend(w, eq, T['cgens'], T['cdist'], CORNER_SLOTS, _CIDX,
                      'cmap', False, rng if attempt else None)
        if r1 is None:
            return None
        toks1, w1, eq1 = r1
        r2 = _descend(w1, eq1, T['egens'], T['edist'], EDGE_SLOTS, _EIDX,
                      'emap', True, None)
        if r2 is not None:
            toks2, _, _ = r2
            return toks1 + toks2
    return None


# ── Full solve ────────────────────────────────────────────────────────────────

def solve_sq1(scramble: str) -> dict:
    t0 = time.perf_counter()
    tokens = parse_scramble(scramble)
    w, eq = apply_tokens(SOLVED, 0, tokens)

    stages: List[dict] = []
    shape_toks = solve_shape(w)
    if shape_toks is None:
        raise RuntimeError('square-1 shape stage failed')
    w, eq = apply_tokens(w, eq, shape_toks)
    # canonicalize the layer alignment (macros are discovered from, and only
    # valid at, the canonical cube pattern)
    for cu in range(12):
        done = False
        for cd in range(12):
            if shape_of(twist(w, cu, cd)) == CUBE_SHAPE:
                if (cu, cd) != (0, 0):
                    shape_toks = shape_toks + [('twist', cu, cd)]
                    w = twist(w, cu, cd)
                done = True
                break
        if done:
            break
    stages.append({'name': 'cube shape', 'kind': 'shape',
                   'moves': [tokens_to_str([t]) for t in shape_toks]})

    piece_toks = solve_pieces(w, eq)
    if piece_toks is None:
        raise RuntimeError('square-1 pieces stage failed')
    w, eq = apply_tokens(w, eq, piece_toks)
    stages.append({'name': 'pieces', 'kind': 'pieces',
                   'moves': [tokens_to_str([t]) for t in piece_toks]})

    if w != SOLVED or eq != 0:
        raise RuntimeError('square-1 pipeline finished unsolved')

    for st in stages:
        st['move_count'] = sum(1 for m in st['moves'] if m == '/')
    total = sum(st['move_count'] for st in stages)
    return {
        'puzzle': 'sq1',
        'stages': stages,
        'total_moves': total,     # slash count (the natural sq1 metric)
        'solution': ' '.join(m for st in stages for m in st['moves']),
        'time_ms': (time.perf_counter() - t0) * 1000,
    }
