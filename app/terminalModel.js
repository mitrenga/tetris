const { AbstractModel } = await import('./svision/js/abstractModel.js?ver='+window.srcVersion);
const { TerminalScreen } = await import('./svision/js/platform/canvas2D/terminal/terminalScreen.js?ver='+window.srcVersion);
const { TerminalScreenEntity } = await import('./svision/js/platform/canvas2D/terminal/terminalScreenEntity.js?ver='+window.srcVersion);
const { IE15Terminal } = await import('./ie15Terminal.js?ver='+window.srcVersion);
// begin code

/**
 * The base of the screens of the menu (MenuModel, AboutModel,
 * HallOfFameModel, DialogScreenModel): the terminal stays switched on under
 * them, so its own status line is there as in the game — ◇ the speed of the
 * line, the setup bits and the clock from power-on (IE15Terminal.drawStatus).
 * The text area under it is empty and has no cursor; the screen's entities
 * stand over it. The clock is the application's (`app.powerOn`), so it goes
 * on from one screen to the next and into the game.
 */
export class TerminalModel extends AbstractModel {

  constructor(app) {
    super(app);
    this.id = 'TerminalModel';
    this.screen = null;
    this.charset = null;
    this.terminalEntity = null;
    this.statusSecond = -1;
  } // constructor

  init() {
    super.init();
    var config = this.app.platform.config;
    this.borderEntity.bkColor = config.borderColor;
    this.desktopEntity.bkColor = config.background;
    this.charset = IE15Terminal.charset();
    this.screen = new TerminalScreen(config);
    this.screen.showCursor(false);
    this.terminalEntity = new TerminalScreenEntity(this.desktopEntity, 0, 0,
      this.desktopWidth, this.desktopHeight, this.screen, this.app.fonts.terminal, config);
    this.desktopEntity.addEntity(this.terminalEntity);
    TerminalModel.updateStatus(this, performance.now());
  } // init

  /**
   * The status line of the terminal, its clock counting from when the
   * terminal was switched on — the page loaded (`app.powerOn`).
   * @param {Object} model - A model with `app`, `screen`, `charset` and `statusSecond`.
   * @param {number} timestamp - The time now, ms.
   */
  static updateStatus(model, timestamp) {
    if (model.app.powerOn === false || model.app.powerOn === undefined) {
      model.app.powerOn = timestamp;
    }
    var second = Math.floor((timestamp-model.app.powerOn)/1000);
    if (second != model.statusSecond) {
      model.statusSecond = second;
      IE15Terminal.drawStatus(model.screen, model.charset, second);
    }
  } // updateStatus

  loopModel(timestamp) {
    super.loopModel(timestamp);
    TerminalModel.updateStatus(this, timestamp);
  } // loopModel

} // TerminalModel
