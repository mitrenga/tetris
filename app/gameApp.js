const { Version } = await import('./version.js?ver='+window.srcVersion);
const { AbstractApp } = await import('./svision/js/abstractApp.js?ver='+window.srcVersion);
const { TerminalDialogProperties } = await import('./svision/js/platform/canvas2D/terminal/terminalDialogProperties.js?ver='+window.srcVersion);
const { Tool } = await import('./svision/js/tool.js?ver='+window.srcVersion);
const { MenuModel } = await import('./menuModel.js?ver='+window.srcVersion);
const { GameModel } = await import('./gameModel.js?ver='+window.srcVersion);
const { SettingsModel } = await import('./settingsModel.js?ver='+window.srcVersion);
const { VolumeModel } = await import('./volumeModel.js?ver='+window.srcVersion);
const { AboutModel } = await import('./aboutModel.js?ver='+window.srcVersion);
const { PlayerNameModel } = await import('./playerNameModel.js?ver='+window.srcVersion);
const { HallOfFameModel } = await import('./hallOfFameModel.js?ver='+window.srcVersion);
const { AudioManager } = await import('./audioManager.js?ver='+window.srcVersion);
// begin code

/**
 * Tetris 1984 (Alexey Pajitnov / Алексей Пажитнов, Elektronika 60) — the
 * application shell.
 *
 * ★ The original has no screen of its own: TET.SAV runs under RT-11 on the
 * computer and writes bytes to a 15IE-00-013 terminal on a serial line. The
 * remake keeps the two apart the same way (R-061): the worker is the
 * computer and sends bytes, the model is the terminal and shows them
 * (gameModel.js, app/ie15Terminal.js).
 *
 * The worker runs the program converted routine for routine (M2,
 * app/tetrisLogic.js) under a model of RT-11's terminal handler
 * (app/rt11Host.js); the runs of the original recorded in SIMH can still be
 * played back with `?devRun=` (M1). The terminal's BEL beeps through the
 * svision AudioOscillatorHandler (audioManager.js).
 *
 * R The menu is the remake's (M1): the original is a program started from
 * the RT-11 prompt. It is drawn in the terminal's own font with the
 * library's entities and dialogs (TerminalDialogProperties) and chooses the
 * revision — `TET` (cells of two DEL characters, the older one) or `TETRIS`
 * (cells `[]`) — which the game then starts with `RUN DL1:…` at the prompt.
 * The table of results is the original's own, inside the program, filled
 * from the database (gameModel.js); R the name in it is PLAYER NAME, the
 * program does not ask for one.
 */
export class GameApp extends AbstractApp {

  /** ★ the two revisions on the disk of games (ZADANI.md §1.2) */
  static get REVISIONS() { return ['TET', 'TETRIS']; }

