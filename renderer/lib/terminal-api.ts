function ipc() {
  return window.glazeAPI.glaze.ipc;
}

export interface CreatedTerminal {
  id: string;
  cwd: string;
}

export function createTerminal(input: {
  cwd?: string | null;
  command?: string | null;
  cols?: number;
  rows?: number;
}): Promise<CreatedTerminal> {
  return ipc().invoke<CreatedTerminal>("terminal:create", input);
}

export function writeTerminal(id: string, data: string): Promise<void> {
  return ipc().invoke<void>("terminal:write", { id, data });
}

export function resizeTerminal(id: string, cols: number, rows: number): Promise<void> {
  return ipc().invoke<void>("terminal:resize", { id, cols, rows });
}

export function killTerminal(id: string): Promise<void> {
  return ipc().invoke<void>("terminal:kill", { id });
}

export function onTerminalData(handler: (id: string, data: string) => void): () => void {
  return ipc().onNotification("terminal:data", (payload: unknown) => {
    const { id, data } = payload as { id: string; data: string };
    handler(id, data);
  });
}

export function onTerminalExit(handler: (id: string, exitCode: number) => void): () => void {
  return ipc().onNotification("terminal:exit", (payload: unknown) => {
    const { id, exitCode } = payload as { id: string; exitCode: number };
    handler(id, exitCode);
  });
}
