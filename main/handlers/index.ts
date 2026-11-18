/**
 * Handler Registration
 */

import { ipcMain, logger } from "../electron/runtime.js";
import { getSettingsWindow, openSettingsWindow } from "../windows/settings-window.js";
import { registerLibraryHandlers } from "./library.js";
import { registerTerminalHandlers } from "./terminal.js";
import { registerThemeHandlers } from "./theme.js";

export function registerHandlers(): void {
  ipcMain.handle("window:openSettings", async () => {
    await openSettingsWindow();
  });

  ipcMain.handle("window:closeSettings", async () => {
    getSettingsWindow()?.close();
  });

  // Sessions, memories, and context files across agent harnesses
  registerLibraryHandlers();

  // Embedded terminals (node-pty)
  registerTerminalHandlers();

  // Light / dark / system appearance
  registerThemeHandlers();

  logger.info("handlers", "IPC handlers registered");
}
