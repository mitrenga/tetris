const { TerminalModel } = await import('./terminalModel.js?ver='+window.srcVersion);
const { TextEntity } = await import('./svision/js/platform/canvas2D/textEntity.js?ver='+window.srcVersion);
const { TerminalDialogProperties } = await import('./svision/js/platform/canvas2D/terminal/terminalDialogProperties.js?ver='+window.srcVersion);
// begin code

/**
 * A screen of the menu that holds one dialog of the library — SOUNDS
 * (VolumeModel), SETTINGS (SettingsModel) — the way the siblings have them
 * (`r-type/app/dialogScreenModel.js`): a model of its own instead of a window
 * over the menu. On the terminal's grid in its font: the heading on row 2,
 * the contents in the rows under it (`CONTENT`, in cells). The contents come
 * from `GameApp.dialogProperties` and the screen goes back to the menu when
 * they close.
 */
export class DialogScreenModel extends TerminalModel {

  /** the contents in cells: columns 4-75, rows 4-22 of the desktop (row 0 is the status line) */
  static get CONTENT() { return {col: 4, row: 4, cols: 72, rows: 19}; }

  /**
   * @param {Object} app - The application.
   * @param {string} title - The heading.
   */
  constructor(app, title) {
    super(app);
    this.id = 'DialogScreenModel';
    this.title = title;
    this.contentEntity = null;
  } // constructor

  /**
   * The contents of the screen, made by the subclass.
   * @param {Object} c - `{x, y, width, height}` of the contents.
   * @returns {AbstractEntity}
   */
  newContentEntity(c) {
    return null;
  } // newContentEntity

  init() {
    super.init();
    var config = this.app.platform.config;
    var font = this.app.fonts.terminal;
    var heading = TerminalDialogProperties.cells(font, 0, 2, this.desktopWidth/font.cellWidth, 1);
    this.desktopEntity.addEntity(new TextEntity(this.desktopEntity, font, heading.x, heading.y, heading.width, heading.height,
      this.title, config.foreground, false, {align: 'center'}));
    var c = DialogScreenModel.CONTENT;
    this.contentEntity = this.newContentEntity(TerminalDialogProperties.cells(font, c.col, c.row, c.cols, c.rows));
    this.desktopEntity.addEntity(this.contentEntity);
    // the flash clock of the siblings' models: the cursor of the remap blinks by it
    this.app.stack.flashState = false;
    this.sendEvent(330, {id: 'changeFlashState'});
  } // init

  /**
   * R-037: a static screen redraws here; the contents tick on their own
   * (the gamepad polling of the settings), a window over them too.
   * @param {number} timestamp - What the animation loop was given.
   */
  loopModel(timestamp) {
    super.loopModel(timestamp);
    if (this.desktopEntity.modalEntity) {
      this.desktopEntity.modalEntity.loopEntity(timestamp);
    }
    if (this.contentEntity) {
      this.contentEntity.loopEntity(timestamp);
    }
    this.drawModel();
  } // loopModel

  /**
   * Back to the menu when the contents close: they `destroy()` themselves
   * and tell their parent, the desktop, which knows nothing of it, so the
   * screen watches their 'destroy' (the siblings' way).
   * @param {Object} event
   * @returns {boolean}
   */
  handleEvent(event) {
    if (event.id == 'destroy' && event.entity === this.contentEntity) {
      this.contentEntity = null;
      this.app.setModel('MenuModel');
      return true;
    }
    if (super.handleEvent(event)) {
      return true;
    }
    switch (event.id) {
      case 'contentClosed':
        this.app.setModel('MenuModel');
        return true;
      case 'refreshMenu':
        return true;
      case 'changeFlashState':
        this.app.stack.flashState = !this.app.stack.flashState;
        this.sendEvent(330, {id: 'changeFlashState'});
        return true;
    }
    return false;
  } // handleEvent

} // DialogScreenModel
