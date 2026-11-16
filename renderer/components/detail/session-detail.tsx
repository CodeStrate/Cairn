import { useState } from "react";
import { ArrowDownUp, ClipboardCopy, Copy, SquareTerminal, Wrench, X } from "lucide-react";
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
  Input,
  Markdown,
  ScrollArea,
  Switch,
  Text,
  toast,
} from "@glaze/core/components";

import type {
  HandoffResult,
  LibraryItem,
  LibrarySnapshot,
  SessionSummary,
  TranscriptEntry,
} from "@main/shared/types";

import { formatDateTime, relativeTime, shortenPath } from "../../lib/format";
import { canTrash } from "../../lib/harness";
import { getHandoff, useSessionDetail } from "../../lib/library-api";
import { resumeSpec, shellQuote } from "../../lib/resume";
import { projectLabel } from "../../lib/scope";
import { useTerminals } from "../../lib/terminal-context";
import { copyWithToast, openFolderInTerminal, resumeInTerminal, revealPath } from "../item-actions";
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

function CopyMessageButton({ text }: { text: string }) {
  return (
    <Button
      variant="transparent"
      size="small"
      iconOnly
      aria-label="Copy message"
      title="Copy message"
      className="absolute -top-1 right-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      onClick={() => void copyWithToast(text, "Message")}
    >
      <Copy />
    </Button>
  );
}

function TranscriptMessage({ entry }: { entry: TranscriptEntry }) {
  return (
    <div className="group relative min-w-0">
      <TranscriptBody entry={entry} />
      {entry.role === "system" ? null : <CopyMessageButton text={entry.text} />}
    </div>
  );
}

function TranscriptBody({ entry }: { entry: TranscriptEntry }) {
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
  const { openTerminal, insertText } = useTerminals();
  const canResume = resumeSpec(session) !== null;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [query, setQuery] = useState("");
  const [showTools, setShowTools] = useState(true);
  const [newestFirst, setNewestFirst] = useState(false);

  const memoriesTouched = library.memories.filter(
    (memory) => session.filesTouched.includes(memory.path) || memory.sessionId === session.id,
  );
  const entries = detail.data?.entries ?? [];
  const needle = query.trim().toLowerCase();
  const shown = entries.filter(
    (entry) =>
      (showTools || entry.role !== "tool") &&
      (!needle ||
        entry.text.toLowerCase().includes(needle) ||
        (entry.toolName?.toLowerCase().includes(needle) ?? false)),
  );
  const ordered = newestFirst ? [...shown].reverse() : shown;
  const blocks = toBlocks(ordered.slice(0, visibleCount));
  const remaining = ordered.length - visibleCount;

  // Handoff: a Markdown brief of this session (see main/services/handoff.ts) that any
  // agent can pick up, including one from a different harness.
  const withHandoff = async (use: (handoff: HandoffResult) => unknown) => {
    try {
      await use(await getHandoff(session.id));
    } catch (error) {
      toast.error(`Couldn't build the handoff: ${errorMessage(error)}`);
    }
  };
  const copyHandoff = () =>
    void withHandoff((handoff) => copyWithToast(handoff.markdown, "Handoff"));
  const insertHandoffPath = () =>
    void withHandoff((handoff) => insertText(shellQuote(handoff.path), session.cwd));
  const continueIn = (cli: "claude" | "codex", name: string) =>
    void withHandoff((handoff) =>
      openTerminal({
        cwd: session.cwd,
        command: `${cli} ${shellQuote(`Read ${handoff.path} and continue the work it describes.`)}`,
        title: `${name}: ${session.title.slice(0, 18)}`,
      }),
    );

  const copyResume = () => {
    if (session.resumeCommand) void copyWithToast(session.resumeCommand, "Resume command");
  };

  return (
    <ScrollArea
      actions={
        <>
          <Button
            aria-label="Resume in terminal"
            title={canResume ? "Resume in terminal" : "This harness can't resume sessions"}
            disabled={!canResume}
            onClick={() => resumeInTerminal(openTerminal, session)}
          >
            <SquareTerminal />
          </Button>
          <Button
            aria-label="Copy handoff"
            title="Copy handoff (Markdown summary)"
            onClick={copyHandoff}
          >
            <ClipboardCopy />
          </Button>
          <MoreActionsMenu>
            <DropdownMenuItem icon="doc.on.clipboard" onSelect={copyHandoff}>
              Copy Handoff
            </DropdownMenuItem>
            <DropdownMenuItem icon="text.insert" onSelect={insertHandoffPath}>
              Insert Handoff Path in Terminal
            </DropdownMenuItem>
            <DropdownMenuItem
              icon="arrow.right.circle"
              onSelect={() => continueIn("claude", "Claude")}
            >
              Continue in Claude Code
            </DropdownMenuItem>
            <DropdownMenuItem
              icon="arrow.right.circle"
              onSelect={() => continueIn("codex", "Codex")}
            >
              Continue in Codex
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon="folder" onSelect={() => revealPath(session.sourcePath)}>
              Reveal in Finder
            </DropdownMenuItem>
            <DropdownMenuItem
              icon="terminal"
              disabled={!session.cwd}
              onSelect={() => openFolderInTerminal(openTerminal, session.cwd)}
            >
              Open Folder in Terminal
            </DropdownMenuItem>
            <DropdownMenuItem
              icon="doc.on.doc"
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
            {entries.length > 0 ? (
              <div className="flex min-w-0 items-center gap-2">
                <Input
                  size="small"
                  className="min-w-0 flex-1"
                  placeholder="Search conversation"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setVisibleCount(PAGE_SIZE);
                  }}
                />
                <label className="flex shrink-0 items-center gap-1.5">
                  <Switch
                    checked={showTools}
                    onCheckedChange={setShowTools}
                    aria-label="Show tool calls"
                  />
                  <Text variant="small" color="secondary">
                    Tools
                  </Text>
                </label>
                <Button
                  size="small"
                  variant="transparent"
                  iconOnly
                  aria-label={newestFirst ? "Show oldest first" : "Show newest first"}
                  title={
                    newestFirst
                      ? "Newest first — click for oldest first"
                      : "Oldest first — click for newest first"
                  }
                  onClick={() => {
                    setNewestFirst(!newestFirst);
                    setVisibleCount(PAGE_SIZE);
                  }}
                >
                  <ArrowDownUp />
                </Button>
              </div>
            ) : null}
            {needle ? (
              <Text variant="small" color="tertiary">
                {shown.length === 0
                  ? `No messages match “${query.trim()}”.`
                  : `${shown.length.toLocaleString()} matching ${shown.length === 1 ? "entry" : "entries"}`}
              </Text>
            ) : null}
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
