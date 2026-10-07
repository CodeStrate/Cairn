import { useState } from "react";
import { SquareTerminal, Wrench, X } from "lucide-react";
import {
  AIChat,
  Badge,
  Button,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleRoot,
  CollapsibleTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Markdown,
  ScrollArea,
  Text,
} from "@glaze/core/components";

import type {
  LibraryItem,
  LibrarySnapshot,
  SessionSummary,
  TranscriptEntry,
} from "@main/shared/types";

import { formatDateTime, relativeTime, shortenPath } from "../../lib/format";
import { canTrash } from "../../lib/harness";
import { useSessionDetail } from "../../lib/library-api";
import { projectLabel } from "../../lib/scope";
import { copyWithToast, revealPath } from "../item-actions";
import { HarnessBadge } from "../item-visuals";
import {
  DetailSection,
  DetailSkeleton,
  DetailTitle,
  MoreActionsMenu,
  PropertyList,
  RelatedItems,
  TRANSCRIPT_MARKDOWN,
  errorMessage,
} from "./detail-parts";

const PAGE_SIZE = 80;

type Block =
  | { kind: "message"; entry: TranscriptEntry }
  | { kind: "tools"; id: string; entries: TranscriptEntry[] };

/** Collapse consecutive tool calls into one compact block. */
function toBlocks(entries: TranscriptEntry[]): Block[] {
  const blocks: Block[] = [];
  for (const entry of entries) {
    const last = blocks[blocks.length - 1];
    if (entry.role === "tool") {
      if (last?.kind === "tools") last.entries.push(entry);
      else blocks.push({ kind: "tools", id: `tools-${entry.id}`, entries: [entry] });
    } else {
      blocks.push({ kind: "message", entry });
    }
  }
  return blocks;
}

