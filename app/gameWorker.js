// begin code

/**
 * Tetris 1984 game worker — the computer. It runs the game program and sends
 * what it writes down the line to the terminal, and takes the bytes of the
 * terminal's keyboard as its input (R-061); the model is the terminal.
 *
 * **Play** (`mode: 'play'`, M2): TET.SAV converted routine for routine
 * (app/tetrisLogic.js, `matchgame` against the original) under a model of
 * RT-11's terminal handler (app/rt11Host.js: `.TTYIN`, echo in line mode,
 * line editing). The program is a generator that yields where the original
 * spins:
 *
 * - `delay` — the busy wait of the fall: it first waits until the terminal
 *   has sent everything (TPS), then counts `outer` × `inner`;
 * - `idle` — a `.TTYIN` that found nothing: the worker resumes it when a key
 *   is there, with the number of polls in between (the seed of the level
 *   prompt counts them);
 * - `exit` — the program ended: RT-11's prompt, and the model goes back to
 *   the menu (`exit`); a line typed at the prompt (RETURN) would run it again
 *   as `RUN DL1:TET` does, with the table of results emptied by initTables.
 *
 * R The start is the one of the machine: the screen of a terminal just
 * switched on, RT-11's prompt `.`, and `RUN DL1:TET` (or `RUN DL1:TETRIS`)
 * typed at it at a human pace and echoed by RT-11 (`RUN_KEY_MS`); the
 * program starts when RETURN hands the line over. The command is the one of
 * the guide the original was found by (lab.dyne.org/OriginalTetrisHowto,
 * ★ runs in SIMH); the pace of typing is not measured.
 *
 * R The clock (placeholder for the time model of M3): `instructionsPerMs`
 * from the model; ★ a pass of the delay's inner loop is 3 instructions
 * (TST, BPL, SOB) and of the outer 2 more; ★ a poll of the level prompt is
 * about 131 instructions (8 prompts in tools/tracegame.py); the line takes
 * 10 bits a byte at 9600 baud. The rest of the program's work is not
 * counted yet.
 *
 * **The table of results** is the original's own, 20 entries of 20 bytes in
 * the program's memory (`1376(R5)`), emptied by `initTables` when the program
 * starts. The worker fills it from the database (`results`, the best 20
 * games of `db/hallOfFame.php`) after the program's first step — initTables
 * is behind it — so the original shows, sorts and extends it with its own
 * code. R Before the table is shown at the end of a game the program
 * yields `results` (only with the name of the menu, `TetrisLogic.playerName`):
 * the worker asks the model for the table of the server (`resultsNeeded`),
 * so other players' games are in it, writes it over the memory and lets the
 * program go on — at once when it comes, after `RESULTS_WAIT_MS` with the
 * table it has when it does not. A game the original put into the table is
 * the entry that changed after that (`gameResult`).
 *
 * **Replay** (`mode: 'replay'`, M1, `?devRun=`): runs of the original
 * recorded in SIMH (app/recordedRuns.js) played back by their instruction
 * times; keys are counted, nothing more.
 *
 * Messages in: `init` {initData: {mode, revision, echo, playerName (16 bytes
 * or null), runs, run, instructionsPerMs}}, `input` {bytes}, `results` {entries: [{name (16
 * bytes), level, score}]}, `pause`, `continue`, `reset`.
 * Messages out: `frame` {pass, run, reset, bytes, special} once a tick when
 * there is something to send, and every second when there is not (R-045
 * counts them) — `special` is whether RT-11 hands the keys over one by one
 * (JSW bit 12, the play) or by lines (the prompts); `exit` when the program
 * has ended;
 * `gameResult` {name (16 bytes), level, score} when a game got into the table;
 * `resultsNeeded` when the program waits for a fresh table.
 */

// the version the application was started with rides on this worker's URL
// and goes on to the scripts it pulls in (dev mode serves app/ file by file)
var workerVersion = (self.location && self.location.search) || '';
importScripts('programTexts.js'+workerVersion, 'rt11Host.js'+workerVersion, 'tetrisLogic.js'+workerVersion);

