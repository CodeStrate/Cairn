import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { execFile } from "child_process";
import { promisify } from "util";

import { HOME, SQLITE_BINARY, isAbsolutePath } from "./platform.js";

export { HOME };

const execFileAsync = promisify(execFile);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.promises.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function statOrNull(target: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.stat(target);
  } catch {
    return null;
  }
}

export async function readDirSafe(dir: string): Promise<fs.Dirent[]> {
  try {
    return await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Streams a JSONL file record by record. Return `false` from the callback to stop early. */
export async function readJsonLines(
  file: string,
  onRecord: (record: Record<string, unknown>) => void | boolean,
): Promise<void> {
  const stream = fs.createReadStream(file, { encoding: "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (isRecord(parsed) && onRecord(parsed) === false) break;
    }
  } finally {
    lines.close();
    stream.destroy();
  }
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function oneLine(text: string, max = 160): string {
  return truncate(text.replace(/\s+/g, " ").trim(), max);
}

/** Accepts ISO strings, epoch seconds, or epoch milliseconds. */
export function parseTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export async function querySqlite(dbPath: string, sql: string): Promise<Record<string, unknown>[]> {
  const { stdout } = await execFileAsync(SQLITE_BINARY, ["-readonly", "-json", dbPath, sql], {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 20_000,
  });
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const parsed: unknown = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export function assertSafeId(id: string): string {
  if (!SAFE_ID.test(id)) throw new Error(`Invalid identifier: ${id}`);
  return id;
}

export function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

export function stripSystemNoise(text: string): string {
  return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
}

/** Caches parsed results per file, invalidated when mtime or size changes. */
export class StatCache<T> {
  private readonly entries = new Map<string, { mtimeMs: number; size: number; value: T }>();

  constructor(private readonly maxEntries: number) {}

  get(file: string, stat: fs.Stats): T | undefined {
    const entry = this.entries.get(file);
    return entry && entry.mtimeMs === stat.mtimeMs && entry.size === stat.size
      ? entry.value
      : undefined;
  }

  set(file: string, stat: fs.Stats, value: T): void {
    if (!this.entries.has(file) && this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, value });
  }

  clear(): void {
    this.entries.clear();
  }
}

/** Bounded recursive file listing. */
export async function listFiles(
  dir: string,
  predicate: (name: string) => boolean,
  maxDepth: number,
  limit = 5000,
): Promise<string[]> {
  const results: string[] = [];
  async function walk(current: string, depth: number): Promise<void> {
    if (results.length >= limit) return;
    for (const entry of await readDirSafe(current)) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory() && depth < maxDepth) await walk(full, depth + 1);
      else if (entry.isFile() && predicate(entry.name)) results.push(full);
      if (results.length >= limit) return;
    }
  }
  await walk(dir, 0);
  return results;
}

export function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) return { data: {}, body: content };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (pair) data[pair[1]] = pair[2].replace(/^["']|["']$/g, "").trim();
  }
  return { data, body: content.slice(match[0].length) };
}

const decodedDirCache = new Map<string, string>();

/**
 * Claude Code stores projects under a lossy encoding of the cwd (`/`, `.`, `_` all become `-`).
 * Walk the filesystem to find the real directory; fall back to treating every dash as a slash.
 */
export function resolveEncodedClaudeDir(encoded: string): string {
  const cached = decodedDirCache.get(encoded);
  if (cached) return cached;
  const tokens = encoded.split("-").slice(1);
  let budget = 4000;
  const isDir = (candidate: string): boolean => {
    try {
      return fs.statSync(candidate).isDirectory();
    } catch {
      return false;
    }
  };
  const search = (index: number, current: string): string | null => {
    if (--budget < 0) return null;
    if (index >= tokens.length) return isDir(current) ? current : null;
    const token = tokens[index];
    if (token === "" && index + 1 < tokens.length) {
      if (isDir(current)) {
        const hidden = search(index + 2, `${current}/.${tokens[index + 1]}`);
        if (hidden) return hidden;
      }
      return null;
    }
    if (isDir(current)) {
      const nested = search(index + 1, `${current}/${token}`);
      if (nested) return nested;
    }
    for (const joiner of ["-", "_", ".", " "]) {
      const joined = search(index + 1, `${current}${joiner}${token}`);
      if (joined) return joined;
    }
    return null;
  };
  const resolved =
    (tokens.length > 0 ? search(1, `/${tokens[0]}`) : null) ??
    `/${tokens.filter(Boolean).join("/")}`;
  decodedDirCache.set(encoded, resolved);
  return resolved;
}

function relativeTo(cwd: string | null, file: string): string {
  if (cwd && file.startsWith(`${cwd}/`)) return file.slice(cwd.length + 1);
  if (file.startsWith(`${HOME}/`)) return `~/${file.slice(HOME.length + 1)}`;
  return file;
}

export function toolFilePath(input: Record<string, unknown>): string | null {
  for (const key of ["file_path", "notebook_path", "path", "filePath"]) {
    const value = str(input[key]);
    if (value && isAbsolutePath(value)) return value;
  }
  return null;
}

/** One-line description of a tool invocation for transcript rows. */
export function describeTool(input: unknown, cwd: string | null): string {
  if (typeof input === "string") return oneLine(input, 200);
  if (!isRecord(input)) return "";
  const file = toolFilePath(input);
  if (file) return relativeTo(cwd, file);
  const command = input.command ?? input.cmd;
  if (Array.isArray(command)) {
    const parts = command.filter((part): part is string => typeof part === "string");
    const script =
      parts.length >= 3 && /^-l?c$/.test(parts[1]) ? parts[parts.length - 1] : parts.join(" ");
    return `$ ${oneLine(script, 200)}`;
  }
  if (typeof command === "string") return `$ ${oneLine(command, 200)}`;
  for (const key of ["pattern", "query", "url", "description", "prompt", "skill", "title"]) {
    const value = str(input[key]);
    if (value) return oneLine(value, 200);
  }
  try {
    return oneLine(JSON.stringify(input), 200);
  } catch {
    return "";
  }
}

export async function writeFileAtomic(target: string, content: string): Promise<void> {
  const temp = path.join(
    path.dirname(target),
    `.${path.basename(target)}.cb-${process.pid}-${Date.now()}`,
  );
  await fs.promises.writeFile(temp, content, "utf8");
  try {
    await fs.promises.rename(temp, target);
  } catch (error) {
    await fs.promises.rm(temp, { force: true });
    throw error;
  }
}
