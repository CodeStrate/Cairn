import * as fs from "fs";
import * as path from "path";

import { app, logger } from "@glaze/core/backend";

import { HARNESS_IDS, type HarnessId } from "../shared/types.js";
import { isAbsolutePath } from "./platform.js";
import { isRecord, writeFileAtomic } from "./util.js";

/** Durable library preferences, stored in Application Support. */
export interface Preferences {
  /** Harnesses the user added to the library. Claude Code is the only default. */
  enabledHarnesses: HarnessId[];
  /** Custom display names keyed by absolute project path. */
  projectNames: Record<string, string>;
  /** Projects removed from the library (files untouched). */
  hiddenProjects: string[];
}

const DEFAULTS: Preferences = {
  enabledHarnesses: ["claude-code"],
  projectNames: {},
  hiddenProjects: [],
};

let cached: Preferences | null = null;
let saveChain: Promise<void> = Promise.resolve();

function preferencesFile(): string {
  return path.join(app.getPath("userData"), "preferences.json");
}

function normalize(raw: unknown): Preferences {
  if (!isRecord(raw)) return structuredClone(DEFAULTS);
  const enabled = Array.isArray(raw.enabledHarnesses)
    ? HARNESS_IDS.filter((id) => (raw.enabledHarnesses as unknown[]).includes(id))
    : DEFAULTS.enabledHarnesses;
  const projectNames: Record<string, string> = {};
  if (isRecord(raw.projectNames)) {
    for (const [key, value] of Object.entries(raw.projectNames)) {
      if (isAbsolutePath(key) && typeof value === "string" && value.trim())
        projectNames[key] = value.trim();
    }
  }
  const hiddenProjects = Array.isArray(raw.hiddenProjects)
    ? raw.hiddenProjects.filter(
        (value): value is string => typeof value === "string" && isAbsolutePath(value),
      )
    : [];
  return {
    enabledHarnesses: enabled.length > 0 ? [...enabled] : [...DEFAULTS.enabledHarnesses],
    projectNames,
    hiddenProjects: [...new Set(hiddenProjects)],
  };
}

export async function getPreferences(): Promise<Preferences> {
  if (cached) return cached;
  const file = preferencesFile();
  try {
    cached = normalize(JSON.parse(await fs.promises.readFile(file, "utf8")));
  } catch (error) {
    const code = isRecord(error) ? error.code : undefined;
    if (code !== "ENOENT") {
      // Keep the unreadable file for inspection instead of silently overwriting it.
      const backup = `${file}.corrupt-${Date.now()}`;
      logger.error("preferences", `Could not read ${file}; moved to ${backup}: ${String(error)}`);
      await fs.promises.rename(file, backup).catch(() => undefined);
    }
    cached = structuredClone(DEFAULTS);
  }
  return cached;
}

/** Applies `change` to the in-memory preferences and persists them atomically (saves are serialized). */
export async function updatePreferences(
  change: (draft: Preferences) => void,
): Promise<Preferences> {
  const draft = structuredClone(await getPreferences());
  change(draft);
  cached = normalize(draft);
  const snapshot = JSON.stringify(cached, null, 2);
  const file = preferencesFile();
  const write = saveChain.then(async () => {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await writeFileAtomic(file, snapshot);
  });
  saveChain = write.catch(() => undefined);
  await write;
  return cached;
}
