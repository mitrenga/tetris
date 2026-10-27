#!/usr/bin/env python3
"""Headless SIMH PDP-11 wrapper for tracing the original Tetris.

Runs the SIMH PDP-11 simulator (``pdp11``, SIMH 3.8) with RT-11 on RL02
disks and drives its control console through pexpect. A run is
repeatable by construction:

- It starts from a snapshot taken at the RT-11 prompt (``--make-snapshot``),
  so every run begins in the same machine state. Booting itself runs
  freely and is not repeatable, which is why it is done once.
- The simulator only advances by ``step N``. Time is the SIMH instruction
  counter. Everything the program writes to the terminal during a step is
  stamped with the counter at the end of that step.
- Terminal output is read from the simulator's own stdout (console in 8-bit
  mode). SIMH switches the tty to raw mode while simulating, so the bytes
  are exactly what the program wrote.
- Keys are not typed into SIMH, whose keyboard polling follows host time.
  Each key is deposited into the console receiver (TTI buffer, DONE and
  interrupt request) while the simulator is stopped, after the previous key
  has been consumed.
- The speed of the line is SIMH's own: the console output unit takes
  ``TIME`` instructions per character, 100 by default. ``tto_time``
  (``--tto-time``) sets it; ``TTO_TIME_9600`` is a 9600 baud line at the
  assumed speed of the processor (R, see there). RT-11 waits when its output
  ring is full, so a program that writes a lot is slowed down by the line,
  as on the real terminal.

As a module:

    emu = Pdp11Emu()
    emu.start()                      # restores the snapshot
    emu.type(b'RUN DL1:TET\\r')
    emu.run(2_000_000)
    print(emu.screen_bytes())
    emu.close()

From the command line:

    pdp11emu.py --make-snapshot
    pdp11emu.py [--command 'RUN DL1:TET'] [--keys FILE] [--steps N]
                [--chunk N] [--memory] [--out TRACE.json]

The keys file has one event per line: ``<instructions after the command>
<text>``, the text may use ``\\r``, ``\\n``, ``\\e`` and ``\\xHH``. The trace
is JSON: configuration, start time, every output chunk ``[time, hex]``, the
keys as deposited ``[time, hex]``, final registers and optionally memory
0-157777 (base64).
"""
import argparse, base64, collections, json, os, re, shutil, sys, tempfile, time

import pexpect

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DISKS = os.path.join(PROJECT, 'sources', 'disk')
DEFAULT_RL0 = os.path.join(DISKS, 'rl0.dsk')
DEFAULT_RL1 = os.path.join(DISKS, 'games.dsk')
DEFAULT_SNAPSHOT = os.path.join(PROJECT, 'sources', 'emu', 'rt11prompt.sim')
# R a 9600 baud line in instructions: 10 bits a character (start, 8 data,
# stop) is 1.0417 ms, at the assumed 250 instructions per ms of the
# Elektronika 60 (app/gameModel.js INSTRUCTIONS_PER_MS) 260 instructions
TTO_TIME_9600 = 260

STEP_END = re.compile(rb'\r\nStep expired, PC: [^\r\n]*\r\n$')
BREAK_END = re.compile(rb'\r\nBreakpoint, PC: ([0-7]+) [^\r\n]*\r\n$')
HISTORY_PC = re.compile(rb'\s*([0-7]{6}) [0-7]{6}\|')


