/**
 * Typed access to the preload bridge (`window.wefty`). Renderer code goes through here
 * instead of touching `window.wefty` directly.
 */

export function invoke<T>(channel: string, params?: unknown): Promise<T> {
  return window.wefty.ipc.invoke<T>(channel, params ?? {});
}

/** Subscribe to a main-process notification; returns an unsubscribe function. */
export function onNotification<T = unknown>(channel: string, listener: (payload: T) => void) {
  return window.wefty.ipc.on(channel, (payload) => listener(payload as T));
}

export function getPathForFile(file: File): string {
  return window.wefty.getPathForFile(file);
}
