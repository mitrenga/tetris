#!/usr/bin/env python3
"""Plays whole games of the original in SIMH and records its state at every step.

Usage: tracegame.py [--seed N] [--games N] [--levels A,B,..] [--names X,Y,..]
                    [--pieces N] [--tto-time N] -o TRACE.json.gz

Runs TET.SAV in the SIMH wrapper (tools/pdp11emu.py) with breakpoints on the
places the converted game calls ``hook()`` (app/tetrisLogic.js):

| PC | step |
|---|---|
| ``001000`` | ``readCharSeed`` - the level is typed here |
| ``013310`` | ``levelRead`` - after it, with the seed it made |
| ``007544`` | ``spawnPiece`` |
| ``012522`` | ``readKey`` - a key may be deposited here |
| ``017014`` | ``gameOver`` |

At every step it records the globals of the program (``R5``..``R5+2216``),
the seed (``001036``) and the JSW, as a diff to the step before. The name
and the yes/no answer are typed when the Pascal runtime first polls the
terminal for a line (``026466``), after the breakpoints are lifted.

The keys come from a small bot that reads the field and the piece from the
memory dump: for every piece it picks the orientation and column with the
best field after the drop (lines, height, holes, bumpiness), turns and moves
the piece there and drops it or lets it fall; now and then it presses a key
at random (``1`` preview, ``0`` help, ``4`` level, others). After ``--pieces``
pieces it drops every piece at once, so the game ends. Same seed, same run.

The trace (gzip JSON) holds the configuration, the steps, the lines typed,
the keys deposited and the whole terminal output with instruction times;
tools/matchgame.mjs plays it back through the converted game.
"""
import argparse, gzip, json, os, random, shlex, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdp11emu import Pdp11Emu, TTO_TIME_9600

R5 = 0o32636
GLOBALS = (R5, R5 + 0o2216)
SEED, JSW = 0o1036, 0o44
BREAKS = {0o1000: 'readCharSeed', 0o13310: 'levelRead', 0o7544: 'spawnPiece',
          0o12522: 'readKey', 0o17014: 'gameOver'}
LINE_POLL = 0o26466


def word(mem, offset):
    return mem[offset] | mem[offset + 1] << 8


def s16(v):
    return v - 0x10000 if v & 0x8000 else v


class Bot:
    """Picks keys from the program's own state (offsets from R5)."""

    def __init__(self, rng, pieces, style='safe', after_drop=0.0, preview=0.0):
        self.rng = rng
        self.quota = pieces
        self.style = style
        self.after_drop = after_drop
        self.preview = preview
        self.spawned = 0
        self.level_ups = 0
        self.dropped = False

    def shape(self, mem, k):
        a = 0o26 + 16 * k
        return [s16(word(mem, a + 2 * i)) for i in range(8)]

    def fits(self, field, shape, x, y):
        for i in range(4):
            cx, cy = x + shape[i], y + shape[4 + i]
            if not (0 <= cx < 12 and 0 <= cy < 22) or field[cx][cy]:
                return False
        return True

    def score(self, field, shape, x, y):
        cells = [(x + shape[i], y + shape[4 + i]) for i in range(4)]
        f = [col[:] for col in field]
        for cx, cy in cells:
            f[cx][cy] = 1
        full = [r for r in range(1, 21) if all(f[c][r] for c in range(1, 11))]
        heights, holes = [], 0
        for c in range(1, 11):
            rows = [r for r in range(1, 21) if f[c][r] and r not in full]
            top = min(rows) if rows else 21
            heights.append(21 - top)
            holes += sum(1 for r in range(top, 21) if not f[c][r] and r not in full)
        bump = sum(abs(heights[i] - heights[i + 1]) for i in range(9))
        lines = len(full)
        # keep the last column for the I piece: four lines at once now and then
        well = heights[9] * 0.3
        if self.style == 'tetris':
            well = heights[9] * 3.0
            if 0 < lines < 4 and max(heights) < 12:
                lines = -lines
            bump = sum(abs(heights[i] - heights[i + 1]) for i in range(8))
        return lines * abs(lines) * 0.9 - sum(heights) * 0.51 - holes * 0.8 - bump * 0.18 - well

    def key(self, mem):
        key = self.choose(mem)
        self.dropped = key in (' ', '5') or (self.dropped and key not in ('7', '9', '8'))
        return key

    def choose(self, mem):
        if self.dropped and self.rng.random() < self.after_drop:
            # the bug of the original: a move after the drop
            return self.rng.choice('79')
        if self.rng.random() < self.preview:
            return '1'
        field = [[mem[0o530 + 22 * c + r] for r in range(22)] for c in range(12)]
        current, x, y = word(mem, 0o1242), s16(word(mem, 0o1250)), s16(word(mem, 0o1252))
        r = self.rng.random()
        if r < 0.02:
            return self.rng.choice('10263x')
        if r < 0.025 and self.level_ups < 2 and s16(word(mem, 0o1332)) < 9:
            self.level_ups += 1
            return '4'
        if self.spawned > self.quota:
            return self.rng.choice(' 5')
        if r < 0.25:
            return None
        # orientations reachable by turning
        chain, k = [], current
        while k not in chain:
            chain.append(k)
            k = word(mem, 2 * k - 2)
        best = None
        for turns, k in enumerate(chain):
            shape = self.shape(mem, k)
            for tx in range(1, 11):
                if not self.fits(field, shape, tx, y):
                    continue
                ty = y
                while self.fits(field, shape, tx, ty + 1):
                    ty += 1
                value = self.score(field, shape, tx, ty)
                if best is None or value > best[0]:
                    best = (value, turns, tx)
        if best is None:
            return None
        _, turns, tx = best
        if turns:
            return '8'
        if x < tx:
            return '9'
        if x > tx:
            return '7'
        return self.rng.choice(' 5') if self.rng.random() < 0.5 else None


