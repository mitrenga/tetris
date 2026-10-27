const { TerminalFont } = await import('./svision/js/platform/canvas2D/terminal/terminalFont.js?ver='+window.srcVersion);
const { TerminalCharset } = await import('./svision/js/platform/canvas2D/terminal/terminalCharset.js?ver='+window.srcVersion);
const { TerminalVT52 } = await import('./svision/js/platform/canvas2D/terminal/terminalVT52.js?ver='+window.srcVersion);
const { TerminalKeyboard } = await import('./svision/js/platform/canvas2D/terminal/terminalKeyboard.js?ver='+window.srcVersion);
const { IE15Chargen } = await import('./ie15Chargen.js?ver='+window.srcVersion);
// begin code

/**
 * The terminal Tetris ran on: the Soviet 15IE-00-013 (15ИЭ-00-013), a
 * green-screen VT52 look-alike on a serial line. The svision platform
 * `terminal` knows no terminal in particular (R-061); this is the one
 * configuration it gets here — glyphs, character set, sequences, keyboard,
 * colours, cursor and the speed of the line.
 *
 * Marks as in the project: ★ measured on the running original or read from
 * the ROM, ◇ from the MAME 0.264 driver `ie15` (an emulation built on the ROM
 * dumps, not the maker's documentation), ? unverified, R a reconstruction
 * assumption (sources/docs/terminal.md).
 *
 * Free of DOM, so the match tools build the same terminal under Node.
 */
export class IE15Terminal {

  /** ◇ 80 columns, 24 rows of text and the status line on top */
  static get COLS() { return 80; }
  static get ROWS() { return 24; }
  /** ◇ the line: 9600 baud, 8N1 */
  static get BAUD() { return 9600; }
  /**
   * ◇ the 16 setup bits the status line shows after power-on (MAME ie15: no
   * NVRAM, the firmware sets the one bit itself); what each means is not known
   */
  static get SETUP_BITS() { return '0000001000000000'; }
  /** ◇ the beeper's pitch (MAME ie15) */
  static get BELL_HZ() { return 2400; }

  /**
   * ★ The character generator: 256 glyphs of 7x8, bits 7-1 of a byte, in a
   * ◇ 10x11 cell, top left. 000-177 Latin, 200-377 Cyrillic (KOI-7 shape),
   * ★ 177 and 377 the solid block the bricks of TET.SAV are made of.
   * @param {Object} app - The application; null under Node.
   * @param {TerminalCharset} [charset] - For `chars`, so text entities print
   *        with the terminal's glyphs; the KOI-7 one by default.
   * @returns {TerminalFont} The font.
   */
  static font(app, charset) {
    var hex = IE15Chargen;
    var data = new Uint8Array(hex.length/2);
    for (var i = 0; i < data.length; i++) {
      data[i] = parseInt(hex.substr(i*2, 2), 16);
    }
    return new TerminalFont(app, {
      data: data,
      count: 256,
      bytesPerGlyph: 8,
      glyphWidth: 7,
      glyphHeight: 8,
      firstBit: 7,
      cellWidth: 10,
      cellHeight: 11,
      glyphX: 0,
      glyphY: 0,
      chars: (charset || IE15Terminal.charset()).charMap()
    });
  } // font

  /** ★ KOI-7 after SO: codes 0100-0137, the small Cyrillic letters */
  static get KOI7_SMALL() { return 'юабцдефгхийклмнопярстужвьызшэщчъ'; }
  /** ★ KOI-7 after SO: codes 0140-0176, the capitals */
  static get KOI7_CAPITALS() { return 'ЮАБЦДЕФГХИЙКЛМНОПЯРСТУЖВЬЫЗШЭЩЧ'; }

  /**
   * KOI-7 with SO/SI: ★ TET.SAV sends its texts after SO in lower-case Latin,
   * which shows upper-case Cyrillic. ◇ The ROM keeps the Cyrillic at 300-377,
   * so after SO the codes 0100-0177 show glyphs 0300-0377: 0100-0137 the small
   * letters, 0140-0176 the capitals, 0177 the solid block.
   * ? Whether codes below 0100 after SO are stored as 0200 + code (the ROM
   * has the same digits and punctuation there) — matchscreen against MAME
   * tells; the glyph is the same either way.
   * @returns {TerminalCharset} The charset.
   */
  static charset() {
    return new TerminalCharset({
      initial: 'SI',
      glyphs: {SO: [[0x40, 0x7F, 0xC0]]},
      unicode: {
        SI: [{from: 0x20, chars: TerminalCharset.ASCII}, {from: 0x7F, chars: '█'}],
        SO: [{from: 0x40, chars: IE15Terminal.KOI7_SMALL},
             {from: 0x60, chars: IE15Terminal.KOI7_CAPITALS}]
      },
      shiftCodes: {SO: 0x0E, SI: 0x0F}
    });
  } // charset

