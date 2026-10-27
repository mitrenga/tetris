const { AbstractModel } = await import('./svision/js/abstractModel.js?ver='+window.srcVersion);
const { TextEntity } = await import('./svision/js/platform/canvas2D/textEntity.js?ver='+window.srcVersion);
const { TerminalScreen } = await import('./svision/js/platform/canvas2D/terminal/terminalScreen.js?ver='+window.srcVersion);
const { TerminalVT52 } = await import('./svision/js/platform/canvas2D/terminal/terminalVT52.js?ver='+window.srcVersion);
const { TerminalLine } = await import('./svision/js/platform/canvas2D/terminal/terminalLine.js?ver='+window.srcVersion);
const { TerminalScreenEntity } = await import('./svision/js/platform/canvas2D/terminal/terminalScreenEntity.js?ver='+window.srcVersion);
const { IE15Terminal } = await import('./ie15Terminal.js?ver='+window.srcVersion);
const { RecordedRuns } = await import('./recordedRuns.js?ver='+window.srcVersion);
const { Tool } = await import('./svision/js/tool.js?ver='+window.srcVersion);
const { PauseGameEntity } = await import('./pauseGameEntity.js?ver='+window.srcVersion);
const { TerminalModel } = await import('./terminalModel.js?ver='+window.srcVersion);
// begin code

/**
 * The terminal: the 15IE-00-013 the original wrote to. Bytes come from the
 * worker (the computer), go through the line at 9600 baud and the firmware
 * (TerminalVT52 with the 15IE profile) into the screen, and the screen is
 * drawn. Keys go the other way: TerminalKeyboard makes bytes of them and the
 * worker gets them as the input of the line.
 *
 * The worker runs the converted game (M2, app/tetrisLogic.js), so the keys
 * play. The menu chooses the revision (`options.revision`): ★ `TET` with
 * cells of two DEL characters or ★ `TETRIS` with `[]` (ZADANI.md §1.2); the
 * worker types `RUN DL1:…` at RT-11's prompt and the program starts, and
 * when it ends (★ the answer НЕТ to ЕЩЕ ПАРТИЮ?) the terminal goes back to
 * the menu after a moment. `?devRun=N` plays back run N of the original
 * recorded in SIMH instead (M1, app/recordedRuns.js).
 *
 * The keys: while RT-11 hands them over one by one (JSW bit 12, the play,
 * `special` of the worker's frame) the four keys of SETTINGS
 * (`app.controls.keyboard`, the arrows by default) and the gamepad send the
 * original's digits; at the prompts every key types itself, so a name is
 * never taken for a move. Escape, the gamepad's exit and a window losing
 * focus open the pause (PauseGameEntity), which stops the worker.
 *
 * The table of results is the original's, filled from the database: the
 * best 20 games of `hallOfFame.db` go to the worker, which writes them into
 * the program's memory, and every game the original puts into the table
 * comes back as `gameResult` and goes to `saveGame.db` (a zero score is not
 * saved, R-049). R The name is the one of PLAYER NAME in the menu, in
 * Latin as typed: the program does not ask for it and prints it between SI
 * and SO (`TetrisLogic.playerName`); it travels as text (`nameText`,
 * `nameBytes`). Without a database the table is the original's empty one.
 *
 * The screen is drawn when a frame comes from the worker, and the model loop
 * draws only when that did not happen (`needDraw`, R-037). The line lets bytes
 * through on both clocks, so a screen that is still coming down the line keeps
 * appearing while the worker is quiet.
 */
export class GameModel extends AbstractModel {

  /**
   * R How many instructions of the original a millisecond is, for the
   * game and the playback. A placeholder until the time model of M3: the LSI-11 class
   * processor of the Elektronika 60 managed a few hundred thousand simple
   * instructions a second. `?devSpeed=` overrides it.
   */
  static get INSTRUCTIONS_PER_MS() { return 250; }

  /** R the pause before a beep that cuts the previous one, in seconds */
  static get BEEP_GAP() { return 0.02; }

  /**
   * ★ The original's keys of the four actions (disasm_notes.md §4): 7 left,
   * 9 right, 8 rotate, 5 drop. R The keys of SETTINGS and the gamepad are a
   * convenience of the remake — the arrows of the 15IE send ESC A-D, which
   * TET.SAV does not read — so they send the digit; the host gets exactly
   * the byte of the original key.
   */
  static get ACTION_KEYS() {
    return {left: '7', right: '9', rotate: '8', drop: '5'};
  }

  /** the gamepad's events as the actions (`GameApp.controlsOptions`) */
  static get GAMEPAD_ACTIONS() {
    return {GamepadLeft: 'left', GamepadRight: 'right', GamepadUp: 'rotate', GamepadDown: 'drop'};
  }

  /** R how long the terminal shows RT-11's prompt after the program ends, ms */
  static get EXIT_DELAY_MS() { return 1500; }

