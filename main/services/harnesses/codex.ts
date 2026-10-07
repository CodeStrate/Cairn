import * as fs from "fs";
import * as path from "path";

import type { MemorySummary, SessionSummary, TranscriptEntry } from "../../shared/types.js";
import { readMarkdownMemory } from "../memory-files.js";
import {
  HOME,
  StatCache,
  assertSafeId,
  describeTool,
  isRecord,
  listFiles,
  oneLine,
  parseTimestamp,
  querySqlite,
  readDirSafe,
  readJsonLines,
  shellQuote,
  str,
  truncate,
} from "../util.js";

export const CODEX_ROOT = path.join(HOME, ".codex");
export const CODEX_SESSION_DIRS = [path.join(CODEX_ROOT, "sessions"), path.join(CODEX_ROOT, "archived_sessions")];

const MAX_FILES_TOUCHED = 40;
const MAX_ENTRIES = 3000;
const MAX_ENTRY_CHARS = 12_000;
const CODEX_MEMORY_PREFIX = "codex-memory:";

const summaryCache = new StatCache<SessionSummary | null>(4000);

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

/** Codex injects environment/instruction blocks as user messages; skip them. */
function isInjected(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith("# AGENTS.md instructions") || /^<([a-z_]+)[^>]*>[\s\S]*<\/\1>$/.test(trimmed)
  );
}

function patchFiles(patch: string, cwd: string | null): string[] {
  const files: string[] = [];
  for (const match of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) {
    const file = match[1].trim();
    files.push(path.isAbsolute(file) || !cwd ? file : path.join(cwd, file));
  }
  return files;
}

async function readThreadNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const index = path.join(CODEX_ROOT, "session_index.jsonl");
  try {
    await readJsonLines(index, (record) => {
      const id = str(record.id);
      const name = str(record.thread_name);
      if (id && name) names.set(id, name);
    });
  } catch {
    // Older Codex versions have no index.
  }
  return names;
}

async function summarize(file: string, stat: fs.Stats): Promise<SessionSummary | null> {
  const state = {
    id: null as string | null,
    cwd: null as string | null,
    gitBranch: null as string | null,
    model: null as string | null,
    firstPrompt: "",
    startedAt: 0,
    updatedAt: 0,
    messageCount: 0,
  };
  const files = new Set<string>();

  await readJsonLines(file, (record) => {
    const timestamp = parseTimestamp(record.timestamp);
    if (timestamp) {
      if (!state.startedAt || timestamp < state.startedAt) state.startedAt = timestamp;
      if (timestamp > state.updatedAt) state.updatedAt = timestamp;
    }
    const payload = isRecord(record.payload) ? record.payload : null;
    if (!payload) return;
    if (record.type === "session_meta") {
      state.id = str(payload.id) ?? str(payload.session_id) ?? state.id;
      state.cwd = str(payload.cwd) ?? state.cwd;
      if (isRecord(payload.git)) state.gitBranch = str(payload.git.branch) ?? state.gitBranch;
      return;
    }
    if (record.type === "turn_context") {
      state.model = str(payload.model) ?? state.model;
      state.cwd ??= str(payload.cwd);
      return;
    }
    if (record.type !== "response_item") return;
    if (payload.type === "message") {
      const text = contentText(payload.content).trim();
      if (!text) return;
      if (payload.role === "user" && !isInjected(text)) {
        state.messageCount++;
        if (!state.firstPrompt) state.firstPrompt = truncate(text, 400);
      } else if (payload.role === "assistant") {
        state.messageCount++;
      }
    } else if (payload.type === "custom_tool_call" && typeof payload.input === "string") {
      for (const touched of patchFiles(payload.input, state.cwd)) {
        if (files.size < MAX_FILES_TOUCHED) files.add(touched);
      }
    }
  });

  const nativeId = state.id ?? /([0-9a-f]{8}-[0-9a-f-]{27,})\.jsonl$/i.exec(file)?.[1] ?? null;
  if (!nativeId || state.messageCount === 0) return null;
  const updatedAt = state.updatedAt || stat.mtimeMs;
  return {
    id: `codex:${nativeId}`,
    kind: "session",
    harness: "codex",
    nativeId,
    title: state.firstPrompt ? oneLine(state.firstPrompt, 80) : "Untitled session",
    firstPrompt: state.firstPrompt,
    cwd: state.cwd,
    startedAt: state.startedAt || updatedAt,
    updatedAt,
    messageCount: state.messageCount,
    gitBranch: state.gitBranch,
    model: state.model,
    filesTouched: [...files],
    sourcePath: file,
    resumeCommand: state.cwd ? `cd ${shellQuote(state.cwd)} && codex resume ${nativeId}` : `codex resume ${nativeId}`,
  };
}

async function summarizeCached(file: string): Promise<SessionSummary | null> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(file);
  } catch {
    return null;
  }
  const cached = summaryCache.get(file, stat);
  if (cached !== undefined) return cached;
  const summary = await summarize(file, stat);
  summaryCache.set(file, stat, summary);
  return summary;
}

