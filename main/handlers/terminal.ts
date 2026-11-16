import { app, ipcMain } from "@glaze/core/backend";

import { isAbsolutePath } from "../services/platform.js";
import {
  createTerminal,
  killAllTerminals,
  killTerminal,
  resizeTerminal,
  setTerminalEvents,
  writeTerminal,
} from "../services/terminal.js";
import { isRecord } from "../services/util.js";

function requireString(params: unknown, key: string, channel: string, maxLength = 4096): string {
  const value = isRecord(params) ? params[key] : undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new Error(
      `${channel}: "${key}" must be a non-empty string up to ${maxLength} characters`,
    );
  }
  return value;
}

function optionalNumber(params: unknown, key: string): number | undefined {
  const value = isRecord(params) ? params[key] : undefined;
  return typeof value === "number" ? value : undefined;
}

export function registerTerminalHandlers(): void {
  setTerminalEvents({
    onData: (id, data) => ipcMain.broadcast("terminal:data", { id, data }),
    onExit: (id, exitCode) => ipcMain.broadcast("terminal:exit", { id, exitCode }),
  });

  ipcMain.handle("terminal:create", async (_event, params: unknown) => {
    const cwd = isRecord(params) && typeof params.cwd === "string" ? params.cwd : null;
    if (cwd !== null && !isAbsolutePath(cwd))
      throw new Error('terminal:create: "cwd" must be an absolute path');
    const command = isRecord(params) && typeof params.command === "string" ? params.command : null;
    if (command !== null && command.length > 8192)
      throw new Error('terminal:create: "command" is too long');
    return createTerminal({
      cwd,
      command,
      cols: optionalNumber(params, "cols"),
      rows: optionalNumber(params, "rows"),
    });
  });

  ipcMain.handle("terminal:write", async (_event, params: unknown) => {
    const data = isRecord(params) ? params.data : undefined;
    if (typeof data !== "string" || data.length > 1024 * 1024) {
      throw new Error('terminal:write: "data" must be a string up to 1 MB');
    }
    writeTerminal(requireString(params, "id", "terminal:write"), data);
  });

  ipcMain.handle("terminal:resize", async (_event, params: unknown) => {
    resizeTerminal(
      requireString(params, "id", "terminal:resize"),
      optionalNumber(params, "cols") ?? 80,
      optionalNumber(params, "rows") ?? 24,
    );
  });

  ipcMain.handle("terminal:kill", async (_event, params: unknown) => {
    killTerminal(requireString(params, "id", "terminal:kill"));
  });

  app.on("before-quit", killAllTerminals);
}
