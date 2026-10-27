// classic script (importScripts): no import, no export - R-001, R-048.
// begin code

/**
 * Tetris 1984 — the game program `TET.SAV`, converted **routine for routine**
 * from its disassembly (sources/asm/main.asm, sources/docs/disasm_notes.md).
 *
 * ★ The program is Pascal compiled for RT-11. Its globals live in a block the
 * main program allocates and holds in R5; here they live **at the original's
 * addresses** in a 64 K array `mem` (R5 = 032636), together with the
 * generator's seed at 001036, the job status word at 000044 and the texts of
 * the program image (app/programTexts.js). Every routine reads and writes the
 * bytes its original does — the for-loop variable at 1374(R5) and the two
 * VT52 strings the piece is drawn and erased with included — so
 * tools/matchgame.mjs compares the whole block with the original's after
 * every step. Locals on the stack of the original are plain JS variables.
 *
 * What the computer around the program does is not here: RT-11's terminal
 * handler (`.TTYIN`, the echo, line editing) is the host (app/rt11Host.js),
 * and time is the worker's. The program talks to them through:
 *
 * - `host.ttyin(jsw)`: one `.TTYIN` without waiting (JSW bit 6 is set in the
 *   image), a byte or -1;
 * - `host.out(byte)`: what the Pascal runtime writes to the terminal;
 * - `yield`: the places where the original spins — `{id: 'delay', outer,
 *   inner}` for the busy wait of the fall (`003044`), `{id: 'idle'}` for a
 *   `.TTYIN` poll that found nothing (the value the host resumes with is the
 *   number of further polls that found nothing, which the seed counts), and
 *   `{id: 'exit'}` when the program ends.
 *
 * `playerName` (null by default — the original) is the remake's option for
 * the table of results, **R** (operator 2026-10-27): 16 bytes of a name
 * typed in the menu. With it highScores does not ask for the name and
 * writes it between SI and SO, so it shows in Latin in a table the original
 * prints after SO, which would show any letter as Cyrillic. Before the
 * table it yields `{id: 'results'}`, so that the worker can bring the table
 * up to date from the server (other players' games). Nothing else changes;
 * the match tools leave it null.
 *
 * `hook(name)` is called where the trace of the original stops
 * (tools/tracegame.py): the entries of readCharSeed, spawnPiece, readKey and
 * gameOver, and after the level is read (`levelRead`), for the match tool;
 * the game leaves it empty.
 *
 * Runtime routines of the Pascal system (writing a string, a number, a new
 * line; integer multiply, div and mod; reading a line of the terminal file)
 * are modelled by what they do, not by their code (disasm_notes.md §1).
 *
 * Free of DOM dependencies (R-001).
 */
class TetrisLogic {

  /** ★ R5 of the original in the run under RT-11 V05.03 (disasm_notes.md §1) */
  static get R5() { return 0o32636; }
  /** ★ the random seed word, inside the program (`001036`) */
  static get SEED() { return 0o1036; }
  /** ★ the job status word of RT-11 */
  static get JSW() { return 0o44; }
  /** the block compared by the match tool: the globals, 2222₈ bytes from R5-4 */
  static get GLOBALS_FROM() { return TetrisLogic.R5; }
  static get GLOBALS_TO() { return TetrisLogic.R5+0o2216; }

  /**
   * @param {Object} host - `ttyin(jsw)` and `out(byte)` (app/rt11Host.js).
   * @param {Object} texts - One revision of app/programTexts.js
   *   (`ProgramTexts.TET` or `ProgramTexts.TETRIS`).
   */
  constructor(host, texts) {
    this.host = host;
    this.mem = new Uint8Array(0x10000);
    this.hook = null;
    /** R the name of the menu instead of the original's question (see the class) */
    this.playerName = null;
    for (var t = 0; t < texts.texts.length; t++) {
      var address = texts.texts[t][0];
      var hex = texts.texts[t][1];
      for (var i = 0; i < hex.length/2; i++) {
        this.mem[address+i] = parseInt(hex.substr(i*2, 2), 16);
      }
    }
    // ★ the JSW of the image (no-wait .TTYIN); the runtime start adds 060000
    this.ww(TetrisLogic.JSW, 0o100);
    // the terminal file of the Pascal runtime: one line at a time
    this.inLine = null;
    this.inPos = 0;
  } // constructor

  // memory

