const { DialogScreenModel } = await import('./dialogScreenModel.js?ver='+window.srcVersion);
const { TerminalPlayerNameEntity } = await import('./svision/js/platform/canvas2D/terminal/terminalPlayerNameEntity.js?ver='+window.srcVersion);
// begin code

/**
 * PLAYER NAME: the name for the table of results in the library's dialog as
 * a screen, in the terminal look (TerminalPlayerNameEntity). R It replaces
 * the original's question at the end of a game (`TetrisLogic.playerName`),
 * in Latin as typed (the 15IE's ROM has the small letters too), at most 15 characters of the 16 the original keeps.
 * PLAY without a name opens it with `autoStartGame` and the revision, and OK
 * goes on into the game.
 */
export class PlayerNameModel extends DialogScreenModel {

  /**
   * @param {Object} app - The application.
   * @param {Object} [options] - `autoStartGame` and `revision`: opened by PLAY without a name, so OK starts that game.
   */
  constructor(app, options) {
    super(app, 'PLAYER NAME');
    this.id = 'PlayerNameModel';
    this.autoStartGame = !!(options && options.autoStartGame);
    this.revision = (options && options.revision) || app.revision;
  } // constructor

  newContentEntity(c) {
    return new TerminalPlayerNameEntity(this.desktopEntity, c.x, c.y, c.width, c.height, this.autoStartGame, this.app.dialogProperties);
  } // newContentEntity

  /**
   * OK with `autoStartGame` sends 'startGame': the game, straight away.
   * @param {Object} event
   * @returns {boolean}
   */
  handleEvent(event) {
    if (event.id == 'startGame') {
      this.app.setModel('GameModel', {revision: this.revision});
      return true;
    }
    return super.handleEvent(event);
  } // handleEvent

} // PlayerNameModel
