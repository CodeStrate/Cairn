// Wefty main process: windows, the application menu, and app lifecycle. IPC handlers are
// registered in handlers/; everything else lives in services/.

import type { BrowserWindow, MenuItemConstructorOptions } from "electron";

import { app, ipcMain, logger, Menu } from "./electron/runtime.js";
import { registerHandlers } from "./handlers/index.js";
import { applySavedTheme } from "./handlers/theme.js";
import { openSettingsWindow } from "./windows/settings-window.js";
import { createSecureWindow } from "./windows/secure-window.js";
import { getAppIconPath, getWindowUrl } from "./windows/window-paths.js";

const APP_NAME = "Wefty";
const isMac = process.platform === "darwin";

app.setName(APP_NAME);

// One instance: a second launch focuses the existing window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

async function createMainWindow(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    return;
  }
  mainWindow = createSecureWindow({
    width: 1240,
    height: 800,
    minWidth: 760,
    minHeight: 520,
    title: APP_NAME,
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  await mainWindow.loadURL(getWindowUrl("main-window.html"));
}

function setupApplicationMenu(): void {
  const settings: MenuItemConstructorOptions = {
    label: isMac ? "Settings…" : "Preferences…",
    accelerator: "CmdOrCtrl+,",
    click: () => void openSettingsWindow(),
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: "about" },
              { type: "separator" },
              settings,
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "File",
      submenu: isMac ? [{ role: "close" }] : [settings, { type: "separator" }, { role: "quit" }],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: `${APP_NAME} Help`,
          accelerator: "CmdOrCtrl+?",
          click: () => ipcMain.broadcast("help:open", {}),
        },
        { label: "Show Tour", click: () => ipcMain.broadcast("tour:start", {}) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

// macOS keeps the app running with no windows; other platforms quit.
app.on("window-all-closed", () => {
  if (!isMac) app.quit();
});

app.on("activate", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow().catch((error) =>
      logger.error("main", "Failed to create main window", error),
    );
  } else {
    mainWindow.show();
  }
});

app.whenReady().then(async () => {
  const icon = getAppIconPath(app.getAppPath());
  // Dev runs the stock Electron.app, so set the Dock icon ourselves (packaged builds use
  // the .icns from build-resources).
  if (isMac && !app.isPackaged) app.dock?.setIcon(icon);
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
    iconPath: icon,
    copyright: "CodeStrate",
  });

  registerHandlers();
  await applySavedTheme();
  setupApplicationMenu();
  await createMainWindow().catch((error) =>
    logger.error("main", "Failed to create main window", error),
  );
});