// 50 Hz; the line and the terminal do not care, the counter of R-045 does
var TICK_MS = 20;
// replay: the pause between two runs, in ms
var RUN_GAP_MS = 3000;
// ★ instructions of one poll of readCharSeed (tools/tracegame.py, 8 prompts)
var POLL_INSTRUCTIONS = 131;
// ★ the delay loop (003044): TST/BPL/SOB inside, MOV/SOB outside
var INNER_INSTRUCTIONS = 3;
var OUTER_INSTRUCTIONS = 2;
// 10 bits a byte at 9600 baud
var BYTE_MS = 10*1000/9600;
// ★ the table of results: entry i (1..20) at 1352(R5) + 20 × i, 20 bytes —
// name[16], level, score (disasm_notes.md §2)
var TABLE_ENTRIES = 20;
var ENTRY_BYTES = 20;
var NAME_BYTES = 16;
// R the start at the prompt: a pause before the first key and between two
var RUN_FIRST_KEY_MS = 700;
var RUN_KEY_MS = 140;
// R how long the end of a game waits for the server's table
var RESULTS_WAIT_MS = 2000;

var state = null;
var timer = false;
var lastTime = false;

function reset() {
  if (timer !== false) {
    clearTimeout(timer);
    timer = false;
  }
  lastTime = false;
  state = {
    running: false,
    paused: false,
    mode: 'play',
    instructionsPerMs: 250,
    pass: 0,
    idleTicks: 0,
    pendingReset: false,
    bytes: [],
    // play
    revision: 'TET',
    echo: true,
    // R the name of the menu, 16 bytes, or null for the original's question
    playerName: null,
    host: null,
    logic: null,
    program: null,
    clock: 0,
    waiting: null,
    wakeAt: 0,
    idleSince: 0,
    lineFreeAt: 0,
    exited: false,
    // the command typed at RT-11's prompt: the bytes left and when the next one comes
    typing: [],
    typeAt: 0,
    started: false,
    // the table of results: what the database has, whether it is still to be
    // written into this run of the program, and the table at game over
    results: null,
    resultsDue: false,
    resultsFresh: false,
    resultsAskedAt: 0,
    tableAtGameOver: null,
    // replay
    runs: [],
    run: 0,
    chunk: 0,
    hostTime: 0,
    gapLeft: 0,
    inputBytes: 0
  };
} // reset

// play

function startProgram() {
  state.host = new Rt11Host({echo: state.echo});
  state.logic = new TetrisLogic(state.host, ProgramTexts[state.revision] || ProgramTexts.TET);
  state.logic.playerName = state.playerName;
  state.program = state.logic.main();
  state.logic.hook = (name) => {
    if (name == 'gameOver') {
      state.tableAtGameOver = tableSnapshot();
    }
  };
  state.waiting = null;
  state.exited = false;
  state.lineFreeAt = state.clock;
  // initTables empties the table on every start, RUN after RUN
  state.resultsDue = true;
  state.tableAtGameOver = null;
} // startProgram

/** the address of entry i (1..20) of the original's table of results */
function tableAddress(i) {
  return TetrisLogic.R5+0o1352+ENTRY_BYTES*i;
} // tableAddress

/** the database's best games into the empty table, as the original stores them */
function writeResults() {
  var mem = state.logic.mem;
  var entries = state.results || [];
  for (var i = 0; i < TABLE_ENTRIES; i++) {
    var base = tableAddress(i+1);
    if (i >= entries.length) {
      // ★ an empty entry has a space for its first character (initTables)
      mem[base] = 0x20;
      continue;
    }
    var name = entries[i].name || [];
    for (var c = 0; c < NAME_BYTES; c++) {
      mem[base+c] = c < name.length ? name[c] & 0xff : 0x20;
    }
    state.logic.ww(base+NAME_BYTES, entries[i].level);
    state.logic.ww(base+NAME_BYTES+2, entries[i].score);
  }
  state.resultsDue = false;
  state.resultsFresh = false;
} // writeResults

/** the table as it stands, to find the game the original puts into it */
function tableSnapshot() {
  return state.logic.mem.slice(tableAddress(1), tableAddress(TABLE_ENTRIES+1));
} // tableSnapshot

