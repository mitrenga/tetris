const { TerminalModel } = await import('./terminalModel.js?ver='+window.srcVersion);
const { TextEntity } = await import('./svision/js/platform/canvas2D/textEntity.js?ver='+window.srcVersion);
const { ButtonEntity } = await import('./svision/js/platform/canvas2D/buttonEntity.js?ver='+window.srcVersion);
const { TerminalDialogProperties } = await import('./svision/js/platform/canvas2D/terminal/terminalDialogProperties.js?ver='+window.srcVersion);
// begin code

/**
 * ABOUT: what the original is and what the remake keeps, on the terminal's
 * grid in its font, with the buttons of the siblings' about screens — MORE
 * INFO opens the /about page (`aboutPage.php`), CLOSE (Escape, the gamepad's
 * exit) goes back to the menu. Names in Latin and in Cyrillic (CLAUDE.md).
 */
export class AboutModel extends TerminalModel {

  /** the text, paragraphs split by '\n', wrapped to the columns of the screen */
  static get TEXT() {
    return 'TETRIS WAS WRITTEN BY ALEXEY PAJITNOV (АЛЕКСЕЙ ПАЖИТНОВ) IN 1984 AT THE COMPUTING CENTRE '+
      'OF THE ACADEMY OF SCIENCES OF THE USSR, IN PASCAL UNDER RT-11 ON AN ELEKTRONIKA 60 '+
      '(ЭЛЕКТРОНИКА-60), A SOVIET CLONE OF THE PDP-11 WITH A TEXT TERMINAL.\n'+
      'THIS IS NOT A MODERN TETRIS BUT A RECONSTRUCTION OF THE FIRST ONE: THE PROGRAM OF THE '+
      'SURVIVING ORIGINAL IS CARRIED OVER ROUTINE BY ROUTINE AND CHECKED AGAINST IT BYTE BY BYTE; '+
      'THE REMAKE DRAWS ON A MODEL OF THE 15IE-00-013 (15ИЭ-00-013) TERMINAL WITH ITS OWN CHARACTERS.\n'+
      'PLAY TET STARTS THE OLDER REVISION, WHOSE CELLS ARE TWO DEL CHARACTERS - A SOLID BLOCK ON THE '+
      'SOVIET TERMINAL; PLAY TETRIS THE LATER ONE WITH CELLS []. THE GAME SPEAKS RUSSIAN, AS IT DID.\n'+
      'TETRIS IS A TRADEMARK OF THE TETRIS COMPANY.';
  }

  constructor(app) {
    super(app);
    this.id = 'AboutModel';
  } // constructor

  init() {
    super.init();
    var config = this.app.platform.config;
    var font = this.app.fonts.terminal;
    var fg = config.foreground;
    var bg = config.background;
    var cols = this.desktopWidth/font.cellWidth;
    var rows = this.desktopHeight/font.cellHeight;

    var r = TerminalDialogProperties.cells(font, 0, 2, cols, 1);
    this.desktopEntity.addEntity(new TextEntity(this.desktopEntity, font, r.x, r.y, r.width, r.height, 'ABOUT', fg, false, {align: 'center'}));
    r = TerminalDialogProperties.cells(font, 4, 4, cols-8, rows-8);
    this.desktopEntity.addEntity(new TextEntity(this.desktopEntity, font, r.x, r.y, r.width, r.height, AboutModel.TEXT, fg, false, {textWrap: true}));

    // the buttons on the last rows: MORE INFO (Enter) and CLOSE (Escape), the siblings' pair, in reverse video,
    // the label a dot lower so the glyph (rows 0-7 of the 11) sits in the middle
    r = TerminalDialogProperties.cells(font, 16, rows-3, 14, 1);
    this.desktopEntity.addEntity(new ButtonEntity(this.desktopEntity, font, r.x, r.y, r.width, r.height, 'MORE INFO', {id: 'openAboutURL'},
      ['Enter', 'GamepadOK'], bg, fg, {align: 'center', topMargin: 1}));
    r = TerminalDialogProperties.cells(font, cols-30, rows-3, 14, 1);
    this.desktopEntity.addEntity(new ButtonEntity(this.desktopEntity, font, r.x, r.y, r.width, r.height, 'CLOSE', {id: 'closeAbout'},
      ['Escape', 'GamepadExit'], bg, fg, {align: 'center', topMargin: 1}));
  } // init

  handleEvent(event) {
    if (super.handleEvent(event)) {
      return true;
    }
    switch (event.id) {
      case 'openAboutURL':
        window.location.href = 'about';
        return true;
      case 'closeAbout':
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

} // AboutModel
