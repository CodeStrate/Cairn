import { BookText, Brain, ListChecks, MessagesSquare, Sparkles } from "lucide-react";
import { Badge } from "@glaze/core/components";

import type { HarnessId, LibraryItem } from "@main/shared/types";

import { HARNESS_STYLES, itemHarnessStyle } from "../lib/harness";

export function ItemIcon({ item, className }: { item: LibraryItem; className?: string }) {
  if (item.kind === "session") return <MessagesSquare className={className} />;
  switch (item.memoryType) {
    case "instructions":
      return <BookText className={className} />;
    case "rules":
      return <ListChecks className={className} />;
    case "generated":
      return <Sparkles className={className} />;
    case "memory":
      return <Brain className={className} />;
  }
}

export function HarnessBadge({ item }: { item: LibraryItem }) {
  const style = itemHarnessStyle(item);
  return <Badge color={style.badge}>{style.name}</Badge>;
}

/** Small color dot matching the harness's graph color. */
export function HarnessDot({ harness, color }: { harness?: HarnessId; color?: string }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
      <span
        className="size-2.5 rounded-full"
        style={{ backgroundColor: color ?? (harness ? HARNESS_STYLES[harness].color : undefined) }}
      />
    </span>
  );
}
