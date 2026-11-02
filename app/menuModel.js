const { TerminalModel } = await import('./terminalModel.js?ver='+window.srcVersion);
const { MenuEntity } = await import('./svision/js/platform/canvas2D/menuEntity.js?ver='+window.srcVersion);
const { TextEntity } = await import('./svision/js/platform/canvas2D/textEntity.js?ver='+window.srcVersion);
const { TerminalDialogProperties } = await import('./svision/js/platform/canvas2D/terminal/terminalDialogProperties.js?ver='+window.srcVersion);
const { VolumeControl } = await import('./svision/js/platform/canvas2D/dialogs/volumeControl.js?ver='+window.srcVersion);
// begin code

/**
 * The menu — the remake's, R: the original is a program started from the
 * RT-11 prompt and has no menu (M1). It stands on the terminal's grid in the
 * terminal's own font (TerminalDialogProperties): the logo, the author, the
 * rows, the licence on the last row. The arrows or the gamepad move the bar,
 * Enter or the gamepad's OK takes the row, a click or a tap takes the row
 * under it (MenuEntity).
 *
 * The first two rows start the two revisions on the disk of games
 * (ZADANI.md §1.2): ★ `TET` draws a cell of a piece as two DEL characters,
 * which the 15IE shows as a solid block; ★ `TETRIS` as `[]`. The logo is
 * made of the same cells — the mask of the icon (`images/app-icon.svg`),
 * 21 × 5 cells of two characters — in the revision under the bar, so the
 * difference is seen before the game starts.
 */
export class MenuModel extends TerminalModel {

  /** the logo: the mask of the icon, a '#' a cell of the game */
  static get LOGO() {
    return [
      '### ### ### ### # ###',
      ' #  #    #  # # # #  ',
      ' #  ##   #  ##  # ###',
      ' #  #    #  # # #   #',
      ' #  ###  #  # # # ###'
    ];
  }

  /** ★ a cell of a piece in each revision: two DEL (the 15IE's block) or `[]` */
  static get CELLS() { return {TET: '██', TETRIS: '[]'}; }

  /**
   * where things stand, in rows of the desktop: the logo from the first row
   * under the status line (row 0), the author a row under it; the menu on
   * the rows between the author and the licence on the last row, two free
   * rows over it and one under it (init)
   */
  static get LOGO_ROW() { return 1; }

  constructor(app) {
    super(app);
    this.id = 'MenuModel';
    this.menuEntity = null;
    this.logoEntities = [];
    this.logoRevision = false;
    this.menuItems = [
      {t1: 'PLAY TET', revision: 'TET', event: {id: 'startGame', revision: 'TET'}},
      {t1: 'PLAY TETRIS', revision: 'TETRIS', event: {id: 'startGame', revision: 'TETRIS'}},
      {t1: 'PLAYER NAME', event: {id: 'setPlayerName'}},
      {t1: 'HALL OF FAME', event: {id: 'showHallOfFame'}},
      {t1: 'SOUNDS', event: {id: 'setSounds'}},
      {t1: 'SETTINGS', event: {id: 'setSettings'}},
      {t1: 'ABOUT', event: {id: 'showAbout'}}
    ];
  } // constructor

  init() {
    super.init();
    var config = this.app.platform.config;
    var font = this.app.fonts.terminal;
    var fg = config.foreground;
    var cols = Math.floor(this.desktopWidth/font.cellWidth);
    var line = (row, text) => {
      var r = TerminalDialogProperties.cells(font, 0, row, cols, 1);
      var entity = new TextEntity(this.desktopEntity, font, r.x, r.y, r.width, r.height, text, fg, false, {align: 'center'});
      this.desktopEntity.addEntity(entity);
      return entity;
    };

    for (var i = 0; i < MenuModel.LOGO.length; i++) {
      this.logoEntities.push(line(MenuModel.LOGO_ROW+i, ''));
    }
    var authorRow = MenuModel.LOGO_ROW+MenuModel.LOGO.length+1;
    line(authorRow, 'ALEXEY PAJITNOV  АЛЕКСЕЙ ПАЖИТНОВ');
    var licenceRow = this.desktopHeight/font.cellHeight-1;

    // the menu between the author and the licence, on the terminal's rows: two free rows over it, one under it
    var menuRows = 2*this.menuItems.length-1;
    var r = TerminalDialogProperties.cells(font, 21, authorRow+1+Math.ceil((licenceRow-authorRow-1-menuRows)/2), 38, menuRows);
    var options = TerminalDialogProperties.menuOptions(font, fg, config.background,
      {pitch: 2, valueCols: 15, selection: this.app.menuSelection, t1TopMargin: 1, t2TopMargin: 1});
    // the bars a dot higher and the text a dot lower in them: the glyph (rows 0-7 of the 11) sits in the middle of its bar
    this.menuEntity = new MenuEntity(this.desktopEntity, r.x, r.y-1, r.width, r.height, false, options, this, this.getMenuData);
    this.desktopEntity.addEntity(this.menuEntity);

    line(licenceRow, 'REMAKE BY LIBOR MITRENGA, CC BY-NC-SA 4.0');
    this.showLogo();
  } // init

