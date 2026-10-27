// classic script (importScripts): no import, no export - R-001, R-048.
// begin code

/**
 * The computer around TET.SAV: what RT-11 V05.03 does with the terminal the
 * program reads and writes (app/tetrisLogic.js). Not code of the original
 * program — a model of the monitor's terminal handler, as far as the game
 * meets it:
 *
 * - **`.TTYIN` without waiting.** The image's JSW has bit 6 (no wait), so
 *   `ttyin(jsw)` gives a byte or -1 at once.
 * - **Special mode (JSW bit 12)**, set by the game for the play: every key is
 *   handed over as it comes, ★ without echo (SIMH: keys deposited during the
 *   fall, at readKey, in the delay and while the piece is drawn — none
 *   echoed).
 * - **Line mode** (bit 12 clear): the level prompt, the name and the yes/no
 *   answer the Pascal runtime reads, and — ★ — the moment between the level
 *   and the start of the play, while the program draws the field and has
 *   not switched to special mode yet. A line is handed over when it ends with
 *   RETURN, as CR LF; until then it can be edited. Echo: the character, CR LF
 *   for RETURN, and it goes into the output between the program's own bytes,
 *   in the middle of an escape sequence if it comes there (M0: `ESC 4 Y,9`).
 *   ? Rubout and CTRL/U are echoed the way RT-11 does with SET TT SCOPE (BS
 *   space BS), not measured yet. `echo: false` turns the echo off.
 *
 * What the program writes goes to `output`, the echo with it, in the order
 * RT-11 puts them into its output ring.
 *
 * Free of DOM dependencies (R-001).
 */
class Rt11Host {

  /**
   * @param {Object} [config]
   * @param {boolean} [config.echo=true] - RT-11 echoes the keys (★ original).
   */
  constructor(config) {
    config = config || {};
    this.echo = config.echo !== false;
    this.output = [];
    // complete input RT-11 hands out to .TTYIN
    this.ready = [];
    // the line being typed in line mode
    this.line = [];
    // ★ RT-11 takes the mode over from the JSW at a .TTYIN: a key that comes
    // after the program set special mode but before its next .TTYIN is still
    // echoed as in line mode (the first key of a game, tools/matchgame.mjs)
    this.jsw = 0o100;
  } // constructor

  out(value) {
    this.output.push(value & 0xff);
  } // out

  /** takes what was written since the last call */
  takeOutput() {
    var bytes = this.output;
    this.output = [];
    return bytes;
  } // takeOutput

  /** a key of the terminal's keyboard */
  type(value) {
    value &= 0x7f;
    if (this.jsw & 0o10000) {
      // ★ no echo in special mode (SIMH, tools/tracegame.py)
      this.ready.push(value);
      return;
    }
    switch (value) {
      case 0o15:
        this.line.push(0o15, 0o12);
        this.ready = this.ready.concat(this.line);
        this.line = [];
        if (this.echo) {
          this.out(0o15);
          this.out(0o12);
        }
        break;
      case 0o177:
      case 0o10:
        if (this.line.length) {
          this.line.pop();
          if (this.echo) {
            this.out(0o10);
            this.out(0x20);
            this.out(0o10);
          }
        }
        break;
      case 0o25:
        this.line = [];
        if (this.echo) {
          this.out(0x5e);
          this.out(0x55);
          this.out(0o15);
          this.out(0o12);
        }
        break;
      default:
        if (value >= 0x20 || value == 0o11) {
          this.line.push(value);
          if (this.echo) {
            this.out(value);
          }
        }
    }
  } // type

  /** whether a .TTYIN now would get something */
  hasInput() {
    return this.ready.length > 0;
  } // hasInput

  /** `.TTYIN` (EMT 340) without waiting: a byte, or -1 (carry set) */
  ttyin(jsw) {
    this.jsw = jsw;
    if ((jsw & 0o10000) && this.line.length) {
      // ★ what was typed in line mode and not ended goes out as it is
      this.ready = this.ready.concat(this.line);
      this.line = [];
    }
    return this.ready.length ? this.ready.shift() : -1;
  } // ttyin

} // Rt11Host

if (typeof self !== 'undefined') { self.Rt11Host = Rt11Host; }
if (typeof module !== 'undefined' && module.exports) { module.exports = Rt11Host; }
