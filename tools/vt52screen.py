#!/usr/bin/env python3
"""Renders terminal output of the original as text, for quick checks.

Usage: vt52screen.py TRACE.json|RAW.bin [--at INSTRUCTIONS]

Interprets the VT52 subset the program uses (ESC Y, ESC H, ESC J, ESC K,
ESC A-D), CR, LF, BS, SO/SI and shows KOI-7 as Cyrillic and DEL as a full
block. This is a helper for reading traces, not the terminal model: the
terminal belongs to the svision platform `terminal` (M1).
"""
import json, sys

CYRILLIC = 'ЮАБЦДЕФГХИЙКЛМНОПЯРСТУЖВЬЫЗШЭЩЧ'


def render(data, rows=24, cols=80):
    grid = [[' '] * cols for _ in range(rows)]
    r = c = 0
    i = 0
    while i < len(data):
        b = data[i] & 0x7f
        i += 1
        if b == 27 and i < len(data):
            e = chr(data[i] & 0x7f)
            i += 1
            if e == 'Y' and i + 1 < len(data):
                r = min(rows - 1, (data[i] & 0x7f) - 32)
                c = min(cols - 1, (data[i + 1] & 0x7f) - 32)
                i += 2
            elif e == 'H':
                r = c = 0
            elif e == 'J':
                grid[r][c:] = [' '] * (cols - c)
                for k in range(r + 1, rows):
                    grid[k] = [' '] * cols
            elif e == 'K':
                grid[r][c:] = [' '] * (cols - c)
            elif e == 'A':
                r = max(0, r - 1)
            elif e == 'B':
                r = min(rows - 1, r + 1)
            elif e == 'C':
                c = min(cols - 1, c + 1)
            elif e == 'D':
                c = max(0, c - 1)
        elif b == 13:
            c = 0
        elif b == 10:
            r += 1
            if r >= rows:
                grid.pop(0)
                grid.append([' '] * cols)
                r = rows - 1
        elif b == 8:
            c = max(0, c - 1)
        elif b >= 32:
            if b == 127:
                ch = '█'
            elif 0x60 <= b <= 0x7e:
                ch = CYRILLIC[b - 0x60]
            else:
                ch = chr(b)
            grid[r][c] = ch
            c = min(cols - 1, c + 1)
    return '\n'.join(''.join(row).rstrip() for row in grid)


def main():
    path = sys.argv[1]
    at = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[2] == '--at' else None
    if path.endswith('.json'):
        trace = json.load(open(path))
        limit = None if at is None else trace['start'] + at
        data = b''.join(bytes.fromhex(h) for t, h in trace['output'] if limit is None or t <= limit)
    else:
        data = open(path, 'rb').read()
    print(render(data))


if __name__ == '__main__':
    main()