  rb(a) { return this.mem[a]; }
  wb(a, v) { this.mem[a] = v & 0xff; }
  rw(a) { return this.mem[a] | (this.mem[a+1] << 8); }
  ww(a, v) { this.mem[a] = v & 0xff; this.mem[a+1] = (v >> 8) & 0xff; }
  /** a global: the address of n(R5) */
  g(n) { return TetrisLogic.R5+n; }
  /** a word as a signed 16-bit number */
  static s16(v) { v &= 0xffff; return v & 0x8000 ? v-0x10000 : v; }
  /** a byte as MOVB reads it into a register: sign-extended */
  static s8(v) { v &= 0xff; return v & 0x80 ? v-0x100 : v; }

  hookAt(name) {
    if (this.hook) {
      this.hook(name);
    }
  } // hookAt

  // the Pascal runtime: output

  /** rtWriteChar (`021076`) with field width 0 */
  writeChar(value) {
    this.host.out(value & 0xff);
  } // writeChar

  /** rtWriteString (`021216`): `length` bytes from `address`, field = length */
  writeString(address, length) {
    for (var i = 0; i < length; i++) {
      this.host.out(this.mem[(address+i) & 0xffff]);
    }
  } // writeString

  /** writeln (`021160`) */
  writeln() {
    this.host.out(0o15);
    this.host.out(0o12);
  } // writeln

  /**
   * write(value: width) for an integer (`020562`): signed decimal,
   * right-justified with spaces, never cut.
   */
  writeInt(value, width) {
    value = TetrisLogic.s16(value);
    var text = String(Math.abs(value));
    if (value < 0) {
      text = '-'+text;
    }
    for (var pad = width-text.length; pad > 0; pad--) {
      this.host.out(0x20);
    }
    for (var i = 0; i < text.length; i++) {
      this.host.out(text.charCodeAt(i));
    }
  } // writeInt

  // the Pascal runtime: integer arithmetic

  /** rtMultiply (`021416`): the low word of an unsigned product */
  static mul(a, b) { return ((a & 0xffff)*(b & 0xffff)) & 0xffff; }
  /** `021504`: signed multiply */
  static smul(a, b) { return (TetrisLogic.s16(a)*TetrisLogic.s16(b)) & 0xffff; }
  /** `021436` div and `021462` mod: unsigned (the dividend is not sign-extended) */
  static udiv(a, b) { return Math.floor((a & 0xffff)/b) & 0xffff; }
  static umod(a, b) { return ((a & 0xffff)%b) & 0xffff; }
  /** `021532` div and `021564` mod: signed, truncated */
  static sdiv(a, b) { return Math.trunc(TetrisLogic.s16(a)/TetrisLogic.s16(b)) & 0xffff; }
  static smod(a, b) { return (TetrisLogic.s16(a)%TetrisLogic.s16(b)) & 0xffff; }

  // the Pascal runtime: the terminal file (line mode)

  /**
   * Gets the next line of the terminal file (`026302`-`026522`): the runtime
   * clears JSW bit 12 (the file is not in special mode), so RT-11 hands out
   * the line only when it is complete, and reads it with .TTYIN up to LF.
   */
  *fillLine() {
    var jsw = this.rw(TetrisLogic.JSW);
    this.ww(TetrisLogic.JSW, jsw & ~0o10000);
    var line = [];
    for (;;) {
      var value = this.host.ttyin(this.rw(TetrisLogic.JSW));
      if (value < 0) {
        yield {id: 'idle', where: 'readLine'};
        continue;
      }
      if (value == 0o32) {
        break;
      }
      line.push(value);
      if (value == 0o12 || line.length >= 132) {
        break;
      }
    }
    this.inLine = line;
    this.inPos = 0;
  } // fillLine

  *fileChar() {
    if (this.inLine === null) {
      yield* this.fillLine();
    }
    return this.inPos < this.inLine.length ? this.inLine[this.inPos] : 0o15;
  } // fileChar

  static isEoln(value) { return value == 0o15 || value == 0o12; }

  /**
   * read(packed array[1..n] of char) (`020316`): padded with spaces at the
   * end of the line. The array is a local of the original, so it comes back
   * rather than going to `mem`.
   */
  *readString(length) {
    var text = [];
    for (var i = 0; i < length; i++) {
      var value = yield* this.fileChar();
      if (TetrisLogic.isEoln(value)) {
        text.push(0x20);
      } else {
        text.push(value);
        this.inPos++;
      }
    }
    return text;
  } // readString

  /** read(ch) (`020422`): a space at the end of the line */
  *readChar() {
    var value = yield* this.fileChar();
    if (TetrisLogic.isEoln(value)) {
      return 0x20;
    }
    this.inPos++;
    return value;
  } // readChar

