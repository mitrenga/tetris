const { DialogScreenModel } = await import('./dialogScreenModel.js?ver='+window.srcVersion);
const { TerminalVolumeEntity } = await import('./svision/js/platform/canvas2D/terminal/terminalVolumeEntity.js?ver='+window.srcVersion);
// begin code

/**
 * SOUNDS: the volume dialog of the library (TerminalVolumeEntity) as a
 * screen. ★ The one sound is the terminal's beeper — BEL and the click of
 * every key (audioManager.js) — and it is the sample too.
 */
export class VolumeModel extends DialogScreenModel {

  /**
   * @param {Object} app - The application.
   * @param {Object} options - `bus`, `cookie`, `sample` (the sound of PLAY SAMPLE), `title`.
   */
  constructor(app, options) {
    super(app, options.title);
    this.id = 'VolumeModel';
    this.options = options;
  } // constructor

  newContentEntity(c) {
    var o = this.options;
    return new TerminalVolumeEntity(this.desktopEntity, c.x, c.y, c.width, c.height, o.bus, o.cookie, o.sample, this.app.dialogProperties);
  } // newContentEntity

} // VolumeModel
