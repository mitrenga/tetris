const { DialogScreenModel } = await import('./dialogScreenModel.js?ver='+window.srcVersion);
const { TerminalSettingsEntity } = await import('./svision/js/platform/canvas2D/terminal/terminalSettingsEntity.js?ver='+window.srcVersion);
// begin code

/**
 * SETTINGS: the controls panel of the library as a screen — the keyboard
 * remap of the four keys of the play, the gamepad, the touchscreen, the
 * display (`GameApp.controlsOptions`) in the terminal look of the library's
 * panel (TerminalSettingsEntity).
 */
export class SettingsModel extends DialogScreenModel {

  constructor(app) {
    super(app, 'SETTINGS');
    this.id = 'SettingsModel';
  } // constructor

  newContentEntity(c) {
    return new TerminalSettingsEntity(this.desktopEntity, c.x, c.y, c.width, c.height, this.app.controlsOptions, this.app.dialogProperties);
  } // newContentEntity

} // SettingsModel