  /** readln (`020532`): the rest of the line goes */
  *readln() {
    yield* this.fileChar();
    this.inLine = null;
  } // readln

  // the game, routine by routine

  /** `001000` readCharSeed: waits for a key; the number of polls is the seed */
  *readCharSeed(address) {
    this.hookAt('readCharSeed');
    var polls = 0;
    var value;
    for (;;) {
      polls = (polls+1) & 0xffff;
      value = this.host.ttyin(this.rw(TetrisLogic.JSW));
      if (value >= 0) {
        break;
      }
      polls = (polls+((yield {id: 'idle', where: 'readCharSeed'}) || 0)) & 0xffff;
    }
    this.wb(address, value);
    this.ww(TetrisLogic.SEED, polls);
    while (this.host.ttyin(this.rw(TetrisLogic.JSW)) >= 0) {
    }
  } // readCharSeed

  /** `001054` random(n): seed = (seed × 13077 + 6925) mod 32768, trunc(seed / 32768.0 × n) */
  random(n) {
    var seed = (TetrisLogic.mul(this.rw(TetrisLogic.SEED), 13077)+6925) & 0x7fff;
    this.ww(TetrisLogic.SEED, seed);
    // ★ FIS: seed/32768.0 is exact and seed × n fits the 24-bit mantissa
    return Math.floor(seed*n/32768);
  } // random

  /** `001234` gotoXY(column, row) */
  gotoXY(column, row) {
    this.writeChar(0o33);
    this.writeChar(0o131);
    this.writeChar(row+0o40);
    this.writeChar(column+0o40);
  } // gotoXY

  /** `001332`: ESC H ESC J */
  clearScreen() {
    this.writeChar(0o33);
    this.writeChar(0o110);
    this.writeChar(0o33);
    this.writeChar(0o112);
  } // clearScreen

  /**
   * `001404`: asks for the name and shows the table of results, the new
   * one inserted (20 entries of 20 bytes from 1376(R5): name, level, score).
   * R With `playerName` the question is left out and the names are written
   * in SI (see the class).
   */
  *highScores(score, level) {
    var g = (n) => this.g(n);
    var latin = this.playerName !== null;
    var record;
    if (latin) {
      this.writeChar(0o16);
      while (this.host.ttyin(this.rw(TetrisLogic.JSW)) >= 0) {
      }
      // R the worker may write a fresher table into the memory here
      yield {id: 'results'};
      record = this.playerName.slice(0, 16).concat([0, 0, 0, 0]);
    } else {
      this.gotoXY(0, 0o17);
      this.writeChar(0o16);
      this.writeString(0o2770, 9);
      while (this.host.ttyin(this.rw(TetrisLogic.JSW)) >= 0) {
      }
      // the new record: name[16], level, score
      record = (yield* this.readString(16)).concat([0, 0, 0, 0]);
      yield* this.readln();
    }
    var c;
    // R the name in Latin: SI before it, SO after it
    var nameShift = (code) => {
      if (latin) {
        this.writeChar(code);
      }
    };
    record[16] = level & 0xff; record[17] = (level >> 8) & 0xff;
    record[18] = score & 0xff; record[19] = (score >> 8) & 0xff;
    this.clearScreen();
    this.writeString(0o3002, 2);
    this.writeChar(this.rb(g(0o1337)));
    this.writeChar(this.rb(g(0o1337)));
    this.writeString(0o3006, 24);
    this.writeln();

    var entry = (i) => g(0o1352)+TetrisLogic.mul(i, 0o24);
    var printEntry = (base) => {
      this.writeChar(this.rb(g(0o1337)));
      this.writeChar(this.rb(g(0o1337)));
      nameShift(0o17);
      this.writeString(base, 16);
      nameShift(0o16);
      this.writeChar(0x20);
      this.writeInt(this.rw(base+0o20), 1);
      this.writeChar(0x20);
      this.writeInt(this.rw(base+0o22), 5);
    };
    var i = 1;
    // ★ the scores compare unsigned (BHI), and entry 20 is never shown
    while (this.rw(entry(i)+0o22) > score && i < 20 && this.rb(entry(i)) != 0x20) {
      printEntry(entry(i));
      this.writeln();
      i++;
    }
    if (record[0] != 0x20) {
      this.writeChar(this.rb(g(0o1337)));
      this.writeChar(this.rb(g(0o1337)));
      nameShift(0o17);
      for (c = 0; c < 16; c++) {
        this.host.out(record[c]);
      }
      nameShift(0o16);
      this.writeChar(0x20);
      this.writeInt(level, 1);
      this.writeChar(0x20);
      this.writeInt(score, 5);
      this.writeString(0o3040, 3);
      this.writeln();
      for (var j = 19; j >= i; j--) {
        var to = entry(j+1);
        var from = entry(j);
        for (c = 0; c < 20; c++) {
          this.mem[to+c] = this.mem[from+c];
        }
      }
      for (c = 0; c < 20; c++) {
        this.mem[entry(i)+c] = record[c];
      }
      i++;
    }
    for (; i < 20; i++) {
      if (this.rb(entry(i)) != 0x20) {
        printEntry(entry(i));
        this.writeln();
      }
    }
    this.writeChar(0o17);
  } // highScores

