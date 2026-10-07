import { useEffect, useState } from "react";
import { Eye, PencilLine, X } from "lucide-react";
import {
  Badge,
  Button,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Markdown,
  ScrollArea,
  Text,
  Textarea,
  toast,
} from "@glaze/core/components";

import type { LibraryItem, LibrarySnapshot, MemorySummary } from "@main/shared/types";

import { formatBytes, formatDateTime, relativeTime, shortenPath } from "../../lib/format";
import { HARNESS_STYLES, MEMORY_TYPE_LABELS, canTrash, isVirtualPath } from "../../lib/harness";
import { useMemoryDetail, useSaveMemory } from "../../lib/library-api";
import { findItem, projectLabel } from "../../lib/scope";
import { copyWithToast, revealPath } from "../item-actions";
import {
  DOCUMENT_MARKDOWN,
  DetailSection,
  DetailSkeleton,
  DetailTitle,
  MoreActionsMenu,
  PropertyList,
  RelatedItems,
  errorMessage,
  type PropertyRow,
} from "./detail-parts";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
/** Already shown as the title and description. */
const HEADER_KEYS = new Set(["name", "title", "description"]);

/** Flat `key: value` pairs from YAML frontmatter, shown as properties instead of raw YAML. */
function frontmatterRows(yaml: string): PropertyRow[] {
  const rows: PropertyRow[] = [];
  for (const line of yaml.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z][\w-]*):\s*(.+)$/.exec(line);
    if (!match || HEADER_KEYS.has(match[1].toLowerCase())) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    const label = match[1].charAt(0).toUpperCase() + match[1].slice(1).replace(/[_-]/g, " ");
    if (!rows.some((row) => row.label === label)) rows.push({ label, value, hint: value });
  }
  return rows;
}

type Mode = "preview" | "edit";

interface MemoryDetailPaneProps {
  memory: MemorySummary;
  library: LibrarySnapshot;
  onSelect: (id: string) => void;
  onClose: () => void;
  onRequestTrash: (item: LibraryItem) => void;
}

