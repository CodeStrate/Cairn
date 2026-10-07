import * as fs from "fs";
import * as path from "path";

import type { MemorySummary, SessionSummary, TranscriptEntry } from "../../shared/types.js";
import { readMarkdownMemory } from "../memory-files.js";
import {
  HOME,
  StatCache,
  describeTool,
  isRecord,
  oneLine,
  parseTimestamp,
  readDirSafe,
  readJsonLines,
  resolveEncodedClaudeDir,
  shellQuote,
  str,
  stripSystemNoise,
  toolFilePath,
  truncate,
} from "../util.js";

export const CLAUDE_ROOT = path.join(HOME, ".claude");
export const CLAUDE_PROJECTS_DIR = path.join(CLAUDE_ROOT, "projects");

const MAX_FILES_TOUCHED = 40;
const MAX_ENTRIES = 3000;
const MAX_ENTRY_CHARS = 12_000;

const summaryCache = new StatCache<SessionSummary | null>(4000);

const NOISE = /^(<local-command-|<bash-(input|stdout|stderr)>|<task-notification>|<user-prompt-submit-hook>|Caveat: |\[Request interrupted)/;

interface UserPrompt {
  text: string;
  command: boolean;
}

function userPrompt(content: unknown): UserPrompt | null {
  let raw = "";
  if (typeof content === "string") raw = content;
  else if (Array.isArray(content)) {
    for (const part of content) {
      if (isRecord(part) && part.type === "text" && typeof part.text === "string") {
        raw += (raw ? "\n" : "") + part.text;
      }
    }
  }
  const text = stripSystemNoise(raw);
  if (!text) return null;
  const command = /<command-name>([^<]*)<\/command-name>/.exec(text);
  if (command) {
    const args = /<command-args>([^<]*)<\/command-args>/.exec(text)?.[1]?.trim();
    return { text: `${command[1].trim()}${args ? ` ${args}` : ""}`, command: true };
  }
  if (NOISE.test(text)) return null;
  return { text, command: false };
}

async function summarize(file: string, stat: fs.Stats): Promise<SessionSummary | null> {
  const nativeId = path.basename(file, ".jsonl");
  const state = {
    cwd: null as string | null,
    gitBranch: null as string | null,
    model: null as string | null,
    aiTitle: null as string | null,
    customTitle: null as string | null,
    summaryTitle: null as string | null,
    firstPrompt: "",
    firstCommand: "",
    startedAt: 0,
    updatedAt: 0,
    messageCount: 0,
  };
  const assistantIds = new Set<string>();
  const files = new Set<string>();

  await readJsonLines(file, (record) => {
    const type = record.type;
    if (type === "ai-title") {
      state.aiTitle = str(record.aiTitle) ?? state.aiTitle;
      return;
    }
    if (type === "custom-title") {
      state.customTitle = str(record.customTitle) ?? state.customTitle;
      return;
    }
    if (type === "summary") {
      state.summaryTitle ??= str(record.summary);
      return;
    }
    if ((type !== "user" && type !== "assistant") || record.isSidechain === true) return;
    state.cwd ??= str(record.cwd);
    state.gitBranch = str(record.gitBranch) ?? state.gitBranch;
    const timestamp = parseTimestamp(record.timestamp);
    if (timestamp) {
      if (!state.startedAt || timestamp < state.startedAt) state.startedAt = timestamp;
      if (timestamp > state.updatedAt) state.updatedAt = timestamp;
    }
    const message = isRecord(record.message) ? record.message : null;
    if (!message) return;

    if (type === "user") {
      if (record.isMeta === true) return;
      const prompt = userPrompt(message.content);
      if (!prompt) return;
      state.messageCount++;
      if (prompt.command) state.firstCommand ||= prompt.text;
      else if (!state.firstPrompt) state.firstPrompt = truncate(prompt.text, 400);
      return;
    }

    const model = str(message.model);
    if (model && model !== "<synthetic>") state.model = model;
    const parts = Array.isArray(message.content) ? message.content : [];
    for (const part of parts) {
      if (!isRecord(part)) continue;
      if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
        const id = str(message.id) ?? str(record.uuid) ?? String(state.messageCount);
        if (!assistantIds.has(id)) {
          assistantIds.add(id);
          state.messageCount++;
        }
      } else if (part.type === "tool_use" && isRecord(part.input) && files.size < MAX_FILES_TOUCHED) {
        const touched = toolFilePath(part.input);
        if (touched) files.add(touched);
      }
    }
  });

  if (state.messageCount === 0) return null;
  const updatedAt = state.updatedAt || stat.mtimeMs;
  const title =
    state.customTitle ??
    state.aiTitle ??
    state.summaryTitle ??
    oneLine(state.firstPrompt || state.firstCommand || "Untitled session", 80);
  return {
    id: `claude-code:${nativeId}`,
    kind: "session",
    harness: "claude-code",
    nativeId,
    title,
    firstPrompt: state.firstPrompt,
    cwd: state.cwd,
    startedAt: state.startedAt || updatedAt,
    updatedAt,
    messageCount: state.messageCount,
    gitBranch: state.gitBranch,
    model: state.model,
    filesTouched: [...files],
    sourcePath: file,
    resumeCommand: state.cwd
      ? `cd ${shellQuote(state.cwd)} && claude --resume ${nativeId}`
      : `claude --resume ${nativeId}`,
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

/** `MEMORY.md` index lines look like `- [Title](file.md) — hook`. */
async function readIndexHooks(memoryDir: string): Promise<Map<string, string>> {
  const hooks = new Map<string, string>();
  try {
    const index = await fs.promises.readFile(path.join(memoryDir, "MEMORY.md"), "utf8");
    for (const match of index.matchAll(/\[[^\]]*\]\(([^)]+\.md)\)\s*[—–-]\s*(.+)$/gm)) {
      hooks.set(path.resolve(memoryDir, match[1]), match[2].trim());
    }
  } catch {
    // No index file.
  }
  return hooks;
}