  /**
   * `003136` (nested in initTables): a piece turned by a quarter, (dx, dy) →
   * (dy, −dx). Returns the 8 words dx[1..4], dy[1..4].
   */
  static turn(shape) {
    var out = new Array(8);
    for (var k = 0; k < 4; k++) {
      out[k] = shape[4+k];
      out[4+k] = (-TetrisLogic.s16(shape[k])) & 0xffff;
    }
    return out;
  } // turn

  /** the 8 words of orientation k: dx[1..4], dy[1..4] at 26(R5) + 16 × k */
  shapeAddress(k) { return this.g(0o26)+((k << 4) & 0xffff); }
  readShape(k) {
    var a = this.shapeAddress(k);
    var shape = [];
    for (var i = 0; i < 8; i++) {
      shape.push(this.rw(a+2*i));
    }
    return shape;
  } // readShape
  writeShape(k, shape) {
    var a = this.shapeAddress(k);
    for (var i = 0; i < 8; i++) {
      this.ww(a+2*i, shape[i]);
    }
  } // writeShape

  /** `003330`: the shapes and rotations, the limits of the levels, the two VT52 strings, the empty table */
  initTables() {
    var g = (n) => this.g(n);
    var i, j, a;
    // O
    a = this.shapeAddress(1);
    for (i = 1; i <= 4; i++) {
      this.ww(a+6+2*i, TetrisLogic.sdiv(i, 3));
      this.ww(a-2+2*i, -(i & 1));
    }
    // I, L, T, J: three cells in a row and the fourth
    for (j = 1; j <= 4; j++) {
      a = this.shapeAddress(j+3);
      for (var m = 1; m <= 3; m++) {
        this.ww(a+6+2*m, 0);
        this.ww(a-2+2*m, m-2);
      }
      this.ww(a+0o16, 1);
      this.ww(a+6, j-3);
    }
    // I lies flat; S and Z are T with one cell moved down
    this.ww(g(0o144), 0);
    this.writeShape(2, this.readShape(6));
    this.ww(g(0o76), 1);
    this.writeShape(3, this.readShape(6));
    this.ww(g(0o122), 1);
    this.ww(g(0), 1);
    // S, Z, I: two orientations
    for (i = 2; i <= 4; i++) {
      this.writeShape(i+6, TetrisLogic.turn(this.readShape(i)));
      this.ww(g(0)+2*i-2, i+6);
      this.ww(g(0)+2*(i+6)-2, i);
    }
    // L, T, J: four
    for (i = 1; i <= 3; i++) {
      var shape = this.readShape(i+4);
      this.ww(g(0)+2*(i+4)-2, TetrisLogic.smul(i, 3)+8);
      for (j = 1; j <= 3; j++) {
        shape = TetrisLogic.turn(shape);
        var k = TetrisLogic.smul(i, 3)+7+j;
        this.writeShape(k, shape);
        this.ww(g(0)+2*k-2, k+1);
      }
      this.ww(g(0)+2*(TetrisLogic.smul(i, 3)+10)-2, i+4);
    }
    // the limits of full lines a level: 5, 15, ... 95
    for (i = 0; i <= 9; i++) {
      this.ww(g(0o1350)+2*i, TetrisLogic.smul(i, 10)+5);
    }
    // the erase (1144) and draw (1202) strings: 4 × ESC Y row column + cell, then home
    var escY = this.rb(g(0o1336))+0o54400;
    for (i = 1; i <= 4; i++) {
      var o = TetrisLogic.mul(i, 6);
      this.ww(g(0o1136)+o, escY);
      this.ww(g(0o1174)+o, escY);
      this.ww(g(0o1142)+o, 0o27040);
      // ★ the cell of the draw string is an immediate operand (TET: DEL DEL, TETRIS: [])
      this.ww(g(0o1200)+o, this.rw(0o5306));
    }
    this.ww(g(0o1174), escY);
    this.ww(g(0o1232), escY);
    this.ww(g(0o1176), 0o20040);
    this.ww(g(0o1234), 0o20040);
    this.ww(g(0o1200), 0o6415);
    this.ww(g(0o1236), 0o6415);
    this.ww(g(0o1140), g(0o1144));
    this.ww(g(0o1142), g(0o1202));
    // the table of results: empty names
    for (i = 1; i <= 20; i++) {
      this.wb(g(0o1352)+TetrisLogic.mul(i, 0o24), 0x20);
    }
  } // initTables

