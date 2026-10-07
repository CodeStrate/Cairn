import * as fs from "fs";
import * as path from "path";

import type { MemorySummary, SessionSummary, TranscriptEntry } from "../../shared/types.js";
import { readMarkdownMemory } from "../memory-files.js";
import { XDG_DATA_HOME } from "../platform.js";
import {
  HOME,
  describeTool,
  isRecord,
  parseTimestamp,
  readDirSafe,
  shellQuote,
  str,
  truncate,
} from "../util.js";

const MAX_MESSAGES = 1500;
const MAX_ENTRY_CHARS = 12_000;

export function opencodeStorageDir(): string {
  return path.join(XDG_DATA_HOME, "opencode", "storage");
}

export const OPENCODE_CONFIG_DIR = path.join(HOME, ".config", "opencode");

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.promises.readFile(file, "utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function scanOpencode(): Promise<{
  sessions: SessionSummary[];
  memories: MemorySummary[];
}> {
  const storage = opencodeStorageDir();
  const sessionRoot = path.join(storage, "session");
  const sessions: SessionSummary[] = [];

  for (const project of await readDirSafe(sessionRoot)) {
    if (!project.isDirectory()) continue;
    for (const entry of await readDirSafe(path.join(sessionRoot, project.name))) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const info = await readJson(path.join(sessionRoot, project.name, entry.name));
      const id = info ? str(info.id) : null;
      if (!info || !id || str(info.parentID)) continue;
      const messageCount = (await readDirSafe(path.join(storage, "message", id))).length;
      if (messageCount === 0) continue;
      const time = isRecord(info.time) ? info.time : {};
      const cwd = str(info.directory);
      const updatedAt = parseTimestamp(time.updated) || parseTimestamp(time.created);
      sessions.push({
        id: `opencode:${id}`,
        kind: "session",
        harness: "opencode",
        nativeId: id,
        title: str(info.title) ?? "Untitled session",
        firstPrompt: "",
        cwd,
        startedAt: parseTimestamp(time.created) || updatedAt,
        updatedAt,
        messageCount,
        gitBranch: null,
        model: null,
        filesTouched: [],
        sourcePath: path.join(sessionRoot, project.name, entry.name),
        resumeCommand: cwd
          ? `cd ${shellQuote(cwd)} && opencode --session ${id}`
          : `opencode --session ${id}`,
      });
    }
  }

  const memories: MemorySummary[] = [];
  const globalAgents = await readMarkdownMemory(path.join(OPENCODE_CONFIG_DIR, "AGENTS.md"), {
    harnesses: ["opencode"],
    memoryType: "instructions",
    scope: "global",
    cwd: null,
    title: "AGENTS.md (opencode global)",
  });
  if (globalAgents) memories.push(globalAgents);

  return { sessions, memories };
}

export async function readOpencodeSession(session: SessionSummary): Promise<TranscriptEntry[]> {
  const storage = opencodeStorageDir();
  const messageDir = path.join(storage, "message", session.nativeId);
  const messages: { id: string; role: string; created: number }[] = [];
  for (const entry of (await readDirSafe(messageDir)).slice(0, MAX_MESSAGES)) {
    const message = await readJson(path.join(messageDir, entry.name));
    const id = message ? str(message.id) : null;
    if (!message || !id) continue;
    const time = isRecord(message.time) ? message.time : {};
    messages.push({
      id,
      role: str(message.role) ?? "assistant",
      created: parseTimestamp(time.created),
    });
  }
  messages.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));

  const entries: TranscriptEntry[] = [];
  for (const message of messages) {
    const partDir = path.join(storage, "part", message.id);
    const partFiles = (await readDirSafe(partDir)).map((entry) => entry.name).sort();
    let text = "";
    for (const name of partFiles) {
      const part = await readJson(path.join(partDir, name));
      if (!part) continue;
      if (part.type === "text" && part.synthetic !== true && typeof part.text === "string") {
        text += (text ? "\n\n" : "") + part.text;
      } else if (part.type === "tool") {
        const state = isRecord(part.state) ? part.state : {};
        entries.push({
          id: String(entries.length),
          role: "tool",
          toolName: str(part.tool) ?? "Tool",
          text: str(state.title) ?? describeTool(state.input, session.cwd),
        });
      }
    }
    if (text.trim()) {
      entries.push({
        id: String(entries.length),
        role: message.role === "user" ? "user" : "assistant",
        text: truncate(text.trim(), MAX_ENTRY_CHARS),
      });
    }
  }
  return entries;
}