  constructor(platform, importPath, wsURL, devModeName) {
    super(platform, 'bodyApp', importPath, wsURL);
    this.id = 'GameApp';

    this.worker = new Worker(this.importPath+'/gameWorker.js?ver='+window.srcVersion);
    this.worker.onmessage = (event) => {
      if (this.model && this.model.handleWorkerMessage) {
        this.model.handleWorkerMessage(event);
      }
    };
    // a worker that dies is otherwise silent: the terminal just never shows anything
    this.worker.onerror = (event) => {
      console.error('gameWorker: '+event.message+' ('+event.filename+':'+event.lineno+')');
    };

    this.version = Version;
    this.devModeName = devModeName === undefined ? false : devModeName;

    // ★ the only sound is the terminal's BEL (audioManager.js)
    this.audioManager = new AudioManager(this);
    this.muted = {sounds: false};

    /** the terminal's own glyphs, for the screen and for every text over it */
    this.fonts = {terminal: platform.config.font};

    /** when the terminal was switched on: the clock of its status line (TerminalModel), set at the first screen */
    this.powerOn = false;
    /** the row of the menu last chosen, and the revision last played (cookie) */
    this.menuSelection = 0;
    var revision = Tool.readCookie('revision', 'TET');
    this.revision = GameApp.REVISIONS.indexOf(revision) >= 0 ? revision : 'TET';
    /** R the name for the table of results (PLAYER NAME, the cookie of the siblings) — the program does not ask for it */
    this.playerName = Tool.readCookie('playerName', '');

    /**
     * The controls SETTINGS offers (SettingsEntity): the four keys of the
     * play, which the game sends to the original as its own digits —
     * ★ 7 left, 9 right, 8 rotate, 5 drop (disasm_notes.md §4); the digits
     * themselves always work, as on the terminal. R The touchscreen's
     * halves are the siblings' and wait for the touch controls of M1.
     */
    this.controlsOptions = {
      keyboard: {
        device: 'keyboard',
        keys: [
          {action: 'left', label: 'LEFT'},
          {action: 'right', label: 'RIGHT'},
          {action: 'rotate', label: 'ROTATE'},
          {action: 'drop', label: 'DROP'}
        ]
      },
      gamepads: {
        device: 'gamepads',
        keys: [
          {action: 'left', label: 'LEFT', eventKey: 'GamepadLeft'},
          {action: 'right', label: 'RIGHT', eventKey: 'GamepadRight'},
          {action: 'rotate', label: 'ROTATE', eventKey: 'GamepadUp'},
          {action: 'drop', label: 'DROP', eventKey: 'GamepadDown'},
          {action: 'ok', label: 'OK', eventKey: 'GamepadOK'},
          {action: 'exit', label: 'EXIT', eventKey: 'GamepadExit'}
        ]
      },
      touchscreen: {
        device: 'touchscreen',
        types: {
          keys: ['leftButton', 'rightButton'],
          leftButton: {
            left: {half: 'button', sprite: 'button'},
            right: {half: 'stick', sprite: 'stick'}
          },
          rightButton: {
            left: {half: 'stick', sprite: 'stick'},
            right: {half: 'button', sprite: 'button'}
          }
        },
        icons: {
          stick: {
            compressedSpriteData: 'lP101300N0E2P0111030Z051012320B0P020N0601234561718191AB9BCDB1BDCB9BA19181716543210'
          },
          button: {
            width: 39, height: 23, frames: 1, directions: 1,
            sprite: [[
              '---------------------------------------',
              '---------------------------------------',
              '----------------#######----------------',
              '--------------###########--------------',
              '-------------####-----####-------------',
              '------------###---------###------------',
              '-----------###-----------###-----------',
              '-----------##-----###-----##-----------',
              '----------###---#######---###----------',
              '----------##----#-----#----##----------',
              '----------##---##-----##---##----------',
              '----------##---##-----##---##----------',
              '----------##---##-----##---##----------',
              '----------##----#-----#----##----------',
              '----------###---#######---###----------',
              '-----------##-----###-----##-----------',
              '-----------###-----------###-----------',
              '------------###---------###------------',
              '-------------####-----####-------------',
              '--------------###########--------------',
              '----------------#######----------------',
              '---------------------------------------',
              '---------------------------------------'
            ]]
          }
        }
      }
    };

    this.controls = {
      keyboard: this.getControls('keyboard'),
      mouse: {enable: false},
      gamepads: this.getControls('gamepads'),
      touchscreen: this.getControls('touchscreen')
    };

    /**
     * R The look of the dialogs: the terminal's one colour on black, the
     * buttons and the selection in reverse video, as a terminal without
     * attributes shows text (TerminalDialogProperties). The screens SOUNDS
     * and SETTINGS are models of their own, as the siblings have them
     * (dialogScreenModel.js); the wait for a gesture is the one window.
     */
    var fg = platform.config.foreground;
    var bg = platform.config.background;
    var font = this.fonts.terminal;
    var theme = {
      penColor: fg,
      valueColor: fg,
      buttonPenColor: bg,
      buttonColor: fg,
      buttonHoverColor: fg+'d0',
      buttonClickColor: fg+'a0',
      closeButtonColor: fg,
      okButtonColor: fg,
      okButtonPenColor: bg,
      stepButtonColor: fg,
      stepButtonPenColor: bg,
      dangerButtonColor: fg,
      selectionColor: fg,
      selectionPenColor: bg,
      selectionHoverColor: fg+'d0',
      selectionClickColor: fg+'a0',
      hoverColor: fg+'30',
      clickColor: fg+'50',
      separatorColor: fg,
      iconColor: fg,
      dropdownArrowColor: fg,
      sliderColor: fg,
      cursorColor: fg,
      warningColor: fg,
      inputPenColor: bg,
      inputBkColor: fg,
      keyboardButtonsPenColor: bg,
      keyboardButtonsBkColor: fg,
      keyboardButtonsHoverColor: fg+'d0',
      keyboardButtonsClickColor: fg+'a0',
      keyboardButtonsShiftColor: fg+'a0',
      // the pictograms of SETTINGS are drawn for square pixels; the dot of
      // the 15IE is pixelAspect times taller than wide, so they are widened
      // as many times to keep their shape
      iconScaleX: platform.config.pixelAspect
    };
    this.dialogProperties = TerminalDialogProperties.merge(Object.assign(
      TerminalDialogProperties.cells(font, 20, 9, 40, 8), {
        frameColor: fg,
        titleColor: bg,
        bkColor: bg,
        theme: theme,
        remapKeys: {frameColor: fg, titleColor: bg, bkColor: bg, theme: theme},
        selectingGamepad: {frameColor: fg, titleColor: bg, bkColor: bg, theme: theme},
        waitForAudioEvent: Object.assign(TerminalDialogProperties.cells(font, 20, 10, 40, 6),
          {frameColor: fg, titleColor: bg, bkColor: bg, theme: theme})
      }));

    this.setModel('MenuModel');
  } // constructor