  /** `005556` hidePreview */
  hidePreview() {
    var esc = this.rb(this.g(0o1336));
    this.writeChar(esc);
    this.writeChar(0o131);
    this.writeChar(0o53);
    this.writeChar(0o60);
    this.writeString(0o5752, 8);
    this.writeChar(esc);
    this.writeChar(0o131);
    this.writeChar(0o54);
    this.writeChar(0o60);
    this.writeString(0o5764, 8);
  } // hidePreview

  /** `005776` showPreview: the next piece beside the field, score − 5 */
  showPreview() {
    this.hidePreview();
    var a = this.shapeAddress(this.rw(this.g(0o1244)));
    for (var i = 1; i <= 4; i++) {
      this.writeChar(this.rb(this.g(0o1336)));
      this.writeChar(0o131);
      this.writeChar(this.rw(a+6+2*i)+0o53);
      this.writeChar(TetrisLogic.mul(this.rw(a-2+2*i), 2)+0o64);
      this.writeString(0o6244, 2);
    }
    this.ww(this.g(0o1334), this.rw(this.g(0o1334))-5);
  } // showPreview

  /** the cell of the field: 530(R5) + 22 × column + row */
  cell(column, row) { return this.g(0o530)+TetrisLogic.mul(column, 0o26)+row; }

  /** `006250` newGame: the field with its walls, the counts of rows, score, the next piece */
  newGame() {
    var g = (n) => this.g(n);
    var i, j;
    for (i = 1; i <= 10; i++) {
      for (j = 1; j <= 20; j++) {
        this.wb(this.cell(i, j), 0);
      }
    }
    for (i = 1; i <= 10; i++) {
      this.wb(this.cell(i, 0), 1);
      this.wb(this.cell(i, 0o25), 1);
    }
    for (j = 0; j <= 0o25; j++) {
      this.wb(g(0o530)+j, 1);
      this.wb(g(0o1112)+j, 1);
    }
    for (j = 0; j <= 0o24; j++) {
      this.ww(g(0o1260)+2*j, 0);
    }
    this.ww(g(0o1334), 0);
    this.ww(g(0o1244), this.random(7)+1);
    this.wb(g(0o1246), 0);
    this.ww(g(0o1346), 0);
  } // newGame

  /** `007020` redrawRows(from, to) */
  redrawRows(from, to) {
    for (var row = TetrisLogic.s16(from); row <= TetrisLogic.s16(to); row++) {
      this.gotoXY(0o33, row);
      for (var column = 1; column <= 10; column++) {
        this.writeString(this.rb(this.cell(column, row) & 0xffff) ? 0o7310 : 0o7314, 2);
      }
    }
  } // redrawRows

  /** `007320` fits(column, row): the four cells of the current orientation are free */
  fits(column, row) {
    var a = this.rw(this.g(0o526));
    for (var k = 1; k <= 4; k++) {
      var x = (column+this.rw(a-2+2*k)) & 0xffff;
      var y = (row+this.rw(a+6+2*k)) & 0xffff;
      if (this.rb((this.g(0o530)+TetrisLogic.mul(x, 0o26)+y) & 0xffff)) {
        return false;
      }
    }
    return true;
  } // fits

  /** a position of the VT52 strings: low byte the row, high byte the column, as characters */
  position(a, k) {
    var g = (n) => this.g(n);
    var row = (this.rw(g(0o1252))+0o40+this.rw(a+6+2*k)) & 0xffff;
    var column = ((this.rw(g(0o1250))+this.rw(a-2+2*k)) & 0xffff)*2+0o71;
    return (((column & 0xff) << 8)+row) & 0xffff;
  } // position

  /** for k := 1 to 4 over the global 1374(R5), the way the original leaves it */
  forPiece(body) {
    for (var k = 1; k <= 4; k++) {
      this.ww(this.g(0o1374), k);
      body(TetrisLogic.mul(k, 6));
    }
    this.ww(this.g(0o1374), 5);
  } // forPiece

  eraseString() { this.writeString(this.rw(this.g(0o1140)), 0o36); }
  drawString() { this.writeString(this.rw(this.g(0o1142)), 0o36); }