function ToolGroup({ entries }: { entries: TranscriptEntry[] }) {
  const names = [...new Set(entries.map((entry) => entry.toolName ?? "Tool"))];
  const label =
    entries.length === 1
      ? `Used ${names[0]}`
      : `Used ${entries.length} tools · ${names.slice(0, 4).join(", ")}`;
  return (
    <CollapsibleRoot>
      <CollapsibleTrigger variant="section" className="min-w-0">
        <CollapsibleChevron />
        <Wrench className="size-3 shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1.5 flex flex-col gap-1 rounded-lg bg-well px-3 py-2">
          {entries.map((entry) => (
            <div key={entry.id} className="flex min-w-0 items-baseline gap-2">
              <Text variant="small-strong" color="secondary" className="shrink-0">
                {entry.toolName}
              </Text>
              <Text
                variant="small-mono"
                color="tertiary"
                className="min-w-0 truncate font-mono"
                title={entry.text}
              >
                {entry.text}
              </Text>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </CollapsibleRoot>
  );
}

function TranscriptMessage({ entry }: { entry: TranscriptEntry }) {
  if (entry.role === "system") {
    return (
      <Text variant="small" color="tertiary" className="line-clamp-3 break-words text-center">
        {entry.text}
      </Text>
    );
  }
  if (entry.role === "user") {
    return (
      <AIChat.Message.Root from="user">
        <AIChat.Message.Content className="min-w-0">
          <Text className="block whitespace-pre-wrap break-words">{entry.text}</Text>
        </AIChat.Message.Content>
      </AIChat.Message.Root>
    );
  }
  return (
    <AIChat.Message.Root from="assistant">
      <AIChat.Message.Content className="min-w-0">
        <Markdown className={TRANSCRIPT_MARKDOWN}>{entry.text}</Markdown>
      </AIChat.Message.Content>
    </AIChat.Message.Root>
  );
}

interface SessionDetailPaneProps {
  session: SessionSummary;
  library: LibrarySnapshot;
  onSelect: (id: string) => void;
  onClose: () => void;
  onRequestTrash: (item: LibraryItem) => void;
}

export function SessionDetailPane({
  session,
  library,
  onSelect,
  onClose,
  onRequestTrash,
}: SessionDetailPaneProps) {
  const detail = useSessionDetail(session.id);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const memoriesTouched = library.memories.filter(
    (memory) => session.filesTouched.includes(memory.path) || memory.sessionId === session.id,
  );
  const entries = detail.data?.entries ?? [];
  const blocks = toBlocks(entries.slice(0, visibleCount));
  const remaining = entries.length - visibleCount;

  const copyResume = () => {
    if (session.resumeCommand) void copyWithToast(session.resumeCommand, "Resume command");
  };

  return (
    <ScrollArea
      actions={
        <>
          <Button
            aria-label="Copy resume command"
            title={
              session.resumeCommand ? "Copy resume command" : "This harness can't resume sessions"
            }
            disabled={!session.resumeCommand}
            onClick={copyResume}
          >
            <SquareTerminal />
          </Button>
          <MoreActionsMenu>
            <DropdownMenuItem icon="folder" onSelect={() => revealPath(session.sourcePath)}>
              Reveal in Finder
            </DropdownMenuItem>
            <DropdownMenuItem
              icon="terminal"
              disabled={!session.resumeCommand}
              onSelect={copyResume}
            >
              Copy Resume Command
            </DropdownMenuItem>
            <DropdownMenuItem
              icon="doc.on.doc"
              onSelect={() => void copyWithToast(session.nativeId, "Session ID")}
            >
              Copy Session ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon="trash"
              disabled={!canTrash(session)}
              onSelect={() => onRequestTrash(session)}
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
        <DetailTitle title={session.title}>
          <HarnessBadge item={session} />
          {session.gitBranch ? <Badge>{session.gitBranch}</Badge> : null}
          {session.model ? <Badge>{session.model}</Badge> : null}
        </DetailTitle>

        <PropertyList
          rows={[
            { label: "Project", value: projectLabel(session.cwd, library) },
            {
              label: "Folder",
              value: session.cwd ? shortenPath(session.cwd, library.home) : "Unknown",
              hint: session.cwd ?? undefined,
            },
            { label: "Started", value: formatDateTime(session.startedAt) },
            {
              label: "Last active",
              value: relativeTime(session.updatedAt),
              hint: formatDateTime(session.updatedAt),
            },
            { label: "Messages", value: session.messageCount.toLocaleString() },
          ]}
        />

        {memoriesTouched.length > 0 ? (
          <DetailSection title="Memories" count={memoriesTouched.length}>
            <RelatedItems items={memoriesTouched} onSelect={onSelect} />
          </DetailSection>
        ) : null}

        {session.filesTouched.length > 0 ? (
          <DetailSection
            title="Files Touched"
            count={session.filesTouched.length}
            defaultOpen={false}
          >
            <div className="flex flex-col gap-1 rounded-lg bg-well px-3 py-2">
              {session.filesTouched.map((file) => (
                <Text
                  key={file}
                  variant="small-mono"
                  color="secondary"
                  className="truncate font-mono"
                  title={file}
                >
                  {shortenPath(file, session.cwd ?? library.home).replace(/^~\//, "")}
                </Text>
              ))}
            </div>
          </DetailSection>
        ) : null}

        <DetailSection title="Conversation" count={detail.data?.totalEntries}>
          <div className="flex min-w-0 flex-col gap-5">
            {detail.isPending ? <DetailSkeleton /> : null}
            {detail.isError ? (
              <Text color="secondary">
                Couldn't read this session. {errorMessage(detail.error)}
              </Text>
            ) : null}
            {detail.data && entries.length === 0 ? (
              <Text color="secondary">This session has no readable messages.</Text>
            ) : null}

            {blocks.map((block) =>
              block.kind === "tools" ? (
                <ToolGroup key={block.id} entries={block.entries} />
              ) : (
                <TranscriptMessage key={block.entry.id} entry={block.entry} />
              ),
            )}

            {remaining > 0 ? (
              <div className="flex justify-center">
                <Button onClick={() => setVisibleCount(visibleCount + PAGE_SIZE * 2)}>
                  Show {Math.min(remaining, PAGE_SIZE * 2)} more of {remaining.toLocaleString()}
                </Button>
              </div>
            ) : null}
            {detail.data?.truncated ? (
              <Text variant="small" color="tertiary" className="text-center">
                Very long session — only the first {detail.data.entries.length.toLocaleString()}{" "}
                entries are shown.
              </Text>
            ) : null}
          </div>
        </DetailSection>
      </div>
    </ScrollArea>
  );
}