/**
 * After game over: when the original has put the game into the table, the
 * first entry that differs from the table at game over is the new one (those
 * above it stay, those below move down).
 */
function checkGameResult() {
  var before = state.tableAtGameOver;
  var mem = state.logic.mem;
  var from = tableAddress(1);
  for (var i = 0; i < before.length; i++) {
    if (mem[from+i] != before[i]) {
      var base = from+i-i%ENTRY_BYTES;
      state.tableAtGameOver = null;
      postMessage({
        id: 'gameResult',
        name: Array.from(mem.slice(base, base+NAME_BYTES)),
        level: state.logic.rw(base+NAME_BYTES),
        score: state.logic.rw(base+NAME_BYTES+2)
      });
      return;
    }
  }
} // checkGameResult

/**
 * The terminal just switched on: RT-11's prompt and the command typed at it;
 * the program starts when the line ends (runProgram).
 */
function startAtPrompt() {
  state.host = new Rt11Host({echo: state.echo});
  state.exited = true;
  state.started = false;
  state.host.out(0o56);
  var command = 'RUN DL1:'+state.revision+'\r';
  state.typing = command.split('').map((c) => c.charCodeAt(0));
  state.typeAt = state.clock+RUN_FIRST_KEY_MS;
} // startAtPrompt

/** the command at the prompt, a key at a time */
function typeCommand() {
  while (state.typing.length && state.clock >= state.typeAt) {
    state.host.type(state.typing.shift());
    state.typeAt += RUN_KEY_MS;
  }
} // typeCommand

/** what the program and RT-11 wrote goes to the line */
function collectOutput() {
  var bytes = state.host.takeOutput();
  if (bytes.length) {
    state.bytes = state.bytes.concat(bytes);
    state.lineFreeAt = Math.max(state.lineFreeAt, state.clock)+bytes.length*BYTE_MS;
  }
} // collectOutput

/** runs the program until it waits for something that is not there yet */
function runProgram() {
  typeCommand();
  // RT-11 echoes a key when it comes, not when the program reads it: a digit
  // typed at the level prompt shows before RETURN hands the line over
  collectOutput();
  for (var guard = 0; guard < 1000; guard++) {
    var resume;
    if (state.exited) {
      if (!state.host.hasInput()) {
        return;
      }
      startProgram();
      state.started = true;
    } else if (state.waiting == 'delay') {
      if (state.clock < state.wakeAt) {
        return;
      }
    } else if (state.waiting == 'results') {
      if (state.resultsFresh) {
        writeResults();
        state.tableAtGameOver = tableSnapshot();
      } else if (state.clock-state.resultsAskedAt < RESULTS_WAIT_MS) {
        return;
      }
    } else if (state.waiting == 'idle') {
      if (!state.host.hasInput()) {
        return;
      }
      // the polls that found nothing in between, besides the one that yielded
      resume = Math.max(0, Math.floor((state.clock-state.idleSince)*state.instructionsPerMs/POLL_INSTRUCTIONS)-1);
    }
    state.waiting = null;
    var step = state.program.next(resume);
    collectOutput();
    if (state.resultsDue && state.results) {
      writeResults();
    }
    if (state.tableAtGameOver) {
      checkGameResult();
    }
    if (step.done || step.value.id == 'exit') {
      // RT-11's prompt; the next key runs the program again
      state.exited = true;
      state.host.ready = [];
      state.host.out(0o15);
      state.host.out(0o12);
      state.host.out(0o56);
      collectOutput();
      postMessage({id: 'exit'});
      return;
    }
    if (step.value.id == 'delay') {
      var outer = step.value.outer || 0x10000;
      var inner = step.value.inner || 0x10000;
      var instructions = outer*(inner*INNER_INSTRUCTIONS+OUTER_INSTRUCTIONS);
      state.waiting = 'delay';
      state.wakeAt = Math.max(state.clock, state.lineFreeAt)+instructions/state.instructionsPerMs;
    } else if (step.value.id == 'results') {
      state.waiting = 'results';
      state.resultsFresh = false;
      state.resultsAskedAt = state.clock;
      postMessage({id: 'resultsNeeded'});
    } else if (step.value.id == 'idle') {
      state.waiting = 'idle';
      state.idleSince = state.clock;
    }
  }
} // runProgram