  /**
   * The firmware's sequences: ◇ "mostly VT52", without hold screen and the
   * graphics set, so the VT52 set of the library. ★ TET.SAV uses only ESC Y,
   * ESC H and ESC J (and SO, SI, CR, LF, BEL). ★ DEL is printed — it is the
   * solid block — where a DEC VT52 would ignore it.
   * ? What the terminal does at column 80 (no wrap assumed) and with ESC Y off
   * the screen (clamped) — matchscreen against MAME tells.
   * @returns {Object} The profile for {@link TerminalVT52}.
   */
  static profile() {
    return {
      sequences: TerminalVT52.VT52,
      printDel: true,
      autoWrap: false
    };
  } // profile

  /**
   * The keyboard: the printable keys as the charset encodes them (SO/SI in
   * front of a key in the other set), Enter as CR.
   * ? Which code the 15IE sends for its rubout key (RT-11 takes DEL).
   * @param {TerminalCharset} charset - The charset.
   * @returns {TerminalKeyboard} The keyboard.
   */
  static keyboard(charset) {
    return new TerminalKeyboard(charset, {
      keys: {Enter: 0x0D, Backspace: 0x7F, Delete: 0x7F, Tab: 0x09},
      printable: true
    });
  } // keyboard

  /**
   * The config of {@link TerminalPlatform}.
   * @param {TerminalFont} font - The font.
   * @returns {Object} The config.
   */
  /**
   * ◇ The status line the terminal's own firmware keeps on its 25th (top) row
   * (MAME ie15, sources/media/tet_level5_noinput_ie15.png): the speed of the
   * line, the 16 setup bits in four groups and a clock from power-on, every
   * digit in every other column. The program never writes there.
   * @param {TerminalScreen} screen - The screen whose status row is written.
   * @param {TerminalCharset} charset - The terminal's character set.
   * @param {number} seconds - Seconds since the terminal was switched on.
   */
  static drawStatus(screen, charset, seconds) {
    var put = (col, text) => {
      for (var i = 0; i < text.length; i++) {
        screen.putStatus(col+i, charset.glyph(text.charCodeAt(i), 0));
      }
    };
    var spaced = (text) => text.split('').join(' ');
    var two = (n) => String(n%100).padStart(2, '0');
    put(27, spaced(String(IE15Terminal.BAUD)));
    for (var group = 0; group < 4; group++) {
      put(36+9*group, spaced(IE15Terminal.SETUP_BITS.substr(4*group, 4)));
    }
    // ? whether the hours wrap at 24 or 100 is not known
    seconds = Math.floor(seconds);
    put(72, two(Math.floor(seconds/3600))+' '+two(Math.floor(seconds/60)%60)+' '+two(seconds%60));
  } // drawStatus

  static bellScore() {
    // ◇ the beeper: 2400 Hz for 400 ms on BEL and on every key the terminal
    // sends — the firmware of its own ROM does that (MAME ie15, measured
    // 2026-10-27, sources/docs/terminal.md); the short 150 ms mode is not used. R a plain square wave at a fixed level,
    // until a recording or the terminal's documentation says otherwise
    // (operator 2026-10-27). Tempo 600: a tick is 25 ms, the note 16 ticks.
    return {
      tempo: 600,
      volume: 0.3,
      defaultDuration: 16,
      instruments: {
        beeper: {
          class: 'OscillatorInstrument',
          osc: [{type: 'square'}],
          env: {attack: 0.002, decay: 0.001, sustain: 1, release: 0.004},
          gain: 0.5
        }
      },
      tracks: [{instrument: 'beeper', pattern: [[{tick: 0, pitch: IE15Terminal.BELL_HZ, dur: 16}]]}],
      repeat: false
    };
  } // bellScore

  static platformConfig(font) {
    return {
      cols: IE15Terminal.COLS,
      rows: IE15Terminal.ROWS,
      statusLine: 'top',
      font: font,
      // ◇ one colour, 0x00C000 on black, no intensity
      foreground: '#00c000',
      background: '#000000',
      // ◇ the cursor is the three spare rows of the cell (8-10) under the
      // glyph, blinking 5 frames lit and 5 dark at 50 Hz
      cursor: {lines: [8, 10], blinkOnMs: 100, blinkOffMs: 100},
      // R a dot twice as tall as wide (operator 2026-10-27): the 800x275
      // raster over a 4:3 face would be 2.18, and a whole number keeps every
      // dot the same block of device pixels — the screen is 800x550 or
      // a whole multiple of it (TerminalLayout), the rest is border. The
      // tube of a real terminal is not measured
      pixelAspect: 2,
      minimalBorder: 0,
      borderColor: '#000000'
    };
  } // platformConfig

} // IE15Terminal