  /**
   * The configuration of a control device: the defaults, with what SETTINGS
   * kept in the cookies over them (the shape of the siblings). The keyboard
   * is the arrows for the moves and space for the drop (R a convenience of
   * the remake: the 15IE's arrows send ESC A-D, which TET.SAV does not
   * read; operator 2026-10-27 for space), a gamepad its configured events,
   * the touchscreen which half is the stick.
   * @param {string} device - 'keyboard', 'touchscreen' or 'gamepads'.
   * @returns {Object} The configuration.
   */
  getControls(device) {
    var result = {};

    switch (device) {
      case 'keyboard':
        result = {left: 'ArrowLeft', right: 'ArrowRight', rotate: 'ArrowUp', drop: ' '};
        break;
      case 'touchscreen':
        result = {supported: false, type: 'leftButton'};
        break;
      case 'gamepads':
        result = {supported: false, devices: {}};
        break;
    }

    switch (device) {
      case 'keyboard':
      case 'touchscreen':
        var cfgString = Tool.readCookie(device, false);
        if (cfgString !== false) {
          try {
            var cfg = JSON.parse(cfgString);
            Object.keys(cfg).forEach((item) => {
              result[item] = cfg[item];
              if (device == 'touchscreen' && !(result[item] in this.controlsOptions.touchscreen.types)) {
                result[item] = this.controlsOptions.touchscreen.types.keys[0];
              }
            });
          } catch (error) {
            console.error(error.message);
          }
        }
        break;
      case 'gamepads':
        var devicesString = Tool.readCookie('gamepads', false);
        if (devicesString !== false) {
          try {
            var devices = JSON.parse(devicesString);
          } catch (error) {
            console.error(error.message);
          } finally {
            if (Array.isArray(devices)) {
              devices.forEach((id) => {
                var deviceString = Tool.readCookie(id, false);
                if (deviceString !== false) {
                  try {
                    var device = JSON.parse(deviceString);
                  } catch (error) {
                    console.error(error.message);
                  } finally {
                    result.devices[id] = device;
                  }
                }
              });
            }
          }
        }
        break;
    }
    return result;
  } // getControls

  /**
   * The revision chosen in the menu, kept for the next visit.
   * @param {string} revision - 'TET' or 'TETRIS'.
   */
  setRevision(revision) {
    this.revision = GameApp.REVISIONS.indexOf(revision) >= 0 ? revision : 'TET';
    Tool.writeCookie('revision', this.revision);
  } // setRevision

  /**
   * Switches models (R-002).
   * @param {string} model - 'MenuModel', 'GameModel', 'PlayerNameModel', 'HallOfFameModel', 'SettingsModel', 'VolumeModel' or 'AboutModel'.
   * @param {Object} [options] - What the model is opened with.
   */
  setModel(model, options) {
    var needResizeApp = false;
    if (this.model) {
      this.model.shutdown();
      needResizeApp = true;
    }
    switch (model) {
      case 'MenuModel':
        this.model = new MenuModel(this);
        break;
      case 'GameModel':
        this.model = new GameModel(this, options || {});
        break;
      case 'SettingsModel':
        this.model = new SettingsModel(this);
        break;
      case 'VolumeModel':
        this.model = new VolumeModel(this, options);
        break;
      case 'AboutModel':
        this.model = new AboutModel(this);
        break;
      case 'PlayerNameModel':
        this.model = new PlayerNameModel(this, options);
        break;
      case 'HallOfFameModel':
        this.model = new HallOfFameModel(this);
        break;
    } // switch
    this.model.init();
    if (needResizeApp) {
      this.resizeApp();
    }
  } // setModel

} // GameApp
