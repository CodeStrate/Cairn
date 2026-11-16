/**
 * Embedded terminal sessions: one PTY per tab. Glaze-free on purpose — the caller wires
 * output/exit events to IPC so this can be reused by an Electron shell or the MCP server.
 */
import { randomUUID } from "crypto";
import * as fs from "fs";
import { createRequire } from "module";
import * as path from "path";
import * as pty from "node-pty";

import { defaultShell, HOME, loginShellArgs } from "./platform.js";

export interface TerminalEvents {
  onData: (id: string, data: string) => void;
  onExit: (id: string, exitCode: number) => void;
}

export interface CreateTerminalOptions {
  cwd?: string | null;
  /** Typed into the shell once it starts, so the shell survives when the command exits. */
  command?: string | null;
  cols?: number;
  rows?: number;
}

const MAX_TERMINALS = 12;
/** Output is coalesced so a chatty process can't flood IPC with tiny messages. */
const FLUSH_MS = 8;
const FLUSH_BYTES = 64 * 1024;

interface Session {
  proc: pty.IPty;
  buffer: string;
  timer: NodeJS.Timeout | null;
}

const sessions = new Map<string, Session>();
let events: TerminalEvents | null = null;

let helperChecked = false;

/**
 * node-pty's tarball ships `spawn-helper` without the execute bit ("posix_spawnp failed").
 * The build fixes it; this is the fallback for dev runs and copies that lost the mode.
 */
function ensureSpawnHelperExecutable(): void {
  if (helperChecked || process.platform === "win32") return;
  helperChecked = true;
  try {
    const packageDir = path.dirname(createRequire(import.meta.url).resolve("node-pty/package.json"));
    const helper = path.join(packageDir, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper");
    if ((fs.statSync(helper).mode & 0o111) === 0) fs.chmodSync(helper, 0o755);
  } catch {
    // Unresolvable or read-only (e.g. a signed bundle); spawn will report the real error.
  }
}

export function setTerminalEvents(next: TerminalEvents): void {
  events = next;
}

function clampSize(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! > 0 && value! < 1000 ? value! : fallback;
}

function resolveCwd(cwd: string | null | undefined): string {
  if (cwd) {
    try {
      if (fs.statSync(cwd).isDirectory()) return cwd;
    } catch {
      // Fall through: the project folder may have been moved or deleted.
    }
  }
  return HOME;
}

function flush(id: string, session: Session): void {
  if (session.timer) clearTimeout(session.timer);
  session.timer = null;
  if (!session.buffer) return;
  const data = session.buffer;
  session.buffer = "";
  events?.onData(id, data);
}

export function createTerminal(options: CreateTerminalOptions): { id: string; cwd: string } {
  if (sessions.size >= MAX_TERMINALS)
    throw new Error(`At most ${MAX_TERMINALS} terminals can be open`);
  const cwd = resolveCwd(options.cwd);
  ensureSpawnHelperExecutable();
  const proc = pty.spawn(defaultShell(), loginShellArgs(), {
    name: "xterm-256color",
    cols: clampSize(options.cols, 80),
    rows: clampSize(options.rows, 24),
    cwd,
    env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" } as Record<
      string,
      string
    >,
  });

  const id = randomUUID();
  const session: Session = { proc, buffer: "", timer: null };
  sessions.set(id, session);

  proc.onData((data) => {
    session.buffer += data;
    if (session.buffer.length >= FLUSH_BYTES) flush(id, session);
    else if (!session.timer) session.timer = setTimeout(() => flush(id, session), FLUSH_MS);
  });
  proc.onExit(({ exitCode }) => {
    flush(id, session);
    sessions.delete(id);
    events?.onExit(id, exitCode);
  });

  if (options.command) proc.write(`${options.command}\r`);
  return { id, cwd };
}

function requireSession(id: string): Session {
  const session = sessions.get(id);
  if (!session) throw new Error("That terminal is no longer running");
  return session;
}

export function writeTerminal(id: string, data: string): void {
  requireSession(id).proc.write(data);
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  requireSession(id).proc.resize(clampSize(cols, 80), clampSize(rows, 24));
}

export function killTerminal(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  if (session.timer) clearTimeout(session.timer);
  try {
    session.proc.kill();
  } catch {
    // Already gone.
  }
}

export function killAllTerminals(): void {
  for (const id of [...sessions.keys()]) killTerminal(id);
}
