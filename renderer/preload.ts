/**
 * Preload: the only bridge between the sandboxed renderer and the main process. It runs
 * in an isolated world and exposes a small, explicit API as `window.wefty`; the page
 * never gets `ipcRenderer` or Node itself.
 *
 * Built to out/preload/index.cjs (sandboxed preloads must be CommonJS).
 */
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";

/** Notification channels the main process pushes (see `ipcMain.broadcast`). */
const NOTIFICATION_CHANNELS = new Set([
  "library:changed",
  "terminal:data",
  "terminal:exit",
  "help:open",
  "tour:start",
  "theme:changed",
]);

const api = {
  ipc: {
    invoke<T = unknown>(channel: string, params?: unknown): Promise<T> {
      return ipcRenderer.invoke(channel, params) as Promise<T>;
    },
    /** Subscribe to a main-process notification. Returns an unsubscribe function. */
    on(channel: string, listener: (payload: unknown) => void): () => void {
      if (!NOTIFICATION_CHANNELS.has(channel)) {
        throw new Error(`Unknown notification channel: ${channel}`);
      }
      const wrapped = (_event: IpcRendererEvent, payload: unknown) => listener(payload);
      ipcRenderer.on(channel, wrapped);
      return () => {
        ipcRenderer.removeListener(channel, wrapped);
      };
    },
  },
  /** Absolute path of a file dropped from the OS file manager ("" if it has none). */
  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file);
  },
  platform: process.platform,
};

export type WeftyAPI = typeof api;

contextBridge.exposeInMainWorld("wefty", api);
