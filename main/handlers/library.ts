import { app, clipboard, ipcMain, shell } from "@glaze/core/backend";

import {
  getLibrary,
  getMemoryDetail,
  getSessionDetail,
  isKnownPath,
  renameProject,
  saveMemory,
  setHarnessEnabled,
  setProjectHidden,
  startWatching,
  stopWatching,
  trashItem,
  trashProject,
} from "../services/library.js";
import { HARNESS_IDS, type HarnessId } from "../shared/types.js";
import { isAbsolutePath } from "../services/platform.js";
import { isRecord } from "../services/util.js";

function requireBoolean(params: unknown, key: string, channel: string): boolean {
  const value = isRecord(params) ? params[key] : undefined;
  if (typeof value !== "boolean") throw new Error(`${channel}: "${key}" must be a boolean`);
  return value;
}

function requireProjectPath(params: unknown, channel: string): string {
  const value = requireString(params, "path", channel);
  if (!isAbsolutePath(value))
    throw new Error(`${channel}: "path" must be an absolute project path`);
  return value;
}

function requireString(params: unknown, key: string, channel: string, maxLength = 4096): string {
  const value = isRecord(params) ? params[key] : undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new Error(
      `${channel}: "${key}" must be a non-empty string up to ${maxLength} characters`,
    );
  }
  return value;
}

export function registerLibraryHandlers(): void {
  ipcMain.handle("library:get", async (_event, params: unknown) => {
    startWatching();
    return getLibrary(isRecord(params) && params.force === true);
  });

  ipcMain.handle("session:get", async (_event, params: unknown) => {
    return getSessionDetail(requireString(params, "id", "session:get"));
  });

  ipcMain.handle("memory:get", async (_event, params: unknown) => {
    return getMemoryDetail(requireString(params, "id", "memory:get"));
  });

  ipcMain.handle("memory:save", async (_event, params: unknown) => {
    const id = requireString(params, "id", "memory:save");
    const content = isRecord(params) ? params.content : undefined;
    if (typeof content !== "string" || content.length > 2 * 1024 * 1024) {
      throw new Error('memory:save: "content" must be a string up to 2 MB');
    }
    return saveMemory(id, content);
  });

  ipcMain.handle("harness:setEnabled", async (_event, params: unknown) => {
    const id = requireString(params, "id", "harness:setEnabled");
    if (!(HARNESS_IDS as string[]).includes(id))
      throw new Error(`harness:setEnabled: unknown harness "${id}"`);
    return setHarnessEnabled(
      id as HarnessId,
      requireBoolean(params, "enabled", "harness:setEnabled"),
    );
  });

  ipcMain.handle("project:rename", async (_event, params: unknown) => {
    const projectPath = requireProjectPath(params, "project:rename");
    const name = isRecord(params) ? params.name : undefined;
    if (name !== null && (typeof name !== "string" || name.length > 200)) {
      throw new Error(
        'project:rename: "name" must be a string up to 200 characters, or null to reset',
      );
    }
    return renameProject(projectPath, name);
  });

  ipcMain.handle("project:setHidden", async (_event, params: unknown) => {
    const projectPath = requireProjectPath(params, "project:setHidden");
    return setProjectHidden(projectPath, requireBoolean(params, "hidden", "project:setHidden"));
  });

  ipcMain.handle("project:trash", async (_event, params: unknown) => {
    return trashProject(requireProjectPath(params, "project:trash"));
  });

  ipcMain.handle("item:trash", async (_event, params: unknown) => {
    return trashItem(requireString(params, "id", "item:trash"));
  });

  ipcMain.handle("item:reveal", async (_event, params: unknown) => {
    const target = requireString(params, "path", "item:reveal");
    if (!(await isKnownPath(target)))
      throw new Error(`item:reveal: ${target} is not part of the library`);
    shell.showItemInFolder(target);
  });

  ipcMain.handle("item:copyText", async (_event, params: unknown) => {
    clipboard.writeText(requireString(params, "text", "item:copyText", 200_000));
  });

  app.on("before-quit", stopWatching);
}
