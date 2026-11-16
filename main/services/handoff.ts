/**
 * No-AI handoff: turns a session transcript into a short Markdown brief another agent (or
 * another harness) can pick up from. Glaze-free so the MCP server can reuse it.
 */
import * as path from "path";

import type { MemorySummary, SessionDetail, TranscriptEntry } from "../shared/types.js";

const RECENT_TURNS = 12;
const TURN_CHARS = 1200;
const FIRST_PROMPT_CHARS = 2000;
const MAX_FILES = 40;
const OPEN_THREAD_SCAN = 6;
const MAX_OPEN_THREADS = 10;

const HARNESS_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  opencode: "opencode",
  aider: "Aider",
};

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max).trimEnd()} …`;
}

function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function relativeTo(file: string, cwd: string | null): string {
  if (!cwd) return file;
  const relative = path.relative(cwd, file);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : file;
}

/** Lines from the last few turns that read like unfinished work. */
function openThreads(turns: TranscriptEntry[]): string[] {
  const pattern =
    /(^\s*[-*]\s+\[ \])|\bTODO\b|\bnext steps?\b|\bremaining\b|\bstill need|\bnot yet\b|\bfollow[- ]up\b/i;
  const found: string[] = [];
  for (const turn of turns.slice(-OPEN_THREAD_SCAN)) {
    for (const line of turn.text.split("\n")) {
      const cleaned = line.trim();
      if (
        cleaned.length > 3 &&
        cleaned.length < 300 &&
        pattern.test(cleaned) &&
        !found.includes(cleaned)
      ) {
        found.push(cleaned);
        if (found.length >= MAX_OPEN_THREADS) return found;
      }
    }
  }
  return found;
}

export function buildHandoff(detail: SessionDetail, memories: MemorySummary[]): string {
  const { session, entries } = detail;
  const turns = entries.filter((entry) => entry.role === "user" || entry.role === "assistant");
  const firstPrompt = turns.find((entry) => entry.role === "user")?.text ?? session.firstPrompt;
  const recent = turns.slice(-RECENT_TURNS);
  const lines: string[] = [];

  lines.push(`# Handoff: ${session.title}`, "");
  const meta = [
    `Harness: ${HARNESS_NAMES[session.harness] ?? session.harness}`,
    session.model ? `Model: ${session.model}` : null,
    session.gitBranch ? `Branch: ${session.gitBranch}` : null,
  ].filter(Boolean);
  lines.push(`- ${meta.join(" · ")}`);
  if (session.cwd) lines.push(`- Project: \`${session.cwd}\``);
  lines.push(
    `- Started ${new Date(session.startedAt).toISOString()}, last active ${new Date(session.updatedAt).toISOString()}`,
  );
  lines.push(`- ${session.messageCount} messages; source \`${session.sourcePath}\``);
  if (session.resumeCommand) lines.push(`- Resume natively: \`${session.resumeCommand}\``);
  lines.push("");

  lines.push(
    "This is a summary of an earlier agent session. Continue the work from where it left off; ask before redoing anything already done.",
    "",
  );

  if (firstPrompt)
    lines.push("## Goal (first request)", "", quote(clip(firstPrompt, FIRST_PROMPT_CHARS)), "");

  const threads = openThreads(turns);
  if (threads.length > 0) {
    lines.push("## Open threads", "");
    for (const thread of threads) lines.push(`- ${thread.replace(/^[-*]\s+(\[ \]\s+)?/, "")}`);
    lines.push("");
  }

  if (recent.length > 0) {
    lines.push(`## Where it left off (last ${recent.length} turns)`, "");
    for (const turn of recent) {
      lines.push(
        `**${turn.role === "user" ? "User" : "Assistant"}:**`,
        "",
        clip(turn.text, TURN_CHARS),
        "",
      );
    }
  }

  if (session.filesTouched.length > 0) {
    lines.push(`## Files touched (${session.filesTouched.length})`, "");
    for (const file of session.filesTouched.slice(0, MAX_FILES))
      lines.push(`- \`${relativeTo(file, session.cwd)}\``);
    if (session.filesTouched.length > MAX_FILES)
      lines.push(`- …and ${session.filesTouched.length - MAX_FILES} more`);
    lines.push("");
  }

  if (memories.length > 0) {
    lines.push("## Related memory files", "");
    for (const memory of memories) lines.push(`- ${memory.title}: \`${memory.path}\``);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

/** Stable, filesystem-safe file name for a session's handoff. */
export function handoffFileName(sessionId: string): string {
  return `${sessionId.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 160)}.md`;
}
