import { BrowserWindow, shell, type BrowserWindowConstructorOptions } from "electron";

import { getPreloadPath } from "./window-paths.js";

/**
 * Window chrome per OS. macOS: inset traffic lights and the sidebar vibrancy material behind a
 * transparent page, which the translucent theme tokens tint (see renderer/ui/theme.css).
 * Elsewhere: the native frame and solid backgrounds.
 */
export function chromeOptions(): Partial<BrowserWindowConstructorOptions> {
  return process.platform === "darwin"
    ? {
        titleBarStyle: "hiddenInset",
        // Centred on the toolbar's midline (26px) and clear of the sidebar card's rounded corner.
        trafficLightPosition: { x: 20, y: 19 },
        vibrancy: "sidebar",
        visualEffectState: "followWindow",
        backgroundColor: "#00000000",
      }
    : { autoHideMenuBar: true };
}

/**
 * A BrowserWindow with the renderer locked down: isolated, sandboxed, no Node, and every
 * navigation away from the app (links, window.open) handed to the default browser.
 */
export function createSecureWindow(options: BrowserWindowConstructorOptions): BrowserWindow {
  const window = new BrowserWindow({
    show: false,
    ...chromeOptions(),
    ...options,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      ...options.webPreferences,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const current = window.webContents.getURL();
    if (url !== current && !url.startsWith(process.env.VITE_DEV_SERVER_URL ?? "\0")) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });
  window.once("ready-to-show", () => window.show());
  return window;
}
