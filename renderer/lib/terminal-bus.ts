import { onTerminalData } from "./terminal-api";

/**
 * Output arrives over IPC whether or not a terminal view is mounted (tab hidden, HMR,
 * StrictMode remount). The bus keeps a bounded history per terminal and replays it to
 * whichever view attaches, so a view never starts blank.
 */

const MAX_HISTORY_CHARS = 2_000_000;

interface Channel {
  history: string[];
  size: number;
  sink: ((data: string) => void) | null;
}

const channels = new Map<string, Channel>();
let subscribed = false;

function channel(id: string): Channel {
  let existing = channels.get(id);
  if (!existing) {
    existing = { history: [], size: 0, sink: null };
    channels.set(id, existing);
  }
  return existing;
}

function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;
  onTerminalData((id, data) => {
    const ch = channel(id);
    ch.history.push(data);
    ch.size += data.length;
    while (ch.size > MAX_HISTORY_CHARS && ch.history.length > 1)
      ch.size -= ch.history.shift()!.length;
    ch.sink?.(data);
  });
}

/** Start streaming a terminal's output into `write`, replaying what it missed. Returns detach. */
export function attachTerminal(id: string, write: (data: string) => void): () => void {
  ensureSubscribed();
  const ch = channel(id);
  for (const chunk of ch.history) write(chunk);
  ch.sink = write;
  return () => {
    if (ch.sink === write) ch.sink = null;
  };
}

/** Call once the terminal is closed for good. */
export function forgetTerminal(id: string): void {
  channels.delete(id);
}

/** Make sure output is being recorded even before the first view mounts. */
export function startRecording(): void {
  ensureSubscribed();
}