class Pdp11Emu:
    """One SIMH PDP-11 process."""

    def __init__(self, rl0=DEFAULT_RL0, rl1=DEFAULT_RL1, snapshot=DEFAULT_SNAPSHOT,
                 cpu='11/03', clock_hz=50, chunk=10000, key_poll=100, tto_time=None):
        self.cpu = cpu
        self.tto_time = tto_time
        self.clock_hz = clock_hz
        self.chunk = chunk
        self.key_poll = key_poll
        self.snapshot = os.path.abspath(snapshot)
        self.work = tempfile.mkdtemp(prefix='pdp11emu-')
        # RT-11 writes to its system disk; the originals in sources/ stay untouched.
        # The snapshot refers to the disks by these names.
        self.disks = {}
        for unit, path in (('rl0', rl0), ('rl1', rl1)):
            if path:
                copy = os.path.join(self.work, unit + '.dsk')
                shutil.copyfile(path, copy)
                self.disks[unit] = copy
        self.output = []
        self.keys = []
        self.now = 0
        self.pcs = None
        self.sim = None

    # simulator control

    def command(self, line, timeout=60):
        """Sends one command to the sim> prompt and returns its output as bytes."""
        self.sim.sendline(line.encode('latin-1'))
        self.sim.expect(b'sim> ', timeout=timeout)
        text = self.sim.before
        # the echoed command is the first line
        return text.split(b'\r\n', 1)[1] if b'\r\n' in text else b''

    def spawn(self):
        self.sim = pexpect.spawn('pdp11', cwd=self.work, timeout=60)
        # pexpect waits 50 ms before every send by default; a run is thousands of steps
        self.sim.delaybeforesend = None
        self.sim.expect(b'sim> ')
        self.command('set cpu ' + self.cpu)
        self.command('set clk %dhz' % self.clock_hz)
        for unit, path in self.disks.items():
            self.command('set %s rl02' % unit)
            self.command('attach %s %s' % (unit, os.path.basename(path)))

    def make_snapshot(self, prompt=b'\r\n.', timeout=60):
        """Boots RT-11 from RL0, stops at the monitor prompt and saves the state."""
        self.spawn()
        self.sim.sendline(b'boot rl0')
        self.sim.expect(re.escape(prompt), timeout=timeout)
        # let the monitor settle in its keyboard wait
        time.sleep(0.5)
        self.sim.sendcontrol('e')
        self.sim.expect(b'sim> ')
        os.makedirs(os.path.dirname(self.snapshot), exist_ok=True)
        self.command('save ' + self.snapshot)

    def start(self):
        """Restores the snapshot taken at the RT-11 prompt."""
        if not os.path.exists(self.snapshot):
            raise FileNotFoundError(self.snapshot + ' (run with --make-snapshot first)')
        self.spawn()
        self.command('restore ' + self.snapshot)
        # console in 8-bit mode: 7p (the default) drops ESC and DEL
        self.command('set tto 8b')
        if self.tto_time:
            self.command('deposit tto time %d' % self.tto_time)
        self.now = self.time()

    def time(self):
        """SIMH simulated time = instructions executed."""
        return int(re.search(rb'Time:\s*(\d+)', self.command('show time')).group(1))

    def check_time(self):
        """Verifies the own instruction counter against SIMH."""
        actual = self.time()
        if actual != self.now:
            raise RuntimeError('time drift: counter %d, SIMH %d' % (self.now, actual))
        return actual

    def step(self, n):
        """Executes n instructions and records what the program printed."""
        text = self.command('step %d' % n)
        m = STEP_END.search(text)
        if not m:
            raise RuntimeError('simulation stopped: %r' % text[-200:])
        self.now += n
        data = text[:m.start()]
        if data:
            self.output.append((self.now, data.hex()))
        if self.pcs is not None:
            for line in self.command('show cpu history=%d' % n).split(b'\n'):
                m = HISTORY_PC.match(line)
                if m:
                    self.pcs[int(m.group(1), 8)] += 1

    def step_to_break(self, n):
        """Executes up to n instructions, stopping at a breakpoint.

        Returns the PC of the breakpoint, or None when the step expired. SIMH
        resumes past a breakpoint it stopped at, so calling again goes on.
        """
        text = self.command('step %d' % n)
        m = STEP_END.search(text)
        pc = None
        if m:
            self.now += n
        else:
            m = BREAK_END.search(text)
            if not m:
                raise RuntimeError('simulation stopped: %r' % text[-200:])
            self.now = self.time()
            pc = int(m.group(1), 8)
        data = text[:m.start()]
        if data:
            self.output.append((self.now, data.hex()))
        return pc

    def run_to_break(self, limit):
        """Runs until a breakpoint, at most limit instructions; its PC or None."""
        done = 0
        while done < limit:
            start = self.now
            pc = self.step_to_break(min(self.chunk, limit - done))
            if pc is not None:
                return pc
            done += self.now - start
        return None

    def record_coverage(self):
        """Counts every executed PC from now on (SIMH CPU history)."""
        self.command('set cpu history=%d' % max(64, self.chunk))
        self.pcs = collections.Counter()

    def run(self, instructions):
        """Executes instructions in steps of self.chunk."""
        left = instructions
        while left > 0:
            n = min(left, self.chunk)
            self.step(n)
            left -= n

    def run_until(self, pattern, limit):
        """Runs until the output produced from now on contains pattern."""
        mark = len(self.output)
        done = 0
        while done < limit:
            self.step(self.chunk)
            done += self.chunk
            if pattern in b''.join(bytes.fromhex(h) for _, h in self.output[mark:]):
                return True
        return False

    # terminal

    def flag(self, name):
        return int(re.search(rb':\s*(\d+)', self.command('examine tti ' + name)).group(1))

    def type(self, data):
        """Deposits keys into the console receiver, one after another."""
        if isinstance(data, str):
            data = data.encode('latin-1')
        for b in data:
            while self.flag('done'):
                self.step(self.key_poll)
            self.command('deposit tti buf %o' % b)
            self.command('deposit tti done 1')
            if self.flag('ie'):
                self.command('deposit tti int 1')
            self.keys.append((self.now, '%02x' % b))

    def screen_bytes(self):
        return b''.join(bytes.fromhex(h) for _, h in self.output)

    # machine state

    def registers(self):
        regs = {}
        for line in self.command('examine state').decode('latin-1').splitlines():
            m = re.match(r'\s*(\S+):\s+(\S+)', line)
            if m:
                regs[m.group(1)] = m.group(2)
        return regs

    def memory(self, lo=0, hi=0o157776):
        """Reads memory words lo..hi (byte addresses) as little-endian bytes."""
        data = bytearray()
        text = self.command('examine %o-%o' % (lo, hi), timeout=120)
        for line in text.decode('latin-1').splitlines():
            m = re.match(r'\s*([0-7]+):\s+([0-7]+)', line)
            if m:
                data += int(m.group(2), 8).to_bytes(2, 'little')
        return bytes(data)

    def deposit(self, address, word):
        self.command('deposit %o %o' % (address, word))

    def save(self, path):
        self.command('save ' + os.path.abspath(path))

    def close(self):
        if self.sim is not None and self.sim.isalive():
            try:
                self.sim.sendline(b'exit')
                self.sim.expect(pexpect.EOF, timeout=5)
            except pexpect.ExceptionPexpect:
                self.sim.terminate(force=True)
        shutil.rmtree(self.work, ignore_errors=True)


