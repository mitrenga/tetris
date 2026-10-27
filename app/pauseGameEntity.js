const { AbstractEntity } = await import('./svision/js/abstractEntity.js?ver='+window.srcVersion);
const { TextEntity } = await import('./svision/js/platform/canvas2D/textEntity.js?ver='+window.srcVersion);
const { MenuEntity } = await import('./svision/js/platform/canvas2D/menuEntity.js?ver='+window.srcVersion);
const { TerminalDialogProperties } = await import('./svision/js/platform/canvas2D/terminal/terminalDialogProperties.js?ver='+window.srcVersion);
// begin code

/**
 * The pause panel, the siblings' shape (`r-type/app/pauseGameEntity.js`) on
 * the terminal's grid in its font: RESUME GAME, SOUNDS and EXIT GAME.
 *
 * R The original has no pause: the remake's, because a browser tab that
 * loses focus has to stop somewhere. EXIT GAME leaves the game without the
 * table of results — a game gets into it only by the original's own code,
 * at its end (gameModel.js).
 *
 * It is a **modal entity**, so while it is up the model gets no events;
 * whoever opens it stops the worker as well (`GameModel.pauseGame`).
 */
export class PauseGameEntity extends AbstractEntity {

  /**
   * @param {AbstractEntity} parentEntity - The desktop.
   * @param {number} x - Where it sits, in pixels of the desktop (on the grid).
   * @param {number} y - Where it sits.
   * @param {number} width - How wide.
   * @param {number} height - How tall.
   * @param {string} title - What is written over it.
   * @param {string} exitModel - Which model EXIT goes to.
   */
  constructor(parentEntity, x, y, width, height, title, exitModel) {
    super(parentEntity, x, y, width, height, false, false);
    this.id = 'PauseGameEntity';

    this.title = title;
    this.exitModel = exitModel;
    this.menuItems = [
      {t1: 'RESUME GAME', event: {id: 'closePauseGame'}},
      {t1: 'SOUNDS', event: {id: 'changeSoundsState'}},
      {t1: 'EXIT GAME', event: {id: 'exitGame'}}
    ];
  } // constructor

  init() {
    super.init();
    var config = this.app.platform.config;
    var font = this.app.fonts.terminal;
    var fg = config.foreground;
    var bg = config.background;
    // a frame of one dot in the terminal's colour, the panel black inside it
    this.addEntity(new AbstractEntity(this, 0, 0, this.width, this.height, false, fg));
    this.addEntity(new AbstractEntity(this, 1, 1, this.width-2, this.height-2, false, bg));
    this.addEntity(new TextEntity(this, font, 0, font.cellHeight, this.width, font.cellHeight, this.title, fg, false, {align: 'center'}));
    var options = TerminalDialogProperties.menuOptions(font, fg, bg, {valueCols: 4});
    this.addEntity(new MenuEntity(this, font.cellWidth, 3*font.cellHeight, this.width-2*font.cellWidth,
      this.menuItems.length*font.cellHeight, false, options, this, this.getMenuData));
  } // init

  /**
   * What the menu asks about its rows.
   * @param {PauseGameEntity} self - The panel.
   * @param {string} key - What is asked.
   * @param {number} row - Which row.
   * @returns {*} The answer.
   */
  getMenuData(self, key, row) {
    switch (key) {
      case 'numberOfItems':
        return self.menuItems.length;
      case 't2':
        return row == 1 ? (self.app.muted.sounds ? 'OFF' : 'ON') : '';
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
      case 'keyPress':
        switch (event.key) {
          case 'Escape':
          case 'GamepadExit':
            // Escape opened it, so Escape closes it
            this.sendEvent(-1, 1, {id: 'continueGame'});
            this.destroy();
            return true;
        }
        break;
      case 'closePauseGame':
        this.sendEvent(-1, 1, {id: 'continueGame'});
        this.destroy();
        return true;
      case 'changeSoundsState':
        this.app.muted.sounds = !this.app.muted.sounds;
        this.app.audioManager.muteBus('sounds', this.app.muted.sounds);
        this.sendEvent(1, 0, {id: 'refreshMenu'});
        return true;
      case 'exitGame':
        this.app.setModel(this.exitModel);
        return true;
    }
    return false;
  } // handleEvent

} // PauseGameEntity