  /**
   * @param {Object} app - The application.
   * @param {Object} [options] - `revision`: 'TET' or 'TETRIS' (the menu's choice).
   */
  constructor(app, options) {
    super(app);
    this.id = 'GameModel';
    this.revision = (options && options.revision) || app.revision || 'TET';
    /** whether RT-11 hands keys over one by one (the play), from the worker's frames */
    this.special = false;
    this.paused = false;
    this.exiting = false;

    this.worker = null;
    this.screen = null;
    this.firmware = null;
    this.line = null;
    this.keyboard = null;
    this.terminalEntity = null;
    this.charset = null;
    // the second the clock on the status line shows (the terminal was switched
    // on at `app.powerOn`, TerminalModel)
    this.statusSecond = -1;
    // R-045, in developer mode only: in the border, bottom left
    this.fpsEntity = null;
    this.devModeEntity = null;
    this.fps = {frames: 0, workerFrames: 0, ticks: 0, since: false, lastPass: false};
    // ★ R-037: a frame from the worker draws at once and clears this; the
    // model loop draws only when it survived, and raises it again
    this.needDraw = true;
  } // constructor

  init() {
    super.init();
    var config = this.app.platform.config;
    this.borderEntity.bkColor = config.borderColor;
    this.desktopEntity.bkColor = config.background;

    var charset = this.charset = IE15Terminal.charset();
    this.screen = new TerminalScreen(config);
    this.firmware = new TerminalVT52(this.screen, charset, IE15Terminal.profile());
    // BEL: the terminal beeps when the character reaches it down the line
    // (audioManager.js, IE15Terminal.bellScore())
    this.sendEvent(0, {id: 'openAudioBus', bus: 'sounds', options: {muted: this.app.muted.sounds}});
    this.firmware.onBell = () => this.beep();
    this.line = new TerminalLine((value) => this.firmware.writeByte(value), {baud: IE15Terminal.BAUD});
    this.keyboard = IE15Terminal.keyboard(charset);

    this.terminalEntity = new TerminalScreenEntity(this.desktopEntity, 0, 0,
      this.desktopWidth, this.desktopHeight, this.screen, this.app.fonts.terminal, config);
    this.desktopEntity.addEntity(this.terminalEntity);

    // the status line is the terminal's own: speed, setup bits and clock
    this.updateStatus(performance.now());

    if (this.app.devModeName !== false) {
      // R-045 in the border, bottom centre (operator 2026-10-27): the screen and
      // its status line stay the terminal's
      var font = this.app.fonts.terminal;
      this.fpsEntity = new TextEntity(this.borderEntity, font, 0, 0, 24*font.cellWidth, font.cellHeight,
        '', config.foreground, false, {align: 'center'});
      this.borderEntity.addEntity(this.fpsEntity);

      // R-025: the banner in the top border, in the terminal's glyphs — the
      // library's ◢◤ ornaments are not in the 15IE ROM, so they become '/'
      var banner = GameModel.devModeBanner(this.app.devModeName);
      this.devModeEntity = new TextEntity(this.borderEntity, font, 0, 0, banner.text.length*font.cellWidth, font.cellHeight,
        banner.text, banner.penColor || '#000000', banner.bkColor || '#fefe00', {});
      this.borderEntity.addEntity(this.devModeEntity);
      this.placeFps();
    }

    this.worker = this.app.worker;
    var run = Tool.devParam('devRun', '');
    this.sendWorkerMessage({
      id: 'init',
      initData: {
        mode: run === '' ? 'play' : 'replay',
        revision: this.revision,
        playerName: GameModel.nameBytes(this.app.playerName),
        echo: true,
        runs: run === '' ? [] : RecordedRuns,
        run: parseInt(run, 10) || 0,
        instructionsPerMs: parseFloat(Tool.devParam('devSpeed', String(GameModel.INSTRUCTIONS_PER_MS))) || GameModel.INSTRUCTIONS_PER_MS
      }
    });
    if (run === '') {
      this.fetchData('hallOfFame.db', false, {});
    }
  } // init

  shutdown() {
    super.shutdown();
    this.sendEvent(0, {id: 'closeAudioBus', bus: 'sounds'});
    this.sendWorkerMessage({id: 'reset'});
  } // shutdown

  /**
   * The terminal's beeper. R A new beep cuts the one still sounding and starts
   * after a short pause, so that every key of an autorepeat is heard on its
   * own (operator 2026-10-27, by the video); MAME's beeper just goes on.
   */
  beep() {
    this.sendEvent(0, {id: 'playSound', bus: 'sounds', sound: 'bell', options: {preroll: GameModel.BEEP_GAP}});
  } // beep

  sendWorkerMessage(event) {
    if (this.worker) {
      this.worker.postMessage(event);
    }
  } // sendWorkerMessage