def unescape(text):
    return text.replace('\\e', '\\x1b').encode('latin-1').decode('unicode_escape').encode('latin-1')


def read_keys(path):
    events = []
    for line in open(path, encoding='utf-8'):
        line = line.rstrip('\n')
        if not line.strip() or line.startswith('#'):
            continue
        at, _, text = line.partition(' ')
        events.append((int(at), unescape(text)))
    return sorted(events, key=lambda e: e[0])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--rl0', default=DEFAULT_RL0)
    ap.add_argument('--rl1', default=DEFAULT_RL1)
    ap.add_argument('--snapshot', default=DEFAULT_SNAPSHOT)
    ap.add_argument('--make-snapshot', action='store_true', help='boot RT-11 and save the snapshot')
    ap.add_argument('--command', default='RUN DL1:TET', help='typed at the RT-11 prompt')
    ap.add_argument('--keys', help='key events file')
    ap.add_argument('--steps', type=int, default=20_000_000, help='instructions after the command')
    ap.add_argument('--chunk', type=int, default=10000, help='instructions per step')
    ap.add_argument('--memory', action='store_true', help='add memory 0-157777 to the trace')
    ap.add_argument('--coverage', help='write executed PCs with counts (octal) to this file')
    ap.add_argument('--out', help='trace JSON (default: summary only)')
    ap.add_argument('--tto-time', type=int, help='instructions per output character (SIMH default 100; %d = 9600 Bd)' % TTO_TIME_9600)
    args = ap.parse_args()

    emu = Pdp11Emu(args.rl0, args.rl1, args.snapshot, chunk=args.chunk, tto_time=args.tto_time)
    try:
        if args.make_snapshot:
            emu.make_snapshot()
            print('snapshot', args.snapshot)
            return
        emu.start()
        if args.coverage:
            emu.record_coverage()
        emu.type(args.command + '\r')
        t0 = emu.now
        for at, data in read_keys(args.keys) if args.keys else []:
            if t0 + at > emu.now:
                emu.run(t0 + at - emu.now)
            emu.type(data)
        if t0 + args.steps > emu.now:
            emu.run(t0 + args.steps - emu.now)
        emu.check_time()
        trace = {
            'simulator': 'SIMH PDP-11 3.8',
            'cpu': emu.cpu, 'clockHz': emu.clock_hz, 'chunk': emu.chunk,
            'ttoTime': emu.tto_time or 100,
            'snapshot': os.path.relpath(emu.snapshot, PROJECT),
            'command': args.command, 'start': t0, 'end': emu.now,
            'output': emu.output, 'keys': emu.keys,
            'registers': emu.registers(),
        }
        if args.memory:
            trace['memory'] = base64.b64encode(emu.memory()).decode('ascii')
        if args.out:
            with open(args.out, 'w') as f:
                json.dump(trace, f, indent=1)
        if args.coverage:
            with open(args.coverage, 'w') as f:
                f.write('# executed PC (octal) and count, %s\n' % args.command)
                for pc in sorted(emu.pcs):
                    f.write('%06o %d\n' % (pc, emu.pcs[pc]))
        print('instructions %d, output %d bytes in %d chunks, keys %d'
              % (emu.now - t0, len(emu.screen_bytes()), len(emu.output), len(emu.keys)))
    finally:
        emu.close()


if __name__ == '__main__':
    main()
