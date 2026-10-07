import { toast } from "@glaze/core/components";

import type { LibraryItem } from "@main/shared/types";

import { isVirtualPath } from "../lib/harness";
import { copyText, revealInFinder } from "../lib/library-api";
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
