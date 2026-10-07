import type { ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import {
  Button,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleRoot,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Text,
} from "@glaze/core/components";

import type { LibraryItem } from "@main/shared/types";

import { ItemIcon } from "../item-visuals";

/** Keeps agent-written Markdown compact inside the narrow inspector. */
export const TRANSCRIPT_MARKDOWN =
  "min-w-0 break-words [&_h1]:text-large-strong [&_h2]:text-large-strong [&_h3]:text-strong [&_h4]:text-strong [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto";

export const DOCUMENT_MARKDOWN =
  "min-w-0 break-words [&_h1]:text-heading2 [&_h2]:text-large-strong [&_h3]:text-strong [&_h4]:text-strong [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto";

/** Full item title with its badges, shown once at the top of the inspector. */
export function DetailTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      <Text as="h2" variant="large-strong" className="line-clamp-4 text-pretty break-words">
        {title}
      </Text>
      {children ? <div className="flex flex-wrap items-center gap-1.5">{children}</div> : null}
    </header>
  );
}

export interface PropertyRow {
  label: string;
  value: ReactNode;
  /** Full value shown on hover when the row truncates. */
  hint?: string;
}

/** Inspector-style label/value rows in a recessed group. */
export function PropertyList({ rows }: { rows: PropertyRow[] }) {
  return (
    <dl className="flex flex-col divide-y divide-separator rounded-lg bg-well px-3">
      {rows.map((row) => (
        <div key={row.label} className="flex min-w-0 items-center justify-between gap-4 py-2">
          <dt className="shrink-0">
            <Text variant="small" color="secondary">
              {row.label}
            </Text>
          </dt>
          <dd className="min-w-0">
            <Text
              variant="small"
              className="block truncate text-right tabular-nums"
              title={row.hint}
            >
              {row.value}
            </Text>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Collapsible section with a small header and optional count. */
export function DetailSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <CollapsibleRoot defaultOpen={defaultOpen}>
      <CollapsibleTrigger variant="section">
        <CollapsibleChevron />
        <span>{title}</span>
        {count !== undefined ? (
          <span className="tabular-nums text-quaternary">{count.toLocaleString()}</span>
        ) : null}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-2">{children}</div>
      </CollapsibleContent>
    </CollapsibleRoot>
  );
}

/** Clickable rows for related sessions/memories. */
export function RelatedItems({
  items,
  onSelect,
}: {
  items: LibraryItem[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col rounded-lg bg-well p-1">
      {items.map((item) => (
        <Button
          key={item.id}
          variant="transparent"
          size="small"
          className="w-full min-w-0 justify-start"
          onClick={() => onSelect(item.id)}
        >
          <ItemIcon item={item} className="shrink-0 text-tertiary" />
          <span className="min-w-0 truncate">{item.title}</span>
        </Button>
      ))}
    </div>
  );
}

/** "More" button for the inspector toolbar; children are DropdownMenu items. */
export function MoreActionsMenu({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="More actions" title="More actions">
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-16 rounded-lg bg-control-subtle" />
      ))}
    </div>
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