def dump(emu):
    mem = emu.memory(*GLOBALS)
    return mem, emu.memory(SEED, SEED), emu.memory(JSW, JSW)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--games', type=int, default=2)
    ap.add_argument('--levels', help='comma-separated levels, one per game (default: random)')
    ap.add_argument('--names', help='comma-separated names, one per game; \\x7f rubs out')
    ap.add_argument('--pieces', type=int, default=80, help='pieces played well before the bot gives up')
    ap.add_argument('--style', choices=('safe', 'tetris'), default='safe', help='tetris: keep a well for four lines at once')
    ap.add_argument('--after-drop', type=float, default=0.0, help='probability of a move right after a drop')
    ap.add_argument('--preview', type=float, default=0.0, help='probability of the preview key at a readKey')
    ap.add_argument('--tto-time', type=int, default=TTO_TIME_9600)
    ap.add_argument('--limit', type=int, default=3_000_000_000, help='instructions at most')
    ap.add_argument('-o', required=True, help='trace (.json.gz)')
    ap.add_argument('--verbose', action='store_true', help='every stop to stderr')
    args = ap.parse_args()

    rng = random.Random(args.seed)
    levels = [int(v) for v in args.levels.split(',')] if args.levels else None
    names = args.names.encode('latin-1').decode('unicode_escape').split(',') if args.names else None
    emu = Pdp11Emu(tto_time=args.tto_time)
    steps, lines, prev = [], [], None
    try:
        emu.start()
        emu.type('RUN DL1:TET\r')
        start = emu.now
        for pc in BREAKS:
            emu.command('break %o' % pc)
        game, bot = 0, None
        reads = 0
        while emu.now - start < args.limit:
            pc = emu.run_to_break(args.limit)
            if pc is None:
                raise SystemExit('no breakpoint within the limit')
            point = BREAKS[pc] if pc in BREAKS else 'linePoll'
            if args.verbose:
                print('%10d %06o %s' % (emu.now - start, pc, point), file=sys.stderr)
            if point == 'linePoll':
                # the Pascal runtime reads a line: the name, then the answer
                emu.command('nobreak %o' % LINE_POLL)
                for b in BREAKS:
                    emu.command('nobreak %o' % b)
                if reads == 0:
                    text = names[game] if names else rng.choice(['ivan', 'test%d' % game, '', 'pajitnov'])
                    kind = 'name'
                else:
                    text = 'da' if game + 1 < args.games else 'net'
                    kind = 'answer'
                # RT-11 takes line mode over at a .TTYIN, and its echo jumps
                # ahead of output still queued: type when the prompt is out
                emu.run(rng.randrange(60000, 120000))
                emu.type(text + '\r')
                lines.append({'kind': kind, 'game': game, 'text': (text + '\r').encode('latin-1').hex()})
                for b in BREAKS:
                    emu.command('break %o' % b)
                reads += 1
                if kind == 'answer':
                    game += 1
                    if game == args.games:
                        emu.run(3_000_000)
                        break
                else:
                    emu.command('break %o' % LINE_POLL)
                continue
            mem, seed, jsw = dump(emu)
            step = {'point': point, 'time': emu.now - start,
                    'seed': word(seed, 0), 'jsw': word(jsw, 0)}
            if prev is None:
                step['mem'] = mem.hex()
            else:
                step['diff'] = [[i, '%02x' % b] for i, b in enumerate(mem) if b != prev[i]]
            prev = mem
            if point == 'readCharSeed':
                bot = Bot(rng, args.pieces, args.style, args.after_drop, args.preview)
                level = levels[game] if levels else rng.randrange(10)
                emu.run(rng.randrange(60000, 200000))
                text = '%d\r' % level
                emu.type(text)
                step['line'] = text.encode('latin-1').hex()
                lines.append({'kind': 'level', 'game': game, 'text': step['line']})
            elif point == 'spawnPiece':
                bot.spawned += 1
            elif point == 'readKey':
                key = bot.key(mem)
                if key:
                    emu.type(key)
                    step['key'] = '%02x' % ord(key)
                    # the input interrupt comes before the first instruction of
                    # readKey and returns to it: without this the breakpoint
                    # would stop the same call again
                    emu.command('nobreak %o' % pc)
                    if emu.step_to_break(300) is not None:
                        raise SystemExit('a breakpoint right after a key')
                    emu.command('break %o' % pc)
            elif point == 'gameOver':
                reads = 0
                emu.command('break %o' % LINE_POLL)
            steps.append(step)
        emu.check_time()
        trace = {
            'simulator': 'SIMH PDP-11 3.8', 'cpu': emu.cpu, 'clockHz': emu.clock_hz,
            'ttoTime': args.tto_time, 'command': shlex.join(['tracegame.py'] + sys.argv[1:]),
            'r5': R5, 'globals': list(GLOBALS), 'start': start, 'end': emu.now,
            'steps': steps, 'lines': lines, 'keys': emu.keys, 'output': emu.output,
        }
        with gzip.open(args.o, 'wt') as f:
            json.dump(trace, f, separators=(',', ':'))
        counts = {}
        for s in steps:
            counts[s['point']] = counts.get(s['point'], 0) + 1
        print('%s: %d steps %s, %d keys, %d instructions, output %d bytes'
              % (args.o, len(steps), counts, sum(1 for s in steps if 'key' in s),
                 emu.now - start, len(emu.screen_bytes())))
    finally:
        emu.close()


if __name__ == '__main__':
    main()
