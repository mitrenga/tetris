const { TerminalModel } = await import('./terminalModel.js?ver='+window.srcVersion);
const { TextEntity } = await import('./svision/js/platform/canvas2D/textEntity.js?ver='+window.srcVersion);
const { ButtonEntity } = await import('./svision/js/platform/canvas2D/buttonEntity.js?ver='+window.srcVersion);
const { TerminalDialogProperties } = await import('./svision/js/platform/canvas2D/terminal/terminalDialogProperties.js?ver='+window.srcVersion);
// begin code

/**
 * HALL OF FAME: the best 20 games of the database (`db/hallOfFame.php`) —
 * the ones the original's table of results starts with (gameModel.js) — on
 * the terminal's grid in its font: the name, the level and the score, as the
 * original's table has them. CLOSE (Escape, the gamepad's exit) goes back to
 * the menu. Without a database the screen says so.
 */
export class HallOfFameModel extends TerminalModel {

  /** the rows of the table on the desktop (row 0 is the status line) */
  static get HEADER_ROW() { return 3; }
  static get FIRST_ROW() { return 4; }
  static get ENTRIES() { return 20; }
  /** the block of the table: columns 20-59 */
  static get COL() { return 20; }
  static get COLS() { return 40; }

  constructor(app) {
    super(app);
    this.id = 'HallOfFameModel';
    this.rowEntities = [];
  } // constructor

  init() {
    super.init();
    var config = this.app.platform.config;
    var font = this.app.fonts.terminal;
    var fg = config.foreground;
    var bg = config.background;
    var cols = this.desktopWidth/font.cellWidth;
    var rows = this.desktopHeight/font.cellHeight;

    var r = TerminalDialogProperties.cells(font, 0, 1, cols, 1);
    this.desktopEntity.addEntity(new TextEntity(this.desktopEntity, font, r.x, r.y, r.width, r.height, 'HALL OF FAME', fg, false, {align: 'center'}));
    this.line(HallOfFameModel.HEADER_ROW, HallOfFameModel.format('NO', 'NAME', 'LEVEL', 'SCORE'));
    for (var i = 0; i < HallOfFameModel.ENTRIES; i++) {
      this.rowEntities.push(this.line(HallOfFameModel.FIRST_ROW+i, ''));
    }
    r = TerminalDialogProperties.cells(font, cols-16, rows-1, 10, 1);
    this.desktopEntity.addEntity(new ButtonEntity(this.desktopEntity, font, r.x, r.y, r.width, r.height, 'CLOSE', {id: 'closeHallOfFame'},
      ['Escape', 'GamepadExit', 'Enter', 'GamepadOK'], bg, fg, {align: 'center', topMargin: 1}));

    if (navigator.onLine) {
      this.rowEntities[0].setText(HallOfFameModel.center('LOADING ...'));
      this.fetchData('hallOfFame.db', false, {});
    } else {
      this.notAvailable();
    }
  } // init

  /**
   * A row of the table's block.
   * @param {number} row - The desktop's row.
   * @param {string} text - What it says.
   * @returns {TextEntity}
   */
  line(row, text) {
    var font = this.app.fonts.terminal;
    var r = TerminalDialogProperties.cells(font, HallOfFameModel.COL, row, HallOfFameModel.COLS, 1);
    var entity = new TextEntity(this.desktopEntity, font, r.x, r.y, r.width, r.height, text, this.app.platform.config.foreground, false, {});
    this.desktopEntity.addEntity(entity);
    return entity;
  } // line

  /**
   * The columns of a row: the place, the name in the 16 characters of the
   * original's record, the level and the score.
   * @returns {string} 40 characters at most.
   */
  static format(no, name, level, score) {
    return String(no).padStart(2)+'  '+String(name).padEnd(16).slice(0, 16)+'  '+String(level).padStart(5)+'  '+String(score).padStart(7);
  } // format

  /** a text in the middle of the block */
  static center(text) {
    return ' '.repeat(Math.max(0, Math.floor((HallOfFameModel.COLS-text.length)/2)))+text;
  } // center

  /** No database (not configured, or offline). */
  notAvailable() {
    this.rowEntities.forEach((entity) => entity.setText(''));
    this.rowEntities[0].setText(HallOfFameModel.center('HALL OF FAME NOT AVAILABLE'));
  } // notAvailable

  /**
   * The table: `hallOfFame.db`, ordered by score.
   * @param {Object} data - `{url, data}`.
   */
  setData(data) {
    if (data.url !== 'hallOfFame.db') {
      super.setData(data);
      return;
    }
    var rows = data.data || {};
    var count = Object.keys(rows).length;
    for (var i = 0; i < HallOfFameModel.ENTRIES; i++) {
      this.rowEntities[i].setText(i < count
        ? HallOfFameModel.format((i+1)+'.', String(rows[i].name || ''), Number(rows[i].level) || 0, Number(rows[i].score) || 0)
        : '');
    }
    if (!count) {
      this.rowEntities[0].setText(HallOfFameModel.center('NO GAMES YET'));
    }
  } // setData

  errorData(error) {
    console.warn('hall of fame: '+(error && error.message ? error.message : error));
    this.notAvailable();
  } // errorData

  handleEvent(event) {
    if (super.handleEvent(event)) {
      return true;
    }
    if (event.id == 'closeHallOfFame') {
      this.app.setModel('MenuModel');
      return true;
    }
    return false;
  } // handleEvent

  /**
   * R-037: a static screen redraws here, which costs nothing while nothing changed.
   * @param {number} timestamp - What the animation loop was given.
   */
  loopModel(timestamp) {
    super.loopModel(timestamp);
    this.drawModel();
  } // loopModel

} // HallOfFameModel
