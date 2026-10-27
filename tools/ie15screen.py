#!/usr/bin/env python3
"""Shows terminal output of the original on the emulated 15IE-00-013 terminal.

Usage: ie15screen.py TRACE.json|RAW.bin -o SHOT.png [--seconds N] [--baud 9600]

Starts MAME's ``ie15`` system (the terminal with its own firmware, character
ROM and beeper) headless and in real time, connects its RS-232 port through
``null_modem`` to a local socket and sends the program's output byte by byte
at the line rate. When MAME exits it saves a snapshot of the screen
(800 x 300: status line on top, 80 x 24 characters in 10 x 11 cells), which is
copied to the output path.

Needs MAME (``mame``) and the ROM sets in ``sources/rom``: ``ie15.zip`` and
the keyboard set, which MAME 0.264 looks up as ``ie15kbd.zip``.
"""
import argparse, json, os, shutil, socket, subprocess, sys, tempfile, threading, time

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROMS = os.path.join(PROJECT, 'sources', 'rom')


def load(path):
    if path.endswith('.json'):
        trace = json.load(open(path))
        return b''.join(bytes.fromhex(h) for _, h in trace['output'])
    return open(path, 'rb').read()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('input')
    ap.add_argument('-o', required=True)
    ap.add_argument('--seconds', type=int, help='emulated seconds (default: transfer time + 5)')
    ap.add_argument('--baud', type=int, default=9600)
    args = ap.parse_args()

    data = load(args.input)
    gap = 10.0 / args.baud            # 8N1 = 10 bits a byte
    seconds = args.seconds or int(len(data) * gap) + 8
    work = tempfile.mkdtemp(prefix='ie15screen-')
    try:
        shutil.copy(os.path.join(ROMS, 'ie15.zip'), work)
        shutil.copy(os.path.join(ROMS, 'ie15_keyboard.zip'), os.path.join(work, 'ie15kbd.zip'))
        server = socket.socket()
        server.bind(('127.0.0.1', 0))
        server.listen(1)
        port = server.getsockname()[1]

        def feed():
            conn, _ = server.accept()
            # let the terminal firmware come up
            time.sleep(2)
            start = time.time()
            for i, b in enumerate(data):
                conn.sendall(bytes([b]))
                while time.time() < start + (i + 1) * gap:
                    pass
            try:
                while conn.recv(4096):
                    pass
            except OSError:
                pass

        threading.Thread(target=feed, daemon=True).start()
        cmd = ['mame', 'ie15', '-rompath', work,
               '-rs232', 'null_modem', '-bitb', 'socket.127.0.0.1:%d' % port,
               '-video', 'none', '-sound', 'none', '-seconds_to_run', str(seconds),
               '-snapshot_directory', os.path.join(work, 'snap'),
               '-cfg_directory', os.path.join(work, 'cfg'),
               '-nvram_directory', os.path.join(work, 'nvram'),
               '-skip_gameinfo', '-noreadconfig']
        result = subprocess.run(cmd, cwd=work, capture_output=True, text=True)
        shot = os.path.join(work, 'snap', 'ie15', '0000.png')
        if result.returncode or not os.path.exists(shot):
            sys.exit('mame failed: ' + result.stdout[-500:] + result.stderr[-500:])
        shutil.copy(shot, args.o)
        print('%d bytes at %d Bd, %d s emulated -> %s' % (len(data), args.baud, seconds, args.o))
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main()
