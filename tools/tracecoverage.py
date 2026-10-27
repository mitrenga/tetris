#!/usr/bin/env python3
"""Plays the original with seeded random keys and records executed PCs.

Usage: tracecoverage.py [--seed N] [--games N] [--every N] [--every-max N]
                        [--keyset KEYS] [--tto-time N] [-o pcs.txt] [--trace T.json]

Runs TET.SAV in the SIMH wrapper, answers the level prompt, presses a
random game key (7 9 8 4 5 1 0 space) every N instructions, types a name
when the game asks for one and answers the "another game?" prompt with
yes until the last game, then no. The PCs of every executed instruction
(SIMH CPU history) are written with their counts, as input for the
disassembler's --coverage. --trace saves the run itself (terminal output
with instruction times and the keys) in the format of pdp11emu.py; without
-o the run skips the CPU history and is about 40 times faster. Same seed,
same run.

For playback recordings rather than coverage: ``--keyset`` limits the keys
(``--keyset ''`` plays no key at all, the pieces just fall), ``--every-max``
spreads the pauses between keys at random up to that many instructions (a
human pace rather than a machine gun), and ``--tto-time`` gives the console
the speed of a real line (``pdp11emu.TTO_TIME_9600``).
"""
import argparse, json, os, random, shlex, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdp11emu import Pdp11Emu, TTO_TIME_9600

# prompts as the program writes them (KOI-7, lower-case Latin = Cyrillic)
LEVEL_PROMPT = b'wa{ urowenx?'       # ВАШ УРОВЕНЬ?
NAME_PROMPT = b'wa{e imq?'           # ВАШЕ ИМЯ?
AGAIN_PROMPT = b'e}e parti`?'        # ЕЩЕ ПАРТИЮ?
GAME_KEYS = '7984510 '


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--games', type=int, default=2)
    ap.add_argument('--every', type=int, default=40000, help='instructions between keys')
    ap.add_argument('--every-max', type=int, help='pauses drawn between --every and this (default: exactly --every)')
    ap.add_argument('--keyset', default=GAME_KEYS, help='the keys pressed during a game (empty: none)')
    ap.add_argument('--tto-time', type=int, help='instructions per output character (%d = 9600 Bd)' % TTO_TIME_9600)
    ap.add_argument('--limit', type=int, default=200_000_000, help='instructions per game at most')
    ap.add_argument('--levels', help='comma-separated levels to answer, one per game (default: random)')
    ap.add_argument('-o', help='executed PCs file (enables CPU history)')
    ap.add_argument('--trace', help='trace JSON of the whole run')
    args = ap.parse_args()

    rng = random.Random(args.seed)
    emu = Pdp11Emu(tto_time=args.tto_time)
    try:
        emu.start()
        if args.o:
            emu.record_coverage()
        start = emu.now
        levels = [int(x) for x in args.levels.split(',')] if args.levels else None
        emu.type('RUN DL1:TET\r')
        for game in range(args.games):
            if not emu.run_until(LEVEL_PROMPT, 5_000_000):
                raise SystemExit('no level prompt')
            level = levels[game] if levels else rng.randrange(10)
            emu.type('%d\r' % level)
            mark = len(emu.output)
            spent = 0
            while spent < args.limit:
                pause = rng.randint(args.every, args.every_max) if args.every_max else args.every
                emu.run(pause)
                spent += pause
                if NAME_PROMPT in b''.join(bytes.fromhex(h) for _, h in emu.output[mark:]):
                    break
                if args.keyset:
                    emu.type(rng.choice(args.keyset))
            else:
                raise SystemExit('game %d did not end' % game)
            emu.type('test%d\r' % game)
            if not emu.run_until(AGAIN_PROMPT, 20_000_000):
                raise SystemExit('no "another game" prompt')
            emu.type('da\r' if game + 1 < args.games else 'net\r')
        emu.run(2_000_000)
        if args.o:
            with open(args.o, 'w') as f:
                f.write('# executed PC (octal) and count: tracecoverage.py --seed %d --games %d --every %d\n'
                        % (args.seed, args.games, args.every))
                for pc in sorted(emu.pcs):
                    f.write('%06o %d\n' % (pc, emu.pcs[pc]))
        if args.trace:
            emu.check_time()
            with open(args.trace, 'w') as f:
                json.dump({'simulator': 'SIMH PDP-11 3.8', 'cpu': emu.cpu, 'clockHz': emu.clock_hz,
                           'chunk': emu.chunk, 'snapshot': os.path.relpath(emu.snapshot, os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                           'ttoTime': args.tto_time or 100,
                           'command': shlex.join(['tracecoverage.py'] + sys.argv[1:]),
                           'start': start, 'end': emu.now, 'output': emu.output, 'keys': emu.keys}, f)
        print('instructions %d, PCs %d, output %d bytes'
              % (emu.now - start, len(emu.pcs or {}), len(emu.screen_bytes())))
    finally:
        emu.close()


if __name__ == '__main__':
    main()