async function scanMemoryFolder(memoryDir: string, cwd: string): Promise<MemorySummary[]> {
  const hooks = await readIndexHooks(memoryDir);
  const memories: MemorySummary[] = [];
  for (const entry of await readDirSafe(memoryDir)) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const file = path.join(memoryDir, entry.name);
    const isIndex = entry.name === "MEMORY.md";
    const memory = await readMarkdownMemory(file, {
      harnesses: ["claude-code"],
      memoryType: "memory",
      scope: "project",
      cwd,
      title: isIndex ? "Memory Index" : undefined,
      description: hooks.get(file),
    });
    if (memory) memories.push(memory);
  }
  return memories;
}

export async function scanClaudeCode(): Promise<{ sessions: SessionSummary[]; memories: MemorySummary[] }> {
  const sessions: SessionSummary[] = [];
  const memories: MemorySummary[] = [];

  for (const dir of await readDirSafe(CLAUDE_PROJECTS_DIR)) {
    if (!dir.isDirectory()) continue;
    const dirPath = path.join(CLAUDE_PROJECTS_DIR, dir.name);
    const entries = await readDirSafe(dirPath);
    let dirCwd: string | null = null;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const summary = await summarizeCached(path.join(dirPath, entry.name));
      if (summary) {
        sessions.push(summary);
        dirCwd ??= summary.cwd;
      }
    }
    if (entries.some((entry) => entry.isDirectory() && entry.name === "memory")) {
      const cwd = dirCwd ?? resolveEncodedClaudeDir(dir.name);
      memories.push(...(await scanMemoryFolder(path.join(dirPath, "memory"), cwd)));
    }
  }

  const globalInstructions = await readMarkdownMemory(path.join(CLAUDE_ROOT, "CLAUDE.md"), {
    harnesses: ["claude-code"],
    memoryType: "instructions",
    scope: "global",
    cwd: null,
    title: "CLAUDE.md (global)",
  });
  if (globalInstructions) memories.push(globalInstructions);

  return { sessions, memories };
}

export async function readClaudeSession(session: SessionSummary): Promise<TranscriptEntry[]> {
  const entries: TranscriptEntry[] = [];
  let lastAssistantId: string | null = null;

  await readJsonLines(session.sourcePath, (record) => {
    if (entries.length >= MAX_ENTRIES) return false;
    const type = record.type;
    if ((type !== "user" && type !== "assistant") || record.isSidechain === true) return;
    const message = isRecord(record.message) ? record.message : null;
    if (!message) return;

    if (type === "user") {
      if (record.isMeta === true) return;
      const prompt = userPrompt(message.content);
      if (!prompt) return;
      lastAssistantId = null;
      entries.push({
        id: String(entries.length),
        role: prompt.command ? "system" : "user",
        text: truncate(prompt.text, MAX_ENTRY_CHARS),
      });
      return;
    }

    const messageId = str(message.id);
    const parts = Array.isArray(message.content) ? message.content : [];
    for (const part of parts) {
      if (!isRecord(part)) continue;
      if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
        const last = entries[entries.length - 1];
        if (last?.role === "assistant" && messageId && lastAssistantId === messageId) {
          last.text = truncate(`${last.text}\n\n${part.text}`, MAX_ENTRY_CHARS);
        } else {
          entries.push({ id: String(entries.length), role: "assistant", text: truncate(part.text, MAX_ENTRY_CHARS) });
        }
        lastAssistantId = messageId;
      } else if (part.type === "tool_use") {
        entries.push({
          id: String(entries.length),
          role: "tool",
          toolName: str(part.name) ?? "Tool",
          text: describeTool(part.input, session.cwd),
        });
        lastAssistantId = null;
      }
    }
  });

  return entries;
}