  /** `007544` spawnPiece: the next piece at column 6, row 1; false when it does not fit */
  spawnPiece() {
    var g = (n) => this.g(n);
    this.hookAt('spawnPiece');
    this.ww(g(0o1242), this.rw(g(0o1244)));
    this.ww(g(0o1244), this.random(7)+1);
    this.ww(g(0o526), this.shapeAddress(this.rw(g(0o1242))));
    this.ww(g(0o1250), 6);
    this.ww(g(0o1252), 1);
    var result = this.fits(6, 1);
    var a = this.rw(g(0o526));
    this.forPiece((o) => {
      var k = this.rw(g(0o1374));
      this.ww(g(0o1176)+o, this.position(a, k));
      this.ww(g(0o1140)+o, this.rw(g(0o1176)+o));
    });
    this.drawString();
    if (this.rb(g(0o1246))) {
      this.showPreview();
    }
    return result;
  } // spawnPiece

  /** `010174` fallOneRow: one row down or landed; score − 1 either way */
  fallOneRow() {
    var g = (n) => this.g(n);
    this.eraseString();
    if (this.fits(this.rw(g(0o1250)), this.rw(g(0o1252))+1)) {
      this.forPiece((o) => {
        this.ww(g(0o1176)+o, this.rw(g(0o1176)+o)+1);
        this.ww(g(0o1140)+o, this.rw(g(0o1176)+o));
      });
      this.ww(g(0o1252), this.rw(g(0o1252))+1);
    } else {
      this.wb(g(0o1254), 1);
    }
    this.drawString();
    this.ww(g(0o1334), this.rw(g(0o1334))-1);
  } // fallOneRow

  /** `010510` moveLeft and `011014` moveRight: a successful move clears "landed" */
  move(dx) {
    var g = (n) => this.g(n);
    this.eraseString();
    if (this.fits(this.rw(g(0o1250))+dx, this.rw(g(0o1252)))) {
      this.forPiece((o) => {
        this.ww(g(0o1176)+o, this.rw(g(0o1176)+o)+(dx < 0 ? 0o177000 : 0o1000));
        this.ww(g(0o1140)+o, this.rw(g(0o1176)+o));
      });
      this.ww(g(0o1250), this.rw(g(0o1250))+dx);
      this.wb(g(0o1254), 0);
    }
    this.drawString();
  } // move

  /** `011320` rotatePiece: in place, no kick */
  rotatePiece() {
    var g = (n) => this.g(n);
    var saved = this.rw(g(0o526));
    var current = this.rw(g(0o1242));
    this.ww(g(0o526), this.shapeAddress(this.rw(g(0)+2*current-2)));
    this.eraseString();
    if (this.fits(this.rw(g(0o1250)), this.rw(g(0o1252)))) {
      var a = this.rw(g(0o526));
      this.forPiece((o) => {
        this.ww(g(0o1176)+o, this.position(a, this.rw(g(0o1374))));
      });
      this.ww(g(0o1242), this.rw(g(0)+2*current-2));
      this.forPiece((o) => {
        this.ww(g(0o1140)+o, this.rw(g(0o1176)+o));
      });
      this.wb(g(0o1254), 0);
    } else {
      this.ww(g(0o526), saved);
    }
    this.drawString();
  } // rotatePiece

  /**
   * `012026` dropPiece: down as far as it fits. ★ The erase string keeps the
   * old position, so a move after the drop erases the old place and leaves
   * the dropped piece on the screen (disasm_notes.md §9).
   */
  dropPiece() {
    var g = (n) => this.g(n);
    var start = this.rw(g(0o1252));
    while (this.fits(this.rw(g(0o1250)), this.rw(g(0o1252))+1)) {
      this.ww(g(0o1252), this.rw(g(0o1252))+1);
    }
    this.forPiece((o) => {
      this.ww(g(0o1140)+o, this.rw(g(0o1176)+o));
      this.ww(g(0o1176)+o, this.rw(g(0o1252))-start+this.rw(g(0o1176)+o));
    });
    this.eraseString();
    this.drawString();
    this.wb(g(0o1254), 1);
  } // dropPiece

  /** `012356` clearHelp: ESC K on the seven rows of help */
  clearHelp() {
    for (var i = 0; i <= 6; i++) {
      this.gotoXY(0o64, i+2);
      this.writeChar(this.rb(this.g(0o1336)));
      this.writeChar(0o113);
    }
  } // clearHelp

