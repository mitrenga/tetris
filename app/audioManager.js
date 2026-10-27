const { AbstractAudioManager } = await import('./svision/js/audio/abstractAudioManager.js?ver='+window.srcVersion);
const { AudioOscillatorHandler } = await import('./svision/js/audio/audioOscillatorHandler.js?ver='+window.srcVersion);
const { Tool } = await import('./svision/js/tool.js?ver='+window.srcVersion);
const { IE15Terminal } = await import('./ie15Terminal.js?ver='+window.srcVersion);
// begin code

/**
 * Audio of Tetris 1984. ★ The only sound of the original is the terminal's
 * BEL (sources/docs/disasm_notes.md §8): the Elektronika 60 itself had no
 * sound, the program sends character 7 on a level up and at the end of a
 * game, and the 15IE-00-013 beeps — on BEL and, ◇ by its own firmware, on
 * every key typed. So there is one bus, `sounds`, played by
 * the svision AudioOscillatorHandler (Web Audio synthesis), and one sound,
 * `bell` — the terminal's beeper as a score (IE15Terminal.bellScore()).
 *
 * The bus follows the user level `sounds` (cookie `audioBusSoundsLevel`,
 * 0-10, 7 by default) and the app's mute state, as the other remakes'.
 */
export class AudioManager extends AbstractAudioManager {

  constructor(app) {
    super(app);
    this.id = 'AudioManager';
    this.volume = {sounds: Math.min(10, Math.max(0, Math.round(Number(Tool.readCookie('audioBusSoundsLevel', 7)))))};
    this.latencyHint = 'interactive';
  } // constructor

  createAudioHandler(bus, options) {
    return new AudioOscillatorHandler(this.app);
  } // createAudioHandler

  /** the user level 0-10 as a gain factor, the curve of the other remakes */
  volumeFactor(volume) {
    var levels = [0, 0.005, 0.01, 0.02, 0.04, 0.07, 0.1, 0.14, 0.18, 0.23, 0.29];
    return levels[volume]/levels[10];
  } // volumeFactor

  openBus(bus, options) {
    super.openBus(bus, options);
    this.refreshVolume(bus);
    this.muteBus(bus, ('muted' in options) ? options.muted : false);
  } // openBus

  refreshVolume(bus) {
    var handler = this.buses[bus];
    if (handler === undefined) {
      return;
    }
    handler.setBusVolume(this.volumeFactor(this.volume.sounds));
  } // refreshVolume

  audioData(bus, sound, options) {
    var data = super.audioData(bus, sound, options);
    if (data !== false) {
      return data;
    }
    switch (sound) {
      case 'bell':
        return IE15Terminal.bellScore();
    }
    return false;
  } // audioData

} // AudioManager
