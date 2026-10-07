# Cairn

One library for everything your coding agents remember.

Cairn reads the session histories, memories, and context files that agent harnesses leave on disk and shows them in one place: a searchable list, an Obsidian-style graph of projects, sessions, and memories, and an inspector for reading transcripts and editing memory files.

## Supported harnesses

| Harness | Sessions | Memories / context |
| --- | --- | --- |
| Claude Code (default) | `~/.claude/projects/*/*.jsonl` | `CLAUDE.md`, `CLAUDE.local.md`, `.claude/CLAUDE.md`, project `memory/*.md` |
| Codex CLI | `~/.codex/sessions/**/rollout-*.jsonl` | `AGENTS.md`, generated memories |
| Cursor | `state.vscdb` composer history | `.cursorrules`, `.cursor/rules`, `AGENTS.md` |
| opencode | `~/.local/share/opencode/storage` | `AGENTS.md` |
| Aider | `.aider.chat.history.md` | `CONVENTIONS.md` |

Only Claude Code is scanned by default. Add other harnesses from the **+** next to *Harnesses* in the sidebar or in Settings.

## Features

- Unified list and graph across harnesses and projects, with live updates as agents write to disk.
- Transcript viewer with grouped tool calls and copyable resume commands.
- Memory editor (preview / edit, ⌘S to save) with links between memories.
- Rename or hide projects; move sessions, memory files, or a whole project's data to the Trash.

Cairn never sends your data anywhere. Everything is read from and written to local files.

## Project layout

```
main/                 Node backend
  services/harnesses/   one reader per harness
  services/library.ts   snapshot builder, watching, trash
  services/platform.ts  OS-specific paths (the porting seam)
  handlers/             IPC handlers
renderer/             React UI
  components/           sidebar, list, graph, inspector panes
  lib/                  data hooks, scopes, formatting
```

## Platform

macOS. The backend is plain Node.js with OS-specific paths isolated in `main/services/platform.ts`, so the readers can be reused for a Windows or Linux build.