  /** The row the bar stands on is remembered for the next menu. */
  shutdown() {
    super.shutdown();
    if (this.menuEntity) {
      this.app.menuSelection = this.menuEntity.selection;
    }
  } // shutdown

  /**
   * The logo in the cells of the revision under the bar — of the one last
   * played while the bar is on another row.
   */
  showLogo() {
    var item = this.menuItems[this.menuEntity ? this.menuEntity.selection : 0];
    var revision = (item && item.revision) || this.app.revision;
    if (revision == this.logoRevision) {
      return;
    }
    this.logoRevision = revision;
    var cell = MenuModel.CELLS[revision];
    for (var i = 0; i < MenuModel.LOGO.length; i++) {
      this.logoEntities[i].setText(MenuModel.LOGO[i].split('').map((c) => c == '#' ? cell : '  ').join(''));
    }
  } // showLogo

  /**
   * The level as the volume dialog words it (VolumeControl.levelText): OFF,
   * 10%..90%, MAX.
   * @param {number} volume - A slider's 0-10.
   * @returns {string}
   */
  volumeText(volume) {
    return VolumeControl.levelText(volume);
  } // volumeText

  /**
   * What the menu asks about its rows.
   * @param {MenuModel} self - The model.
   * @param {string} key - What is asked.
   * @param {number} row - Which row.
   * @returns {*} The answer.
   */
  getMenuData(self, key, row) {
    switch (key) {
      case 'numberOfItems':
        return self.menuItems.length;
      case 't2':
        var item = self.menuItems[row];
        if (item.revision) {
          return MenuModel.CELLS[item.revision];
        }
        switch (item.event.id) {
          case 'setPlayerName':
            return self.app.playerName;
          case 'setSounds':
            return self.volumeText(self.app.audioManager.volume.sounds);
          case 'showAbout':
            return 'v'+self.app.version;
        }
        return '';
      default:
        if (key in self.menuItems[row]) {
          return self.menuItems[row][key];
        }
        break;
    }
    return '';
  } // getMenuData

  handleEvent(event) {
    if (super.handleEvent(event)) {
      return true;
    }
    switch (event.id) {
      case 'startGame':
        this.app.setRevision(event.revision);
        // R no name yet: PLAYER NAME first, and its OK starts the game (the siblings' way)
        if (!this.app.playerName.length) {
          this.app.setModel('PlayerNameModel', {autoStartGame: true, revision: event.revision});
          return true;
        }
        this.app.setModel('GameModel', {revision: event.revision});
        return true;
      case 'setPlayerName':
        this.app.setModel('PlayerNameModel');
        return true;
      case 'showHallOfFame':
        this.app.setModel('HallOfFameModel');
        return true;
      case 'setSounds':
        this.app.setModel('VolumeModel', {bus: 'sounds', cookie: 'audioBusSoundsLevel', sample: 'bell', title: 'SOUNDS'});
        return true;
      case 'setSettings':
        this.app.setModel('SettingsModel');
        return true;
      case 'showAbout':
        this.app.setModel('AboutModel');
        return true;
      case 'refreshMenu':
        this.menuEntity.refreshMenu();
        return true;
    }
    return false;
  } // handleEvent

  /**
   * R-037: a static screen redraws here, which costs nothing while nothing
   * changed; the logo follows the bar.
   * @param {number} timestamp - What the animation loop was given.
   */
  loopModel(timestamp) {
    super.loopModel(timestamp);
    if (this.desktopEntity.modalEntity) {
      this.desktopEntity.modalEntity.loopEntity(timestamp);
    }
    this.menuEntity.loopEntity(timestamp);
    this.showLogo();
    this.drawModel();
  } // loopModel

} // MenuModel
