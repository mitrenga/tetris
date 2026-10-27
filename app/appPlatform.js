const { TerminalPlatform } = await import('./svision/js/platform/canvas2D/terminal/terminalPlatform.js?ver='+window.srcVersion);
const { IE15Terminal } = await import('./ie15Terminal.js?ver='+window.srcVersion);
// begin code

/**
 * The 15IE-00-013 terminal on the terminal platform of svision (R-061): 80x24
 * and the status line in 10x11 cells, green on black, the font of its own ROM
 * (app/ie15Terminal.js). The font is built here, before the application,
 * because the platform needs the cell size for the desktop; the application
 * takes it from the platform config.
 */
export function appPlatform() {
  return new TerminalPlatform(IE15Terminal.platformConfig(IE15Terminal.font(null)));
} // appPlatform