export function MemoryDetailPane({
  memory,
  library,
  onSelect,
  onClose,
  onRequestTrash,
}: MemoryDetailPaneProps) {
  const detail = useMemoryDetail(memory.id);
  const save = useSaveMemory();
  const [mode, setMode] = useState<Mode>("preview");
  const [draft, setDraft] = useState<string | null>(null);

  const content = detail.data?.content ?? "";
  const value = draft ?? content;
  const dirty = draft !== null && draft !== content;
  const isVirtual = isVirtualPath(memory.path);

  const linksTo = memory.links
    .map((id) => findItem(library, id))
    .filter((item): item is LibraryItem => item !== null);
  const linkedFrom = library.memories.filter((other) => other.links.includes(memory.id));
  const sessions = library.sessions.filter(
    (session) => session.filesTouched.includes(memory.path) || session.id === memory.sessionId,
  );

  const handleSave = async () => {
    if (draft === null || !dirty) return;
    try {
      await save.mutateAsync({ id: memory.id, content: draft });
      setDraft(null);
      toast.success(`Saved ${memory.title}`);
    } catch (error) {
      toast.error(`Couldn't save: ${errorMessage(error)}`);
    }
  };

  useEffect(() => {
    if (mode !== "edit") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const frontmatter = FRONTMATTER.exec(value);
  const body = frontmatter ? value.slice(frontmatter[0].length) : value;
  const location = isVirtual ? "Codex memory database" : shortenPath(memory.path, library.home);

  return (
    <ScrollArea
      actions={
        <>
          {memory.editable && mode === "preview" ? (
            <Button aria-label="Edit" title="Edit" onClick={() => setMode("edit")}>
              <PencilLine />
            </Button>
          ) : null}
          {mode === "edit" ? (
            <>
              <Button aria-label="Preview" title="Preview" onClick={() => setMode("preview")}>
                <Eye />
              </Button>
              <Button
                variant="accent"
                disabled={!dirty || save.isPending}
                onClick={() => void handleSave()}
              >
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </>
          ) : null}
          <MoreActionsMenu>
            <DropdownMenuItem
              icon="folder"
              disabled={isVirtual}
              onSelect={() => revealPath(memory.path)}
            >
              Reveal in Finder
            </DropdownMenuItem>
            <DropdownMenuItem
              icon="doc.on.doc"
              disabled={isVirtual}
              onSelect={() => void copyWithToast(memory.path, "Path")}
            >
              Copy Path
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon="trash"
              disabled={!canTrash(memory)}
              onSelect={() => onRequestTrash(memory)}
            >
              Move to Trash…
            </DropdownMenuItem>
          </MoreActionsMenu>
          <Button aria-label="Close" title="Close" onClick={onClose}>
            <X />
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-6 px-4 pb-8">
        <DetailTitle title={dirty ? `${memory.title} — Edited` : memory.title}>
          {memory.harnesses.map((harness) => (
            <Badge key={harness} color={HARNESS_STYLES[harness].badge}>
              {HARNESS_STYLES[harness].name}
            </Badge>
          ))}
          <Badge>{MEMORY_TYPE_LABELS[memory.memoryType]}</Badge>
          {!memory.editable ? <Badge>Read-only</Badge> : null}
        </DetailTitle>

        {memory.description ? (
          <Text color="secondary" className="-mt-3 text-pretty">
            {memory.description}
          </Text>
        ) : null}

        {mode === "preview" ? (
          <PropertyList
            rows={[
              { label: "Project", value: projectLabel(memory.cwd, library) },
              {
                label: "Applies to",
                value: memory.scope === "global" ? "All projects" : "This project",
              },
              { label: "Location", value: location, hint: memory.path },
              {
                label: "Updated",
                value: relativeTime(memory.updatedAt),
                hint: formatDateTime(memory.updatedAt),
              },
              { label: "Size", value: formatBytes(memory.size) },
              ...(frontmatter ? frontmatterRows(frontmatter[1]) : []),
            ]}
          />
        ) : null}

        {mode === "preview" && linksTo.length > 0 ? (
          <DetailSection title="Links To" count={linksTo.length}>
            <RelatedItems items={linksTo} onSelect={onSelect} />
          </DetailSection>
        ) : null}
        {mode === "preview" && linkedFrom.length > 0 ? (
          <DetailSection title="Linked From" count={linkedFrom.length}>
            <RelatedItems items={linkedFrom} onSelect={onSelect} />
          </DetailSection>
        ) : null}
        {mode === "preview" && sessions.length > 0 ? (
          <DetailSection
            title="Used in Sessions"
            count={sessions.length}
            defaultOpen={sessions.length <= 5}
          >
            <RelatedItems items={sessions} onSelect={onSelect} />
          </DetailSection>
        ) : null}

        {detail.isPending ? <DetailSkeleton /> : null}
        {detail.isError ? (
          <Text color="secondary">Couldn't open this file. {errorMessage(detail.error)}</Text>
        ) : null}

        {detail.data && mode === "edit" ? (
          <div className="flex flex-col gap-2">
            <Textarea
              aria-label={`Edit ${memory.title}`}
              className="max-h-none min-h-[60vh] font-mono text-small"
              value={value}
              spellCheck={false}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
            />
            <Text variant="small" color="tertiary">
              Press ⌘S to save. Agents read this file the next time they start.
            </Text>
          </div>
        ) : null}

        {detail.data && mode === "preview" ? (
          <DetailSection title="Contents">
            {body.trim() ? (
              <Markdown className={DOCUMENT_MARKDOWN}>{body}</Markdown>
            ) : (
              <Text color="tertiary">This file is empty.</Text>
            )}
          </DetailSection>
        ) : null}
      </div>
    </ScrollArea>
  );
}
