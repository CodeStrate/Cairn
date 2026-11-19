/**
 * Shared data contract between the backend scanners and the renderer.
 * Renderer code imports these with `import type` only.
 */

export interface CreatedTerminal {
  id: string;
  cwd: string;
  shell: string;
  folder: string;
}

export type HarnessId = "claude-code" | "codex" | "cursor" | "opencode";

export const HARNESS_IDS: readonly HarnessId[] = ["claude-code", "codex", "cursor", "opencode"];

export interface HarnessInfo {
  id: HarnessId;
  name: string;
  /** Added to the library by the user (only enabled harnesses are scanned). */
  enabled: boolean;
  available: boolean;
  sessionCount: number;
  memoryCount: number;
}

export interface SessionSummary {
  /** `${harness}:${nativeId}` */
  id: string;
  kind: "session";
  harness: HarnessId;
  nativeId: string;
  title: string;
  firstPrompt: string;
  cwd: string | null;
  startedAt: number;
  updatedAt: number;
  messageCount: number;
  gitBranch: string | null;
  model: string | null;
  /** Absolute paths the agent read or wrote (bounded). */
  filesTouched: string[];
  sourcePath: string;
  resumeCommand: string | null;
}

export type MemoryType = "instructions" | "memory" | "rules" | "generated";

export interface MemorySummary {
  /** `mem:${path}` */
  id: string;
  kind: "memory";
  harnesses: HarnessId[];
  memoryType: MemoryType;
  scope: "global" | "project";
  title: string;
  description: string;
  /** Absolute file path, or a virtual `codex-memory:<thread>` path for database-backed memories. */
  path: string;
  cwd: string | null;
  updatedAt: number;
  size: number;
  editable: boolean;
  /** Ids of other memories this one links to or imports. */
  links: string[];
  /** Session that produced this memory (generated memories only). */
  sessionId: string | null;
}

export type LibraryItem = SessionSummary | MemorySummary;

export interface ProjectSummary {
  /** Absolute project path. */
  id: string;
  path: string;
  name: string;
  sessionCount: number;
  memoryCount: number;
  harnesses: HarnessId[];
  updatedAt: number;
}

export interface ScanError {
  harness: HarnessId;
  message: string;
}

export interface LibrarySnapshot {
  home: string;
  harnesses: HarnessInfo[];
  sessions: SessionSummary[];
  memories: MemorySummary[];
  projects: ProjectSummary[];
  /** Projects the user removed from the library. */
  hiddenProjects: { path: string; name: string }[];
  scannedAt: number;
  errors: ScanError[];
}

export interface TranscriptEntry {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  toolName?: string;
}

export interface SessionDetail {
  session: SessionSummary;
  entries: TranscriptEntry[];
  totalEntries: number;
  truncated: boolean;
}

export interface TrashResult {
  library: LibrarySnapshot;
  trashed: number;
  /** Paths that could not be moved to the trash (Trash / Recycle Bin). */
  failed: string[];
}

export interface MemoryDetail {
  memory: MemorySummary;
  content: string;
}

export interface HandoffResult {
  sessionId: string;
  /** Markdown file under the app's userData, safe to hand to any agent as a path. */
  path: string;
  markdown: string;
}

/** What a path dropped from the file manager refers to in the library, if anything. */
export type PathMatch =
  | { kind: "item"; id: string }
  | { kind: "project"; path: string }
  | { kind: "none" };

export type ThemeSource = "system" | "light" | "dark";

/** A colour theme either follows light/dark (adaptive) or is always one of them. */
export type ThemeMode = "adaptive" | "light" | "dark";

export interface ThemeInfo {
  /** Selected colour theme (presets live in renderer/ui/themes.ts). */
  themeId: string;
  themeSource: ThemeSource;
  shouldUseDarkColors: boolean;
  /** The OS accent colour as `#rrggbb`, or null where the OS doesn't expose one (Linux). */
  accentColor: string | null;
}
