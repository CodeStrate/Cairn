import type { DragEvent } from "react";
import { toast } from "@glaze/core/components";

import type { LibraryItem, SessionSummary } from "@main/shared/types";

import { isVirtualPath } from "../lib/harness";
import { copyText, revealInFinder } from "../lib/library-api";
import { resumeSpec, shellQuote } from "../lib/resume";
import type { OpenTerminalOptions } from "../lib/terminal-context";
import { errorMessage } from "./detail/detail-parts";

export function itemPath(item: LibraryItem): string {
  return item.kind === "session" ? item.sourcePath : item.path;
}

/** Codex database memories have virtual paths that Finder can't show. */
export function canReveal(item: LibraryItem): boolean {
  return !isVirtualPath(itemPath(item));
}

export function revealPath(target: string): void {
  revealInFinder(target).catch((error: unknown) => toast.error(errorMessage(error)));
}

export async function copyWithToast(text: string, label: string): Promise<void> {
  try {
    await copyText(text);
    toast.success(`${label} copied`);
  } catch (error) {
    toast.error(`Couldn't copy: ${errorMessage(error)}`);
  }
}

/** Text a dragged row carries: a memory's path, or a session's resume command. */
export function dragText(item: LibraryItem): string | null {
  if (item.kind === "session") return item.resumeCommand;
  return isVirtualPath(item.path) ? null : shellQuote(item.path);
}

export function dragProps(item: LibraryItem) {
  const text = dragText(item);
  if (!text) return {};
  return {
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData("text/plain", text);
      event.dataTransfer.effectAllowed = "copy";
    },
  };
}

type OpenTerminal = (options?: OpenTerminalOptions) => Promise<string | null>;

/** Resume a session in an embedded terminal. Returns false when its harness can't resume. */
export function resumeInTerminal(open: OpenTerminal, session: SessionSummary): boolean {
  const spec = resumeSpec(session);
  if (!spec) return false;
  void open({ cwd: spec.cwd, command: spec.command, title: session.title.slice(0, 24) });
  return true;
}

export function openFolderInTerminal(open: OpenTerminal, cwd: string | null): void {
  if (cwd) void open({ cwd });
}
