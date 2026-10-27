#!/usr/bin/env node
/**
 * matchgame — the converted game against whole games of the original.
 *
 * The acceptance tool of M2. For every trace of `tools/tracegame.py`
 * (`sources/media/trace/*.json.gz`) it runs `app/tetrisLogic.js` — the game's
 * own code, a classic script loaded through `classicScript.cjs` — with the
 * RT-11 model `app/rt11Host.js`, gives it the same input at the same places,
 * and compares:
 *
 * - **the globals byte for byte** (R5 .. R5+2216: shapes and rotations, the
 *   field, the VT52 strings, the counts of rows, piece, position, level,
 *   score, the table of results), the seed and the JSW, at every step the
 *   original stopped at (readCharSeed, levelRead, spawnPiece, readKey,
 *   gameOver);
 * - **the terminal output**, the whole byte stream: what the program wrote
 *   and what RT-11 echoed, from the program's first byte (ETB) on.
 *
 * Input: a key the bot deposited at a readKey breakpoint is typed at the
 * same readKey; the level line is typed at the first poll of readCharSeed,
 * which then counts the polls the original counted (the seed); the name and
 * the answer are typed when the Pascal runtime first polls for a line.
 *
 *     tools/matchgame.mjs                      # all traces in sources/media/trace/
 *     tools/matchgame.mjs TRACE.json.gz --verbose --stop
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { loadClassicScript } = require('../app/svision/tools/classicScript.cjs');

const ROOT = new URL('..', import.meta.url).pathname;
const TetrisLogic = loadClassicScript(ROOT+'app/tetrisLogic.js');
const Rt11Host = loadClassicScript(ROOT+'app/rt11Host.js');
const ProgramTexts = loadClassicScript(ROOT+'app/programTexts.js');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const stop = args.includes('--stop');
let files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  const dir = ROOT+'sources/media/trace/';
  files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json.gz')).sort().map((f) => dir+f) : [];
}
if (!files.length) {
  console.error('matchgame: no traces (tools/tracegame.py -o sources/media/trace/NAME.json.gz)');
  process.exit(2);
}

const hex = (h) => Uint8Array.from(Buffer.from(h, 'hex'));
const oct = (v, w) => v.toString(8).padStart(w || 6, '0');

function matchTrace(file) {
  const trace = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
  const [from, to] = trace.globals;
  const host = new Rt11Host({echo: true});
  const logic = new TetrisLogic(host, ProgramTexts.TET);

  const result = {file, steps: 0, checks: 0, diffs: 0, output: 0, outputDiffs: 0, first: null};
  let expected = null;
  let index = 0;
  let pendingLevel = null;
  const lines = trace.lines.filter((l) => l.kind != 'level');
  let lineIndex = 0;
  const typeHex = (h) => { for (const b of hex(h)) { host.type(b); } };
  const report = (text) => {
    result.diffs++;
    if (!result.first) {
      result.first = text;
    }
    if (verbose && result.diffs <= 40) {
      console.log('  '+text);
    }
  };

  logic.hook = (name) => {
    const step = trace.steps[index];
    if (!step) {
      throw new Error('the remake goes on past the last step of the original ('+name+')');
    }
    if (step.point != name) {
      throw new Error('step '+index+': the original is at '+step.point+', the remake at '+name);
    }
    if (step.mem) {
      expected = hex(step.mem);
    } else {
      expected = Uint8Array.from(expected);
      for (const [i, b] of step.diff) {
        expected[i] = parseInt(b, 16);
      }
    }
    for (let i = 0; i < expected.length; i++) {
      result.checks++;
      if (logic.mem[from+i] != expected[i]) {
        report('step '+index+' '+name+': R5+'+oct(i, 4)+' remake '+oct(logic.mem[from+i], 3)+' original '+oct(expected[i], 3));
      }
    }
    result.checks += 2;
    if (logic.rw(TetrisLogic.SEED) != step.seed) {
      report('step '+index+' '+name+': seed remake '+logic.rw(TetrisLogic.SEED)+' original '+step.seed);
    }
    if (logic.rw(TetrisLogic.JSW) != step.jsw) {
      report('step '+index+' '+name+': JSW remake '+oct(logic.rw(TetrisLogic.JSW))+' original '+oct(step.jsw));
    }
    if (name == 'readCharSeed') {
      pendingLevel = {line: step.line, seed: trace.steps[index+1].seed};
    } else if (name == 'readKey' && step.key) {
      host.type(parseInt(step.key, 16));
    }
    index++;
    result.steps++;
    if (stop && result.diffs) {
      throw new Error('stopped at the first difference');
    }
  };

  // coverage: what the games went through
  const cov = result.coverage = {pieces: {}, cleared: {}, turnsBlocked: 0, movesAfterDrop: 0, levelUps: 0, previews: 0, negativeScore: 0};
  const wrap = (name, before) => {
    const original = logic[name];
    logic[name] = function(...a) { before.apply(this, a); return original.apply(this, a); };
  };
  let dropped = false;
  wrap('spawnPiece', function() { const k = this.rw(this.g(0o1244)); cov.pieces[k] = (cov.pieces[k] || 0)+1; dropped = false; });
  wrap('dropPiece', function() { dropped = true; });
  wrap('move', function(dx) { if (dropped && this.fits(this.rw(this.g(0o1250))+dx, this.rw(this.g(0o1252)))) { cov.movesAfterDrop++; } });
  wrap('rotatePiece', function() {
    const saved = this.rw(this.g(0o526));
    this.ww(this.g(0o526), this.shapeAddress(this.rw(this.g(0)+2*this.rw(this.g(0o1242))-2)));
    if (!this.fits(this.rw(this.g(0o1250)), this.rw(this.g(0o1252)))) { cov.turnsBlocked++; }
    this.ww(this.g(0o526), saved);
  });
  wrap('levelUp', function() { cov.levelUps++; });
  wrap('showPreview', function() { cov.previews++; });
  const clearLines = logic.clearLines;
  logic.clearLines = function() {
    const before = this.rw(this.g(0o1346));
    clearLines.call(this);
    const n = this.rw(this.g(0o1346))-before;
    if (n) { cov.cleared[n] = (cov.cleared[n] || 0)+1; }
    const score = this.rw(this.g(0o1334));
    if (score & 0x8000) { cov.negativeScore++; } else { cov.maxScore = Math.max(cov.maxScore || 0, score); }
  };

  const run = logic.main();
  let resume;
  for (;;) {
    const r = run.next(resume);
    resume = undefined;
    if (r.done || r.value.id == 'exit') {
      break;
    }
    if (r.value.id == 'idle') {
      if (r.value.where == 'readCharSeed' && pendingLevel) {
        // the first poll found nothing: the rest of the polls the original counted
        typeHex(pendingLevel.line);
        resume = pendingLevel.seed-2;
        pendingLevel = null;
      } else if (r.value.where == 'readLine' && lineIndex < lines.length) {
        typeHex(lines[lineIndex++].text);
      } else {
        throw new Error('the remake waits for input the original did not get ('+r.value.where+', step '+index+')');
      }
    }
  }
  if (index != trace.steps.length) {
    report('the remake ended after '+index+' of '+trace.steps.length+' steps');
  }

  // the terminal: from the program's first byte (ETB) on
  let original = Buffer.concat(trace.output.map(([, h]) => Buffer.from(h, 'hex')));
  original = original.subarray(original.indexOf(0o27));
  const remake = Buffer.from(host.output);
  result.output = remake.length;
  let at = 0;
  while (at < remake.length && remake[at] == original[at]) {
    at++;
  }
  if (at < remake.length) {
    result.outputDiffs = 1;
    const show = (b) => JSON.stringify(b.subarray(Math.max(0, at-24), at+24).toString('latin1'));
    report('output differs at byte '+at+' of '+remake.length+':\n    remake   '+show(remake)+'\n    original '+show(original));
  }
  // what the original wrote after the remake's last byte: RT-11 after the exit
  result.tail = original.subarray(remake.length).toString('latin1');
  return result;
}

let failed = 0;
let total = {steps: 0, checks: 0, diffs: 0, output: 0};
for (const file of files) {
  let r;
  try {
    r = matchTrace(file);
  } catch (e) {
    console.log(file.replace(ROOT, '')+': '+e.message);
    failed++;
    continue;
  }
  for (const k of Object.keys(total)) {
    total[k] += r[k];
  }
  const c = r.coverage;
  if (c) {
    console.log('  pieces '+JSON.stringify(c.pieces)+', lines cleared at once '+JSON.stringify(c.cleared)
      +', turns blocked '+c.turnsBlocked+', moves after a drop '+c.movesAfterDrop+', level ups '+c.levelUps+', previews '+c.previews
      +', negative score '+c.negativeScore+' pieces, best score '+(c.maxScore || 0));
  }
  console.log(file.replace(ROOT, '')+': '+r.steps+' steps / '+r.checks+' checks / '+r.diffs+' differences, output '+r.output+' bytes'
    +(r.first && !verbose ? '\n  first: '+r.first : '')+(verbose ? '\n  after the exit: '+JSON.stringify(r.tail) : ''));
  if (r.diffs) {
    failed++;
  }
}
console.log('matchgame: '+files.length+' games / '+total.steps+' steps / '+total.checks+' checks, output '+total.output+' bytes / '+total.diffs+' differences');
process.exit(failed ? 1 : 0);
