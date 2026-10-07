import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import type { SessionSummary, TranscriptEntry } from "../../shared/types.js";
import {
  assertSafeId,
  describeTool,
  isRecord,
  parseTimestamp,
  pathExists,
  querySqlite,
  readDirSafe,
  str,
  truncate,
} from "../util.js";

import { CURSOR_USER_DIR } from "../platform.js";

export { CURSOR_USER_DIR };
const GLOBAL_DB = path.join(CURSOR_USER_DIR, "globalStorage", "state.vscdb");
const WORKSPACES_DIR = path.join(CURSOR_USER_DIR, "workspaceStorage");

const MAX_WORKSPACES = 400;
const MAX_ENTRY_CHARS = 12_000;

const LIST_SQL = `select substr(key, 14) as id,
  json_extract(value, '$.name') as name,
  json_extract(value, '$.createdAt') as createdAt,
  json_extract(value, '$.lastUpdatedAt') as updatedAt,
  coalesce(json_array_length(value, '$.fullConversationHeadersOnly'), 0)
    + coalesce(json_array_length(value, '$.conversation'), 0) as messageCount
from cursorDiskKV where key like 'composerData:%' and json_valid(value)`;

async function readWorkspaceFolder(file: string): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.promises.readFile(file, "utf8"));
    const folder = isRecord(parsed) ? str(parsed.folder) : null;
    return folder?.startsWith("file://") ? fileURLToPath(folder) : null;
  } catch {
    return null;
  }
}

/** Maps composer (chat) ids to the workspace folder they were created in. */
async function composerWorkspaces(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const dirs = (await readDirSafe(WORKSPACES_DIR))
    .filter((entry) => entry.isDirectory())
    .slice(0, MAX_WORKSPACES);
  for (const dir of dirs) {
    const base = path.join(WORKSPACES_DIR, dir.name);
    const folder = await readWorkspaceFolder(path.join(base, "workspace.json"));
    const db = path.join(base, "state.vscdb");
    if (!folder || !(await pathExists(db))) continue;
    const rows = await querySqlite(
      db,
      "select value from ItemTable where key = 'composer.composerData'",
    ).catch(() => []);
    const value = str(rows[0]?.value);
    if (!value) continue;
    try {
      const parsed: unknown = JSON.parse(value);
      const composers =
        isRecord(parsed) && Array.isArray(parsed.allComposers) ? parsed.allComposers : [];
      for (const composer of composers) {
        const id = isRecord(composer) ? str(composer.composerId) : null;
        if (id) map.set(id, folder);
      }
    } catch {
      // Unreadable workspace state.
    }
  }
  return map;
}

export async function scanCursor(): Promise<SessionSummary[]> {
  if (!(await pathExists(GLOBAL_DB))) return [];
  const [rows, workspaces] = await Promise.all([
    querySqlite(GLOBAL_DB, LIST_SQL),
    composerWorkspaces(),
  ]);
  return rows.flatMap((row): SessionSummary[] => {
    const id = str(row.id);
    const messageCount = Number(row.messageCount) || 0;
    if (!id || messageCount === 0) return [];
    const updatedAt = parseTimestamp(row.updatedAt) || parseTimestamp(row.createdAt);
    return [
      {
        id: `cursor:${id}`,
        kind: "session",
        harness: "cursor",
        nativeId: id,
        title: str(row.name) ?? "Untitled chat",
        firstPrompt: "",
        cwd: workspaces.get(id) ?? null,
        startedAt: parseTimestamp(row.createdAt) || updatedAt,
        updatedAt,
        messageCount,
        gitBranch: null,
        model: null,
        filesTouched: [],
        sourcePath: GLOBAL_DB,
        resumeCommand: null,
      },
    ];
  });
}

function bubbleEntry(
  bubble: Record<string, unknown>,
  index: number,
  cwd: string | null,
): TranscriptEntry | null {
  const text = str(bubble.text)?.trim();
  const tool = isRecord(bubble.toolFormerData) ? bubble.toolFormerData : null;
  if (tool && str(tool.name)) {
    let params: unknown = tool.params ?? tool.rawArgs;
    if (typeof params === "string") {
      try {
        params = JSON.parse(params);
      } catch {
        // Keep raw string.
      }
    }
    return {
      id: String(index),
      role: "tool",
      toolName: str(tool.name) ?? "Tool",
      text: describeTool(params, cwd),
    };
  }
  if (!text) return null;
  return {
    id: String(index),
    role: bubble.type === 1 ? "user" : "assistant",
    text: truncate(text, MAX_ENTRY_CHARS),
  };
}

export async function readCursorSession(session: SessionSummary): Promise<TranscriptEntry[]> {
  const id = assertSafeId(session.nativeId);
  const rows = await querySqlite(
    GLOBAL_DB,
    `select value from cursorDiskKV where key = 'composerData:${id}'`,
  );
  const value = str(rows[0]?.value);
  if (!value) return [];
  const composer: unknown = JSON.parse(value);
  if (!isRecord(composer)) return [];

  const entries: TranscriptEntry[] = [];
  if (Array.isArray(composer.conversation) && composer.conversation.length > 0) {
    for (const bubble of composer.conversation) {
      const entry = isRecord(bubble) ? bubbleEntry(bubble, entries.length, session.cwd) : null;
      if (entry) entries.push(entry);
    }
    return entries;
  }

  const headers = Array.isArray(composer.fullConversationHeadersOnly)
    ? composer.fullConversationHeadersOnly
    : [];
  const prefix = `bubbleId:${id}:`;
  const bubbleRows = await querySqlite(
    GLOBAL_DB,
    `select substr(key, ${prefix.length + 1}) as bubbleId, value from cursorDiskKV where key like '${prefix}%'`,
  );
  const bubbles = new Map<string, Record<string, unknown>>();
  for (const row of bubbleRows) {
    const bubbleId = str(row.bubbleId);
    const raw = str(row.value);
    if (!bubbleId || !raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) bubbles.set(bubbleId, parsed);
    } catch {
      // Skip malformed bubble.
    }
  }
  for (const header of headers) {
    const bubbleId = isRecord(header) ? str(header.bubbleId) : null;
    const bubble = bubbleId ? bubbles.get(bubbleId) : undefined;
    const entry = bubble ? bubbleEntry(bubble, entries.length, session.cwd) : null;
    if (entry) entries.push(entry);
  }
  return entries;
}
