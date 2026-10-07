import * as fs from "fs";
import * as path from "path";

import type { HarnessId, MemorySummary, MemoryType } from "../shared/types.js";
import { HOME, oneLine, parseFrontmatter, readDirSafe, statOrNull } from "./util.js";

const MAX_MEMORY_BYTES = 512 * 1024;

export function memoryId(filePath: string): string {
  return `mem:${filePath}`;
}

export interface MarkdownMemoryOptions {
  harnesses: HarnessId[];
  memoryType: MemoryType;
  scope: "global" | "project";
  cwd: string | null;
  title?: string;
  description?: string;
}

/** Reads a Markdown context/memory file into a summary, resolving its links to other memory ids. */
export async function readMarkdownMemory(file: string, options: MarkdownMemoryOptions): Promise<MemorySummary | null> {
  const stat = await statOrNull(file);
  if (!stat?.isFile() || stat.size > MAX_MEMORY_BYTES) return null;
  let content: string;
  try {
    content = await fs.promises.readFile(file, "utf8");
  } catch {
    return null;
  }
  const { data, body } = parseFrontmatter(content);
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  const firstLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !line.startsWith("---"));
  return {
    id: memoryId(file),
    kind: "memory",
    harnesses: options.harnesses,
    memoryType: options.memoryType,
    scope: options.scope,
    title: options.title ?? data.name ?? (options.memoryType === "memory" ? heading : undefined) ?? path.basename(file),
    description: oneLine(data.description ?? options.description ?? firstLine ?? "", 200),
    path: file,
    cwd: options.cwd,
    updatedAt: stat.mtimeMs,
    size: stat.size,
    editable: true,
    links: extractLinks(content, path.dirname(file)).map(memoryId),
    sessionId: null,
  };
}

const MARKDOWN_EXT = /\.(md|mdc|markdown)$/i;

function resolveTarget(raw: string, baseDir: string): string | null {
  const target = raw.split("#")[0].trim();
  if (!target || /^[a-z]+:/i.test(target) || !MARKDOWN_EXT.test(target)) return null;
  if (target.startsWith("~/")) return path.join(HOME, target.slice(2));
  return path.resolve(baseDir, decodeURIComponent(target));
}

/** Markdown links, `@path` imports (CLAUDE.md style), and `[[wiki]]` links. */
export function extractLinks(content: string, baseDir: string): string[] {
  const targets = new Set<string>();
  for (const match of content.matchAll(/\]\(([^)\s]+)\)/g)) {
    const resolved = resolveTarget(match[1], baseDir);
    if (resolved) targets.add(resolved);
  }
  for (const match of content.matchAll(/(?:^|\s)@([~./\w-][^\s`'")]*)/gm)) {
    const resolved = resolveTarget(match[1], baseDir);
    if (resolved) targets.add(resolved);
  }
  for (const match of content.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
    const name = match[1].trim();
    if (name) targets.add(path.resolve(baseDir, MARKDOWN_EXT.test(name) ? name : `${name}.md`));
    if (targets.size > 100) break;
  }
  return [...targets].slice(0, 100);
}

interface ProjectFileRule {
  rel: string;
  harnesses: HarnessId[];
  memoryType: MemoryType;
}

const PROJECT_FILES: ProjectFileRule[] = [
  { rel: "CLAUDE.md", harnesses: ["claude-code"], memoryType: "instructions" },
  { rel: "CLAUDE.local.md", harnesses: ["claude-code"], memoryType: "instructions" },
  { rel: ".claude/CLAUDE.md", harnesses: ["claude-code"], memoryType: "instructions" },
  { rel: "AGENTS.md", harnesses: ["codex", "opencode", "cursor"], memoryType: "instructions" },
  { rel: ".cursorrules", harnesses: ["cursor"], memoryType: "rules" },
  { rel: "CONVENTIONS.md", harnesses: ["aider"], memoryType: "instructions" },
];

const PROJECT_DIRS: ProjectFileRule[] = [
  { rel: ".cursor/rules", harnesses: ["cursor"], memoryType: "rules" },
  { rel: ".claude/rules", harnesses: ["claude-code"], memoryType: "rules" },
];

/** Context files that live inside a project folder. */
export async function scanProjectMemories(projectPath: string): Promise<MemorySummary[]> {
  if (projectPath === "/") return [];
  const found: MemorySummary[] = [];
  for (const rule of PROJECT_FILES) {
    const memory = await readMarkdownMemory(path.join(projectPath, rule.rel), {
      harnesses: rule.harnesses,
      memoryType: rule.memoryType,
      scope: projectPath === HOME ? "global" : "project",
      cwd: projectPath,
      title: rule.rel,
    });
    if (memory) found.push(memory);
  }
  for (const rule of PROJECT_DIRS) {
    const dir = path.join(projectPath, rule.rel);
    for (const entry of await readDirSafe(dir)) {
      if (!entry.isFile() || !MARKDOWN_EXT.test(entry.name)) continue;
      const memory = await readMarkdownMemory(path.join(dir, entry.name), {
        harnesses: rule.harnesses,
        memoryType: rule.memoryType,
        scope: "project",
        cwd: projectPath,
        title: entry.name,
      });
      if (memory) found.push(memory);
    }
  }
  return found;
}
