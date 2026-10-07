/**
 * Handler Registration
 */

import * as path from "path";
import { fileURLToPath } from "url";

import { registerLibraryHandlers } from "./library.js";
import { getSettingsWindow, openSettingsWindow } from "../windows/settings-window.js";

import { ipcMain, logger } from "@glaze/core/backend";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function registerHandlers(): void {
  // Return the .glaze project path (used for deep links back to the host)
  // __dirname = build/main, so two levels up is the app root
  ipcMain.handle("app:getProjectPath", async () => {
    return path.join(__dirname, "..", "..");
  });

  ipcMain.handle("window:openSettings", async () => {
    await openSettingsWindow();
  });

  ipcMain.handle("window:closeSettings", async () => {
    getSettingsWindow()?.close();
  });

  // Sessions, memories, and context files across agent harnesses
  registerLibraryHandlers();

  logger.info("handlers", "IPC handlers registered");
}