  handleEvent(event) {
    if (super.handleEvent(event)) {
      return true;
    }

    switch (event.id) {

      case 'resizeModel':
        this.placeFps();
        break;

      case 'blurWindow':
        this.pauseGame();
        return true;

      case 'continueGame':
        this.paused = false;
        this.sendWorkerMessage({id: 'continue'});
        return true;

      case 'backToMenu':
        this.app.setModel('MenuModel');
        return true;

      case 'keyPress':
        if (event.key == 'Escape' || event.key == 'GamepadExit') {
          this.pauseGame();
          return true;
        }
        var key = this.keyOf(event.key);
        var bytes = this.keyboard.bytesFor(key);
        if (bytes.length) {
          this.sendWorkerMessage({id: 'input', bytes: Array.from(bytes)});
          // ◇ the terminal's firmware beeps on every key it sends, the same
          // 400 ms beep as BEL (MAME ie15 running the terminal's own ROM,
          // sources/docs/terminal.md), autorepeat included
          this.beep();
          return true;
        }
        break;
    }

    return false;
  } // handleEvent

  /**
   * The key the terminal sends for a key of the browser: in the play the
   * original's digit of an action of SETTINGS or of the gamepad, RETURN for
   * the gamepad's OK; anything else as it is.
   * @param {string} key - The browser's key or the gamepad's event.
   * @returns {string} The key for the terminal's keyboard.
   */
  keyOf(key) {
    if (key == 'GamepadOK') {
      return 'Enter';
    }
    var action = GameModel.GAMEPAD_ACTIONS[key] || false;
    if (action === false && this.special) {
      var controls = this.app.controls.keyboard;
      Object.keys(GameModel.ACTION_KEYS).forEach((name) => {
        if (action === false && typeof controls[name] == 'string' && controls[name].toUpperCase() == key.toUpperCase()) {
          action = name;
        }
      });
    }
    return action === false ? key : GameModel.ACTION_KEYS[action];
  } // keyOf

  /** The pause: the worker stops and the panel is over the terminal (Escape again, RESUME or EXIT). */
  pauseGame() {
    if (this.paused || this.exiting) {
      return;
    }
    this.paused = true;
    this.sendWorkerMessage({id: 'pause'});
    var font = this.app.fonts.terminal;
    this.desktopEntity.addModalEntity(new PauseGameEntity(this.desktopEntity, 30*font.cellWidth, 8*font.cellHeight,
      20*font.cellWidth, 7*font.cellHeight, 'PAUSE', 'MenuModel'));
  } // pauseGame

  handleWorkerMessage(event) {
    var data = event.data;
    switch (data.id) {
      case 'exit':
        // ★ НЕТ: the program ended at RT-11's prompt; R the menu after a moment
        this.exiting = true;
        this.sendEvent(GameModel.EXIT_DELAY_MS, {id: 'backToMenu'});
        break;
      case 'frame':
        this.special = !!data.special;
        this.fps.workerFrames++;
        if (this.fps.lastPass !== false && data.pass > this.fps.lastPass) {
          this.fps.ticks += data.pass-this.fps.lastPass;
        }
        this.fps.lastPass = data.pass;
        if (data.reset) {
          // a new run: the terminal as switched on
          this.line.flush();
          this.screen.clear();
          this.firmware.reset();
        }
        if (data.bytes && data.bytes.length) {
          this.line.push(data.bytes);
        }
        this.line.update(performance.now());
        this.drawModel();
        this.needDraw = false;
        break;
      case 'resultsNeeded':
        // R the end of a game: the table of the server, other players' games in it (gameWorker.js)
        this.fetchData('hallOfFame.db', false, {});
        break;
      case 'gameResult':
        if (data.score) {
          this.fetchData('saveGame.db', false, {name: GameModel.nameText(data.name), level: data.level, score: data.score});
        }
        break;
      case 'error':
        console.error(data.message);
        break;
    }
  } // handleWorkerMessage

  /**
   * The answers of the database: the table goes to the worker for the next
   * start of the program; after a game is saved the table is asked for again.
   * @param {Object} data - `{url, data}`.
   */
  setData(data) {
    if (data.url === 'hallOfFame.db') {
      var rows = data.data || {};
      var entries = [];
      for (var i = 0; i < Object.keys(rows).length; i++) {
        entries.push({
          name: GameModel.nameBytes(String(rows[i].name || '')),
          level: (Number(rows[i].level) || 0) & 0xffff,
          score: (Number(rows[i].score) || 0) & 0xffff
        });
      }
      this.sendWorkerMessage({id: 'results', entries: entries});
      return;
    }
    if (data.url === 'saveGame.db') {
      this.fetchData('hallOfFame.db', false, {});
      return;
    }
    super.setData(data);
  } // setData

