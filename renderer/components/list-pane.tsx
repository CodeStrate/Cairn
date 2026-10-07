import type { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  EmptyState,
  List,
  ScrollArea,
} from "@glaze/core/components";

import type { LibraryItem, LibrarySnapshot } from "@main/shared/types";

import { dateBucket, plural, relativeTime } from "../lib/format";
import { MEMORY_TYPE_LABELS, canTrash } from "../lib/harness";
import { projectLabel } from "../lib/scope";
import { canReveal, copyWithToast, itemPath, revealPath } from "./item-actions";
import { HarnessBadge, ItemIcon } from "./item-visuals";

interface ListPaneProps {
  toolbar: ReactNode;
  library: LibrarySnapshot | undefined;
  items: LibraryItem[];
  loading: boolean;
  query: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRequestTrash: (item: LibraryItem) => void;
}

function describe(item: LibraryItem, library: LibrarySnapshot): string {
  const project = projectLabel(item.cwd, library);
  if (item.kind === "session") {
    return `${project} · ${relativeTime(item.updatedAt)} · ${plural(item.messageCount, "message")}`;
  }
  return `${project} · ${MEMORY_TYPE_LABELS[item.memoryType]} · ${relativeTime(item.updatedAt)}`;
}

function groupByDate(items: LibraryItem[]): { label: string; items: LibraryItem[] }[] {
  const groups: { label: string; items: LibraryItem[] }[] = [];
  for (const item of items) {
    const label = dateBucket(item.updatedAt);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-4" aria-hidden>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex h-14 items-center gap-3">
          <div className="size-8 shrink-0 rounded-md bg-control-subtle" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3.5 w-2/3 rounded bg-control-subtle" />
            <div className="h-3 w-1/2 rounded bg-control-subtle" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListPane({
  toolbar,
  library,
  items,
  loading,
  query,
  selectedId,
  onSelect,
  onRequestTrash,
}: ListPaneProps) {
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;

  let content: ReactNode;
  if (loading || !library) {
    content = <ListSkeleton />;
  } else if (items.length === 0) {
    content = query ? (
      <EmptyState
        placement="viewport"
        title="No Results"
        description={`Nothing matches “${query}”.`}
      />
    ) : (
      <EmptyState
        placement="viewport"
        title="Nothing Here Yet"
        description="Sessions and memories from your agents will appear here as soon as they exist on disk."
      />
    );
  } else {
    content = (
      <div className="px-2 pb-4">
        <List.Root
          items={items}
          getItemKey={(item) => item.id}
          selectedItem={selectedItem}
          onSelectedItemChange={(item) => onSelect(item?.id ?? null)}
        >
          {groupByDate(items).map((group) => (
            <List.Section key={group.label}>
              <List.SectionTitle>{group.label}</List.SectionTitle>
              {group.items.map((item) => (
                <ContextMenu key={item.id}>
                  <ContextMenuTrigger asChild>
                    <List.Item item={item}>
                      <List.ItemIcon>
                        <ItemIcon item={item} className="size-4 text-secondary" />
                      </List.ItemIcon>
                      <List.ItemContent>
                        <List.ItemTitle>{item.title}</List.ItemTitle>
                        <List.ItemDescription>{describe(item, library)}</List.ItemDescription>
                      </List.ItemContent>
                      <List.ItemAccessory>
                        <HarnessBadge item={item} />
                      </List.ItemAccessory>
                    </List.Item>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      icon="folder"
                      disabled={!canReveal(item)}
                      onSelect={() => revealPath(itemPath(item))}
                    >
                      Reveal in Finder
                    </ContextMenuItem>
                    {item.kind === "session" ? (
                      <ContextMenuItem
                        icon="terminal"
                        disabled={!item.resumeCommand}
                        onSelect={() => {
                          if (item.resumeCommand)
                            void copyWithToast(item.resumeCommand, "Resume command");
                        }}
                      >
                        Copy Resume Command
                      </ContextMenuItem>
                    ) : (
                      <ContextMenuItem
                        icon="doc.on.doc"
                        onSelect={() => void copyWithToast(item.path, "Path")}
                      >
                        Copy Path
                      </ContextMenuItem>
                    )}
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      icon="trash"
                      disabled={!canTrash(item)}
                      onSelect={() => onRequestTrash(item)}
                    >
                      Move to Trash…
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </List.Section>
          ))}
        </List.Root>
      </div>
    );
  }

  return <ScrollArea toolbar={toolbar}>{content}</ScrollArea>;
}