  /** `012506` levelUp: level + 1, delay − 30 (the fall itself does not get faster) */
  levelUp() {
    this.ww(this.g(0o1332), this.rw(this.g(0o1332))+1);
    this.ww(this.g(0o1240), this.rw(this.g(0o1240))-30);
  } // levelUp

  /** `012522` readKey: the first key waiting, the rest dropped */
  readKey() {
    var g = (n) => this.g(n);
    this.hookAt('readKey');
    var key = 0;
    var value = this.host.ttyin(this.rw(TetrisLogic.JSW));
    if (value >= 0) {
      key = value & 0xff;
    }
    while (this.host.ttyin(this.rw(TetrisLogic.JSW)) >= 0) {
    }
    switch (TetrisLogic.s8(key)-0o40) {
      case 0:
      case 0o25:
        this.dropPiece();
        break;
      case 0o27:
        this.move(-1);
        break;
      case 0o30:
        this.rotatePiece();
        break;
      case 0o31:
        this.move(1);
        break;
      case 0o21:
        this.wb(g(0o1246), (~this.rb(g(0o1246))) & 1);
        if (this.rb(g(0o1246))) {
          this.showPreview();
        } else {
          this.hidePreview();
        }
        break;
      case 0o24:
        if (TetrisLogic.s16(this.rw(g(0o1332))) < 9) {
          this.levelUp();
        }
        break;
      case 0o20:
        this.clearHelp();
        break;
    }
  } // readKey

  /** `013040` titleAndLevel: the title, the level 0-9 and with it the delay of the fall */
  *titleAndLevel() {
    var g = (n) => this.g(n);
    this.clearScreen();
    this.gotoXY(0o43, 6);
    this.writeString(0o13412, 3);
    this.gotoXY(0o43, 7);
    this.writeChar(0o16);
    this.writeString(0o13416, 0o13);
    this.writeChar(0o17);
    this.gotoXY(0o53, 0o10);
    this.writeString(0o13432, 3);
    this.gotoXY(0o24, 0o24);
    this.writeChar(0o16);
    this.writeString(0o13436, 0o25);
    this.writeChar(0o17);
    yield* this.readCharSeed(g(0o1342));
    this.hookAt('levelRead');
    var level = TetrisLogic.s8(this.rb(g(0o1342)))-0o60;
    if (level < 0) {
      level = 0;
    }
    if (level > 9) {
      level = 9;
    }
    this.ww(g(0o1332), level);
    this.ww(g(0o1240), TetrisLogic.smul(level, -30)+0o423);
  } // titleAndLevel

  /** `013464` lockPiece: the cells into the field, the counts of rows, score + 25 + 3 × level */
  lockPiece() {
    var g = (n) => this.g(n);
    var a = this.rw(g(0o526));
    for (var k = 1; k <= 4; k++) {
      var x = (this.rw(g(0o1250))+this.rw(a-2+2*k)) & 0xffff;
      var y = (this.rw(g(0o1252))+this.rw(a+6+2*k)) & 0xffff;
      this.wb((g(0o530)+TetrisLogic.mul(x, 0o26)+y) & 0xffff, 1);
      var count = (g(0o1260)+2*y) & 0xffff;
      this.ww(count, this.rw(count)+1);
    }
    this.ww(g(0o1334), this.rw(g(0o1334))+0o31+TetrisLogic.mul(this.rw(g(0o1332)), 3));
  } // lockPiece

  /**
   * `013754` clearLines: from the lowest full row up, full rows are blanked
   * on the screen and counted (BEL and a level up past the limit), the rest
   * move down in the field; then the emptied rows are cleared and the rows
   * from the top of the stack to the lowest full one drawn again.
   */
  clearLines() {
    var g = (n) => this.g(n);
    var count = (row) => this.rw((g(0o1260)+2*row) & 0xffff);
    var lowest = 0;
    for (var r = 20; r >= 1; r--) {
      if (count(r) == 10) {
        lowest = r;
        break;
      }
    }
    if (lowest == 0) {
      return;
    }
    var to = lowest;
    var from = lowest;
    var bottom = lowest;
    while (count(from) != 0 && TetrisLogic.s16(from) > 0) {
      if (count(from) != 10) {
        for (var c = 1; c <= 10; c++) {
          this.wb(this.cell(c, to), this.rb(this.cell(c, from)));
        }
        this.ww(g(0o1260)+2*to, count(from));
        to--;
      } else {
        this.gotoXY(0o33, from);
        for (c = 1; c <= 10; c++) {
          this.writeString(0o15104, 2);
        }
        this.ww(g(0o1346), this.rw(g(0o1346))+1);
        var level = TetrisLogic.s16(this.rw(g(0o1332)));
        if (TetrisLogic.s16(this.rw(g(0o1346))) > TetrisLogic.s16(this.rw(g(0o1350)+2*level)) && level < 9) {
          this.writeChar(7);
          this.levelUp();
        }
      }
      from--;
    }
    for (var d = from+1; d <= to; d++) {
      for (c = 1; c <= 10; c++) {
        this.wb(this.cell(c, d), 0);
      }
      this.ww(g(0o1260)+2*d, 0);
    }
    this.redrawRows(from, bottom);
  } // clearLines