  /**
   * No database (not configured, or offline): the game goes on with the
   * original's own table, which lasts as long as the program runs.
   * @param {Error} error - What went wrong.
   */
  errorData(error) {
    console.warn('hall of fame: '+(error && error.message ? error.message : error));
  } // errorData

  /**
   * A name of the table as text: its bytes as ASCII, the spaces the original
   * pads it with gone.
   * @param {Array<number>} bytes - The 16 bytes of the name.
   * @returns {string} The name.
   */
  static nameText(bytes) {
    var text = '';
    for (var i = 0; i < bytes.length; i++) {
      var value = bytes[i] & 0x7f;
      text += value >= 0x20 && value < 0x7f ? String.fromCharCode(value) : '?';
    }
    return text.replace(/ +$/, '');
  } // nameText

  /**
   * The other way: a name as the 16 bytes the original keeps, as typed and
   * padded with spaces; a character outside ASCII becomes '?'.
   * @param {string} text - The name.
   * @returns {Array<number>} 16 bytes.
   */
  static nameBytes(text) {
    var bytes = [];
    text = String(text || '');
    for (var i = 0; i < text.length && bytes.length < 16; i++) {
      var code = text.charCodeAt(i);
      bytes.push(code >= 0x20 && code < 0x7f ? code : 0x3f);
    }
    while (bytes.length < 16) {
      bytes.push(0x20);
    }
    return bytes;
  } // nameBytes

  /**
   * The developer-mode banner from `window.devModeName` (R-025:
   * `.{json of TextEntity properties}text`), its text in the terminal's
   * characters: the standard banner reads `/ / / DEVELOPER MODE / / /`, any
   * other one keeps its words with the ornaments as '/'.
   * @param {string} devModeName - What the page set.
   * @returns {Object} `{text, penColor, bkColor}`.
   */
  static devModeBanner(devModeName) {
    var banner = {text: ' / / /  DEVELOPER MODE  / / / ', penColor: false, bkColor: false};
    var text = String(devModeName);
    var end = text.indexOf('}');
    if (text.charAt(0) == '.' && end > 0) {
      try {
        var config = JSON.parse(text.substring(1, end+1));
        banner.penColor = config.penColor || false;
        banner.bkColor = config.bkColor || false;
      } catch (error) {
        console.error('devModeName: '+error.message);
      }
      text = text.substring(end+1);
    }
    if (text.indexOf('DEVELOPER MODE') < 0) {
      banner.text = ' '+text.replace(/◢◤/g, '/').replace(/[^\x20-\x7e]/g, '').trim()+' ';
    }
    return banner;
  } // devModeBanner

  /** the FPS counter bottom centre and the banner top centre, in the border */
  placeFps() {
    var width = this.desktopWidth+2*this.borderWidth;
    if (this.fpsEntity) {
      this.fpsEntity.x = Math.max(0, Math.floor((width-this.fpsEntity.width)/2));
      this.fpsEntity.y = Math.max(0, this.desktopHeight+2*this.borderHeight-this.fpsEntity.height);
    }
    if (this.devModeEntity) {
      this.devModeEntity.x = Math.max(0, Math.floor((width-this.devModeEntity.width)/2));
      this.devModeEntity.y = Math.max(0, Math.floor((this.borderHeight-this.devModeEntity.height)/2));
    }
  } // placeFps

  updateFps(timestamp) {
    if (!this.fpsEntity) {
      return;
    }
    this.fps.frames++;
    if (this.fps.since === false) {
      this.fps.since = timestamp;
      return;
    }
    var elapsed = timestamp-this.fps.since;
    if (elapsed >= 1000) {
      this.fpsEntity.setText(Math.round(this.fps.frames*1000/elapsed)+'/'+Math.round(this.fps.workerFrames*1000/elapsed)+'/'+Math.round(this.fps.ticks*1000/elapsed)+' FPS');
      this.fps.frames = 0;
      this.fps.workerFrames = 0;
      this.fps.ticks = 0;
      this.fps.since = timestamp;
    }
  } // updateFps

  /**
   * The status line of the terminal (IE15Terminal.drawStatus), its clock
   * counting from when the terminal was switched on — the page loaded, the
   * same clock as under the menu (TerminalModel).
   * @param {number} timestamp - The time now, ms.
   */
  updateStatus(timestamp) {
    TerminalModel.updateStatus(this, timestamp);
  } // updateStatus

  loopModel(timestamp) {
    super.loopModel(timestamp);

    if (this.desktopEntity.modalEntity) {
      this.desktopEntity.modalEntity.loopEntity(timestamp);
    }
    this.line.update(timestamp);
    this.terminalEntity.loopEntity(timestamp);
    this.updateStatus(timestamp);
    this.updateFps(timestamp);
    if (this.needDraw) {
      this.drawModel();
    }
    this.needDraw = true;
  } // loopModel

} // GameModel
