import type { SessionSummary } from "@main/shared/types";

/**
 * How to continue a session in a terminal, per harness. The command runs inside the
 * session's own folder (the terminal is opened there), so no `cd` is needed.
 * Cursor and Aider have no resumable CLI session, so they only get a terminal in the folder.
 */
export interface ResumeSpec {
  cwd: string | null;
  command: string;
}

const SAFE_NATIVE_ID = /^[\w.-]+$/;

export function resumeSpec(session: SessionSummary): ResumeSpec | null {
  if (!SAFE_NATIVE_ID.test(session.nativeId)) return null;
  switch (session.harness) {
    case "claude-code":
      return { cwd: session.cwd, command: `claude --resume ${session.nativeId}` };
    case "codex":
      return { cwd: session.cwd, command: `codex resume ${session.nativeId}` };
    case "opencode":
      return { cwd: session.cwd, command: `opencode --session ${session.nativeId}` };
    default:
      return null;
  }
}

/** Single-quote a path for pasting into a POSIX shell, only when it needs it. */
export function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}