  /** `015110` showStatus: full lines, level, score mod 1000, a dollar for every thousand */
  showStatus() {
    var g = (n) => this.g(n);
    this.gotoXY(0, 0);
    this.writeChar(0o16);
    this.writeString(0o15446, 0o17);
    this.writeInt(this.rw(g(0o1346)), 3);
    this.writeString(0o15466, 0o17);
    this.writeInt(this.rw(g(0o1332)), 3);
    this.writeString(0o15506, 0o13);
    // ★ unsigned: a negative score shows as 65536 + score
    this.writeInt(TetrisLogic.umod(this.rw(g(0o1334)), 1000), 3);
    this.writeChar(0o17);
    this.writeln();
    var thousands = TetrisLogic.udiv(this.rw(g(0o1334)), 1000);
    for (var i = 1; i <= thousands; i++) {
      this.writeString(0o15522, 2);
      if (TetrisLogic.smod(i, 5) == 0) {
        this.writeln();
      }
    }
  } // showStatus

  /** `015526` drawField: the glass, its floor and the help */
  drawField() {
    for (var row = 1; row <= 20; row++) {
      this.gotoXY(0o31, row);
      this.writeString(0o16230, 0o30);
    }
    this.gotoXY(0o31, 0o25);
    this.writeString(0o16262, 0o30);
    this.gotoXY(0o31, 0o26);
    this.writeString(0o16314, 0o26);
    this.gotoXY(0o64, 2);
    this.writeChar(0o16);
    this.writeString(0o16344, 0o26);
    this.gotoXY(0o64, 3);
    this.writeString(0o16374, 0o17);
    this.gotoXY(0o64, 4);
    this.writeString(0o16414, 0o26);
    this.gotoXY(0o64, 5);
    this.writeString(0o16444, 0o26);
    this.gotoXY(0o64, 6);
    this.writeString(0o16474, 0o26);
    this.gotoXY(0o64, 7);
    this.writeString(0o16524, 0o23);
    this.writeChar(0o17);
  } // drawField

  /** `016550` main: the program from its start to its end */
  *main() {
    var g = (n) => this.g(n);
    // ★ the runtime start (`017624`): lower case allowed
    this.ww(TetrisLogic.JSW, this.rw(TetrisLogic.JSW) | 0o60000);
    this.wb(g(0o1336), 0o33);
    this.wb(g(0o1337), 0o11);
    this.writeChar(0o27);
    this.writeChar(0o17);
    this.initTables();
    this.ww(g(0o1256), 0o60);
    for (;;) {
      yield* this.titleAndLevel();
      this.newGame();
      this.clearScreen();
      this.drawField();
      this.showStatus();
      this.ww(TetrisLogic.JSW, this.rw(TetrisLogic.JSW) | 0o10100);
      while (this.spawnPiece()) {
        this.wb(g(0o1254), 0);
        do {
          yield {id: 'delay', outer: this.rw(g(0o1240)), inner: this.rw(g(0o1256))};
          this.readKey();
          this.fallOneRow();
          this.readKey();
        } while (this.rb(g(0o1254)) == 0);
        this.lockPiece();
        this.clearLines();
        this.showStatus();
      }
      // `017014` gameOver
      this.hookAt('gameOver');
      this.writeChar(7);
      while (this.host.ttyin(this.rw(TetrisLogic.JSW)) >= 0) {
      }
      yield* this.highScores(this.rw(g(0o1334)), this.rw(g(0o1332)));
      this.gotoXY(0o14, 0o27);
      this.writeChar(0o16);
      this.writeString(0o17222, 0o27);
      this.wb(g(0o1342), yield* this.readChar());
      yield* this.readln();
      this.writeChar(0o17);
      var answer = this.rb(g(0o1342));
      if (answer != 0o144 && answer != 0o104) {
        break;
      }
    }
    yield {id: 'exit'};
  } // main

} // TetrisLogic

if (typeof self !== 'undefined') { self.TetrisLogic = TetrisLogic; }
if (typeof module !== 'undefined' && module.exports) { module.exports = TetrisLogic; }
