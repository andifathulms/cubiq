"""
Utilities for converting a 3x3x3 scramble string to a kociemba facelet string.
Uses pycuber to apply moves, then maps sticker colors to face letters.
"""
import pycuber as pc

# pycuber solved-state face colors → kociemba face letter
_COLOR_MAP = {'y': 'U', 'o': 'R', 'g': 'F', 'w': 'D', 'r': 'L', 'b': 'B'}


def scramble_to_facelet(scramble: str) -> str:
    """Apply scramble to a solved cube and return the 54-char kociemba facelet string."""
    cube = pc.Cube()
    if scramble.strip():
        cube(pc.Formula(scramble.strip()))
    result = []
    for face in ['U', 'R', 'F', 'D', 'L', 'B']:
        grid = cube.get_face(face)
        for row in range(3):
            for col in range(3):
                color = str(grid[row][col]).strip('[]')
                result.append(_COLOR_MAP[color])
    return ''.join(result)
