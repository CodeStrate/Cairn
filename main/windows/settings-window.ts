import type { BrowserWindow } from "electron";

import { logger } from "../electron/runtime.js";
import { createSecureWindow } from "./secure-window.js";
import { getWindowUrl } from "./window-paths.js";

let settingsWindow: BrowserWindow | null = null;

export async function openSettingsWindow(): Promise<void> {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  logger.info("settings", "Creating settings window");
  settingsWindow = createSecureWindow({
    width: 600,
    height: 640,
    minWidth: 440,
    minHeight: 320,
    title: "Settings",
    center: true,
    minimizable: false,
    fullscreenable: false,
  });
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
  await settingsWindow.loadURL(getWindowUrl("settings-window.html"));
}

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow;
}
