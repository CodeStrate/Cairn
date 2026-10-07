// Cairn backend entry point. The runtime wires IPC, the native bridge, and lifecycle
// handling before this file runs.

import { app, BrowserWindow, Menu, logger, initDevToolsButtonState } from "@glaze/core/backend";

import { registerHandlers } from "./handlers/index.js";
import { getPreloadPath, getWindowUrl } from "./windows/window-paths.js";
import { openSettingsWindow } from "./windows/settings-window.js";

const APP_NAME = "Cairn";

registerHandlers();

let mainWindow: BrowserWindow | null = null;

async function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return;

  mainWindow = new BrowserWindow({
    windowKey: "main", // Stable key for frame persistence
    width: 1240,
    height: 800,
    minWidth: 760,
    minHeight: 520,
    title: APP_NAME,
    show: false, // Shown on ready-to-show to avoid a blank flash
    webPreferences: {
      preload: getPreloadPath(),
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  await mainWindow.loadURL(await getWindowUrl("main-window.html"));
}

async function setupApplicationMenu() {
  await initDevToolsButtonState();
  const menu = Menu.buildFromTemplate([
    {
      label: APP_NAME,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Settings…",
          icon: "gearshape",
          accelerator: "Command+,",
          click: async () => await openSettingsWindow(),
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]);
  Menu.setApplicationMenu(menu);
}

// macOS convention: keep running when the last window closes.
app.on("window-all-closed", () => {});

// Re-open the main window when the Dock icon is clicked and nothing is visible.
app.on("activate", (hasVisibleWindows) => {
  if (hasVisibleWindows) return;
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow().catch((error) => logger.error("main", "Failed to create main window", error));
  } else {
    mainWindow.show();
  }
});

app.whenReady().then(async () => {
  await setupApplicationMenu();
  createMainWindow().catch((error) => logger.error("main", "Failed to create main window", error));
});
