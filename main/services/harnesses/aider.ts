import * as fs from "fs";
import * as path from "path";

import type { SessionSummary, TranscriptEntry } from "../../shared/types.js";
import { StatCache, oneLine, statOrNull, truncate } from "../util.js";

const HISTORY_FILE = ".aider.chat.history.md";
const MAX_HISTORY_BYTES = 32 * 1024 * 1024;
const MAX_ENTRY_CHARS = 12_000;
const HEADER = /^# aider chat started at (.+)$/gm;

const fileCache = new StatCache<SessionSummary[]>(500);

interface AiderBlock {
  startedAt: number;
  body: string;
}

function splitBlocks(content: string): AiderBlock[] {
  const headers = [...content.matchAll(HEADER)];
  return headers.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = headers[index + 1]?.index ?? content.length;
    const startedAt = Date.parse(match[1].trim().replace(" ", "T"));
    return { startedAt: Number.isNaN(startedAt) ? 0 : startedAt, body: content.slice(start, end) };
  });
}

/** Aider history: `#### ` lines are user prompts, `> ` lines are tool output, everything else is the model. */
function blockEntries(body: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  let role: TranscriptEntry["role"] | null = null;
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join("\n").trim();
    if (role && text) {
      entries.push({
        id: String(entries.length),
        role,
        text: truncate(text, MAX_ENTRY_CHARS),
        toolName: role === "tool" ? "aider" : undefined,
      });
    }
    buffer = [];
  };
  for (const line of body.split(/\r?\n/)) {
    const lineRole: TranscriptEntry["role"] = line.startsWith("#### ")
      ? "user"
      : line.startsWith("> ") || line === ">"
        ? "tool"
        : "assistant";
    if (lineRole === "assistant" && !line.trim() && role !== "assistant") continue;
    if (lineRole !== role) {
      flush();
      role = lineRole;
    }
    buffer.push(lineRole === "user" ? line.slice(5) : lineRole === "tool" ? line.replace(/^> ?/, "") : line);
  }
  flush();
  return entries;
}

async function parseHistory(file: string, cwd: string, mtimeMs: number): Promise<SessionSummary[]> {
  const content = await fs.promises.readFile(file, "utf8");
  const blocks = splitBlocks(content);
  return blocks.flatMap((block, index): SessionSummary[] => {
    const entries = blockEntries(block.body);
    const prompts = entries.filter((entry) => entry.role === "user");
    if (prompts.length === 0) return [];
    const nativeId = `${cwd}#${index}`;
    const updatedAt = blocks[index + 1]?.startedAt || mtimeMs;
    const firstPrompt = truncate(prompts[0].text, 400);
    return [
      {
        id: `aider:${nativeId}`,
        kind: "session",
        harness: "aider",
        nativeId,
        title: oneLine(firstPrompt, 80),
        firstPrompt,
        cwd,
        startedAt: block.startedAt || updatedAt,
        updatedAt,
        messageCount: entries.filter((entry) => entry.role !== "tool").length,
        gitBranch: null,
        model: null,
        filesTouched: [],
        sourcePath: file,
        resumeCommand: null,
      },
    ];
  });
}

export async function scanAider(projectPaths: string[]): Promise<SessionSummary[]> {
  const sessions: SessionSummary[] = [];
  for (const cwd of new Set(projectPaths)) {
    const file = path.join(cwd, HISTORY_FILE);
    const stat = await statOrNull(file);
    if (!stat?.isFile() || stat.size > MAX_HISTORY_BYTES) continue;
    let parsed = fileCache.get(file, stat);
    if (!parsed) {
      parsed = await parseHistory(file, cwd, stat.mtimeMs).catch(() => []);
      fileCache.set(file, stat, parsed);
    }
    sessions.push(...parsed);
  }
  return sessions;
}

export async function readAiderSession(session: SessionSummary): Promise<TranscriptEntry[]> {
  const index = Number(session.nativeId.slice(session.nativeId.lastIndexOf("#") + 1));
  const content = await fs.promises.readFile(session.sourcePath, "utf8");
  const block = splitBlocks(content)[index];
  return block ? blockEntries(block.body) : [];
}
