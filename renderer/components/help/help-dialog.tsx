import type { ReactNode } from "react";
import { Button, Dialog, Text } from "@glaze/core/components";

interface HelpDialogProps {
  onClose: () => void;
  onStartTour: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <Text variant="large-strong">{title}</Text>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <Text color="secondary">
      <Text as="span" variant="strong" color="primary">
        {term}
      </Text>{" "}
      — {children}
    </Text>
  );
}

function Keys({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded bg-surface-well px-1 py-px font-mono text-[0.85em]">{children}</kbd>
  );
}

export function HelpDialog({ onClose, onStartTour }: HelpDialogProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="large"
      title="Wefty Help"
      description="Your coding agents' sessions and memories, in one place."
      showCloseButton
    >
      <div className="flex max-h-[62vh] flex-col gap-6 overflow-y-auto pr-1">
        <div className="flex items-center gap-3 rounded-lg bg-surface-well p-3">
          <Text color="secondary" className="min-w-0 flex-1">
            New here? The tour points at each part of the window.
          </Text>
          <Button variant="accent" size="small" onClick={onStartTour}>
            Start Tour
          </Button>
        </div>

        <Section title="The library">
          <Item term="Harnesses">
            Claude Code is scanned by default. Add Codex, Cursor, opencode, or Aider with the + next
            to Harnesses; only the ones you add are read.
          </Item>
          <Item term="Projects">
            One per working folder. Right-click to rename, open in the terminal, remove from the
            library (restore it in Settings), or move its agent data to the Trash.
          </Item>
          <Item term="Privacy">
            Everything is read from and written to local files. Nothing leaves your Mac.
          </Item>
        </Section>

        <Section title="Views">
          <Item term="Timeline">
            A lane per project. Bars are sessions, from first to last message; diamonds are memory
            files at their last edit. Hover lights up related items. Drag empty space or scroll
            sideways to pan, <Keys>⌘</Keys>-scroll or pinch to zoom, and Fit to reset.
          </Item>
          <Item term="Graph">
            Projects anchor clusters; dashed links join memories that reference each other and
            sessions that touched a memory. Drag nodes to rearrange.
          </Item>
          <Item term="List">Everything grouped by date, with a context menu on each row.</Item>
        </Section>

        <Section title="Sessions">
          <Item term="Transcript">
            Open a session to read it. Search inside it, hide tool calls, flip to newest first, and
            hover a message to copy it.
          </Item>
          <Item term="Resume">
            The terminal button resumes the session in its own folder — Claude Code, Codex, and
            opencode support this. Cursor and Aider sessions can only open their folder.
          </Item>
          <Item term="Handoff">
            Builds a Markdown brief: the goal, open threads, the last turns, files touched, and
            related memories. Copy it, insert its path in the terminal, or Continue in Claude Code
            or Codex to pick the work up in a fresh session — across harnesses too.
          </Item>
        </Section>

        <Section title="Terminal">
          <Item term="Open">
            The terminal button in the toolbar, “Open in Terminal” on a project, or “Open Folder in
            Terminal” on any item. Each tab is a login shell; drag the panel’s left edge to resize.
          </Item>
          <Item term="Tabs">
            Hiding the panel keeps tabs and scrollback. Closing a tab ends its shell.
          </Item>
        </Section>

        <Section title="Drag and drop">
          <Item term="Into the terminal">
            Drag a list row, timeline bar, or graph node (drag it past the canvas edge) onto the
            terminal. A memory types its path, a session its resume command — nothing runs until you
            press Enter. Files from Finder type their paths.
          </Item>
          <Item term="Into Wefty">
            Drop a session transcript, a memory file, or a known project folder from Finder onto the
            window to open it.
          </Item>
        </Section>

        <Section title="Shortcuts">
          <Item term="Settings">
            <Keys>⌘ ,</Keys>
          </Item>
          <Item term="Help">
            <Keys>⌘ ?</Keys>
          </Item>
          <Item term="Tour">
            <Keys>←</Keys> <Keys>→</Keys> to move, <Keys>Esc</Keys> to leave.
          </Item>
        </Section>
      </div>
    </Dialog>
  );
}