async function memoryDatabase(): Promise<string | null> {
  const candidates = (await readDirSafe(CODEX_ROOT))
    .map((entry) => entry.name)
    .filter((name) => /^memories_\d+\.sqlite$/.test(name))
    .sort((a, b) => Number(/\d+/.exec(b)?.[0]) - Number(/\d+/.exec(a)?.[0]));
  return candidates[0] ? path.join(CODEX_ROOT, candidates[0]) : null;
}

function humanizeSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Codex memory";
}

/** Memories Codex distilled from past threads (stored in its memories database). */
async function scanGeneratedMemories(): Promise<MemorySummary[]> {
  const db = await memoryDatabase();
  if (!db) return [];
  const rows = await querySqlite(
    db,
    "select thread_id, rollout_slug, generated_at, length(raw_memory) as size, substr(rollout_summary, 1, 400) as summary from stage1_outputs order by source_updated_at desc limit 500",
  );
  return rows.flatMap((row): MemorySummary[] => {
    const threadId = str(row.thread_id);
    if (!threadId) return [];
    return [
      {
        id: `mem:${CODEX_MEMORY_PREFIX}${threadId}`,
        kind: "memory",
        harnesses: ["codex"],
        memoryType: "generated",
        scope: "project",
        title: humanizeSlug(str(row.rollout_slug) ?? ""),
        description: oneLine(str(row.summary) ?? "", 200),
        path: `${CODEX_MEMORY_PREFIX}${threadId}`,
        cwd: null,
        updatedAt: parseTimestamp(row.generated_at),
        size: typeof row.size === "number" ? row.size : 0,
        editable: false,
        links: [],
        sessionId: `codex:${threadId}`,
      },
    ];
  });
}

export function isCodexMemoryPath(memoryPath: string): boolean {
  return memoryPath.startsWith(CODEX_MEMORY_PREFIX);
}

export async function readCodexMemory(memoryPath: string): Promise<string> {
  const threadId = assertSafeId(memoryPath.slice(CODEX_MEMORY_PREFIX.length));
  const db = await memoryDatabase();
  if (!db) throw new Error("Codex memories database not found");
  const rows = await querySqlite(
    db,
    `select raw_memory, rollout_summary from stage1_outputs where thread_id = '${threadId}' limit 1`,
  );
  const row = rows[0];
  if (!row) throw new Error(`Codex memory not found for thread ${threadId}`);
  const memory = str(row.raw_memory) ?? "";
  const summary = str(row.rollout_summary);
  return summary ? `${memory}\n\n---\n\n## Thread summary\n\n${summary}` : memory;
}

export async function scanCodex(): Promise<{ sessions: SessionSummary[]; memories: MemorySummary[] }> {
  const names = await readThreadNames();
  const sessions: SessionSummary[] = [];
  for (const dir of CODEX_SESSION_DIRS) {
    for (const file of await listFiles(dir, (name) => name.endsWith(".jsonl"), 4)) {
      const summary = await summarizeCached(file);
      if (!summary) continue;
      const name = names.get(summary.nativeId);
      sessions.push(name ? { ...summary, title: name } : summary);
    }
  }

  const memories: MemorySummary[] = [];
  const globalAgents = await readMarkdownMemory(path.join(CODEX_ROOT, "AGENTS.md"), {
    harnesses: ["codex"],
    memoryType: "instructions",
    scope: "global",
    cwd: null,
    title: "AGENTS.md (Codex global)",
  });
  if (globalAgents) memories.push(globalAgents);
  memories.push(...(await scanGeneratedMemories().catch(() => [])));

  return { sessions, memories };
}

export async function readCodexSession(session: SessionSummary): Promise<TranscriptEntry[]> {
  const entries: TranscriptEntry[] = [];
  await readJsonLines(session.sourcePath, (record) => {
    if (entries.length >= MAX_ENTRIES) return false;
    if (record.type !== "response_item") return;
    const payload = isRecord(record.payload) ? record.payload : null;
    if (!payload) return;
    if (payload.type === "message") {
      const text = contentText(payload.content).trim();
      if (!text) return;
      if (payload.role === "user" && !isInjected(text)) {
        entries.push({ id: String(entries.length), role: "user", text: truncate(text, MAX_ENTRY_CHARS) });
      } else if (payload.role === "assistant") {
        entries.push({ id: String(entries.length), role: "assistant", text: truncate(text, MAX_ENTRY_CHARS) });
      }
    } else if (payload.type === "function_call") {
      let args: unknown = payload.arguments;
      if (typeof args === "string") {
        try {
          args = JSON.parse(args);
        } catch {
          // Leave raw string.
        }
      }
      entries.push({
        id: String(entries.length),
        role: "tool",
        toolName: str(payload.name) ?? "Tool",
        text: describeTool(args, session.cwd),
      });
    } else if (payload.type === "custom_tool_call") {
      const input = typeof payload.input === "string" ? payload.input : "";
      const touched = patchFiles(input, null);
      entries.push({
        id: String(entries.length),
        role: "tool",
        toolName: str(payload.name) ?? "Tool",
        text: touched.length ? touched.join(", ") : oneLine(input, 200),
      });
    }
  });
  return entries;
}