// replay

function hexBytes(hex) {
  var bytes = new Array(hex.length/2);
  for (var i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i*2, 2), 16);
  }
  return bytes;
} // hexBytes

function startRun(index) {
  state.run = state.runs.length ? index%state.runs.length : 0;
  state.chunk = 0;
  state.hostTime = 0;
  state.gapLeft = 0;
  state.pendingReset = true;
} // startRun

function replay(elapsedMs) {
  var run = state.runs[state.run];
  if (!run) {
    return;
  }
  if (state.gapLeft > 0) {
    state.gapLeft -= elapsedMs;
    if (state.gapLeft <= 0) {
      startRun(state.run+1);
    }
    return;
  }
  state.hostTime += elapsedMs*state.instructionsPerMs;
  while (state.chunk < run.output.length && run.output[state.chunk][0] <= state.hostTime) {
    state.bytes = state.bytes.concat(hexBytes(run.output[state.chunk][1]));
    state.chunk++;
  }
  if (state.chunk >= run.output.length && state.hostTime >= run.length) {
    state.gapLeft = RUN_GAP_MS;
  }
} // replay

/**
 * One tick: the clock moves on by the real time that passed, the computer
 * does what it would have done by then, and what it wrote goes out.
 * @param {number} elapsedMs - Real time since the last tick.
 */
function pass(elapsedMs) {
  state.pass++;
  state.clock += elapsedMs;
  if (state.mode == 'replay') {
    replay(elapsedMs);
  } else {
    runProgram();
  }
  state.idleTicks++;
  if (state.bytes.length || state.pendingReset || state.idleTicks >= 1000/TICK_MS) {
    postMessage({id: 'frame', pass: state.pass, run: state.run, reset: state.pendingReset, bytes: state.bytes,
      special: !!(state.host && (state.host.jsw & 0o10000))});
    state.bytes = [];
    state.pendingReset = false;
    state.idleTicks = 0;
  }
} // pass

function schedule() {
  if (!state.running || state.paused) {
    return;
  }
  timer = setTimeout(() => {
    var now = Date.now();
    if (lastTime === false) {
      lastTime = now;
    }
    // never run away after a stall: at most a quarter of a second at once
    pass(Math.min(now-lastTime, 250));
    lastTime = now;
    schedule();
  }, TICK_MS);
} // schedule

onmessage = function(event) {
  var message = event.data;
  switch (message.id) {

    case 'init':
      reset();
      var initData = message.initData || {};
      state.mode = initData.mode || 'play';
      state.instructionsPerMs = initData.instructionsPerMs || state.instructionsPerMs;
      if (state.mode == 'replay') {
        state.runs = initData.runs || [];
        startRun(initData.run || 0);
      } else if (state.mode == 'play') {
        state.revision = initData.revision || 'TET';
        state.echo = initData.echo !== false;
        state.playerName = initData.playerName || null;
        state.pendingReset = true;
        startAtPrompt();
      } else {
        postMessage({id: 'error', message: 'gameWorker: unknown mode "'+state.mode+'"'});
        return;
      }
      state.running = true;
      schedule();
      break;

    case 'input':
      var bytes = message.bytes || [];
      if (state.mode == 'play' && state.host) {
        for (var i = 0; i < bytes.length; i++) {
          state.host.type(bytes[i]);
        }
      } else {
        state.inputBytes += bytes.length;
      }
      break;

    case 'results':
      state.results = message.entries || [];
      state.resultsFresh = true;
      break;

    case 'pause':
      state.paused = true;
      if (timer !== false) {
        clearTimeout(timer);
        timer = false;
      }
      break;

    case 'continue':
      if (state.paused) {
        state.paused = false;
        lastTime = false;
        schedule();
      }
      break;

    case 'reset':
      reset();
      break;
  }
}; // onmessage

reset();
