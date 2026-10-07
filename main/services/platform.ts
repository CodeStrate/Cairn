/**
 * Everything that differs between operating systems lives here, so a future Windows or
 * Linux build only has to touch this file (plus the app shell).
 */
import * as os from "os";
import * as path from "path";

export const HOME = os.homedir();

/** Per-user app config root: ~/Library/Application Support, %APPDATA%, or $XDG_CONFIG_HOME. */
function userConfigRoot(): string {
  switch (process.platform) {
    case "darwin":
      return path.join(HOME, "Library", "Application Support");
    case "win32":
      return process.env.APPDATA || path.join(HOME, "AppData", "Roaming");
    default:
      return process.env.XDG_CONFIG_HOME || path.join(HOME, ".config");
  }
}

/** Cursor's VS Code-style user folder (holds `globalStorage/state.vscdb`). */
export const CURSOR_USER_DIR = path.join(userConfigRoot(), "Cursor", "User");

/** opencode follows XDG on every platform. */
export const XDG_DATA_HOME = process.env.XDG_DATA_HOME || path.join(HOME, ".local", "share");

/** The sqlite3 CLI ships with macOS; elsewhere it must be on PATH. */
export const SQLITE_BINARY = process.platform === "darwin" ? "/usr/bin/sqlite3" : "sqlite3";

export function isAbsolutePath(value: string): boolean {
  return path.isAbsolute(value);
}

/** True when `target` is `base` itself or inside it. */
export function isInside(target: string, base: string): boolean {
  const relative = path.relative(base, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
