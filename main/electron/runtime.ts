/**
 * The Electron surface the rest of the backend uses. Keeping it in one module means
 * handlers and services import from here instead of from "electron" directly, and the
 * two helpers Glaze used to provide (`ipcMain.broadcast`, `logger`) live in one place.
 */
import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain as electronIpcMain,
  Menu,
  nativeTheme,
  shell,
  systemPreferences,
  type IpcMainInvokeEvent,
} from "electron";

export { app, BrowserWindow, clipboard, Menu, nativeTheme, shell, systemPreferences };

type Handler = (event: IpcMainInvokeEvent, params: unknown) => unknown;

export const ipcMain = {
  /** Request/response from the renderer (`window.wefty.ipc.invoke`). Thrown errors reach the caller. */
  handle(channel: string, handler: Handler): void {
    electronIpcMain.handle(channel, (event, params: unknown) => handler(event, params));
  },
  /** Push a notification to every open window (`window.wefty.ipc.on`). */
  broadcast(channel: string, payload: unknown): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(channel, payload);
    }
  },
};

function write(
  level: "debug" | "info" | "warn" | "error",
  scope: string,
  message: string,
  extra: unknown[],
) {
  const line = `[${new Date().toISOString()}] [${level}] [${scope}] ${message}`;
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(line, ...extra);
}

/** Scoped console logging; stdout/stderr are visible when launched from a terminal. */
export const logger = {
  debug: (scope: string, message: string, ...extra: unknown[]) => {
    if (!app.isPackaged) write("debug", scope, message, extra);
  },
  info: (scope: string, message: string, ...extra: unknown[]) =>
    write("info", scope, message, extra),
  warn: (scope: string, message: string, ...extra: unknown[]) =>
    write("warn", scope, message, extra),
  error: (scope: string, message: string, ...extra: unknown[]) =>
    write("error", scope, message, extra),
};
