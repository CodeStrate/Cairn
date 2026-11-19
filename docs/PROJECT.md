---
name: cairn-project
description: Cairn architecture, data contract, conventions, and gotchas — read before changing code.
type: project
updated: 2026-10-08
---

# Cairn — Project Memory

Cairn is a macOS app that gathers what coding agents leave on disk — session transcripts, memories, and project context files — from Claude Code, Codex CLI, Cursor, and opencode into one library with a list, an Obsidian-style graph, and an inspector/editor. The long-term goal is to carry any session or memory into any harness.

Read [HANDOFF.md](HANDOFF.md) for current status and the next phases.

## Stack

- **Shell:** Glaze (macOS-native host with an Electron-like API) for the MVP; Electron is the planned Windows/Linux shell and a Rust native build is a later v2 (see the roadmap in HANDOFF.md). Backend is Node.js (≥ 24) in `main/`, UI is React 19 + Vite + Tailwind 4 in `renderer/`, talking over JSON-RPC IPC.
- **UI kit:** `@glaze/core/components` (Sidebar, SplitView, List, ScrollArea, menus, dialogs, Field…). Resolved by Glaze's build — never `npm install` it.
- **Other deps:** TanStack Router (URL search-param state), TanStack Query (all IPC reads/mutations), `d3-force` (graph layout), `lucide-react` (icons), `@radix-ui/colors` (harness colors).

## Build & run

- `npm install --include=dev`, then `npm run build` / `npm run lint` / `npm run type-check` / `npm run format`. These go through `glaze-node.sh` + `glaze.ts`, which locate Glaze's SDK and Node runtime, so **Glaze must be installed** on the machine.
- Edit only source files here. `../runtime/` is generated build output.
- Logs: `~/Library/Logs/app.glaze.macos.2kx8bm18-local/`.
- Runtime data: `~/Library/Application Support/app.glaze.macos.2kx8bm18-local/preferences.json`.

## Layout

```
main/
  index.ts                 window + app menu only
  handlers/index.ts        registers IPC (settings window + library)
  handlers/library.ts      thin, validated IPC handlers
  shared/types.ts          data contract shared with the renderer
  services/
    platform.ts            ALL OS-specific paths/binaries (porting seam)
    util.ts                fs/JSONL/sqlite helpers, Claude dir decoding, tool descriptions
    memory-files.ts        project context files + link extraction
    harnesses/*.ts         one reader per harness (scan + read transcript)
    library.ts             snapshot builder, caches, fs.watch, rename/hide/trash
    preferences.ts         userData/preferences.json
  windows/                 settings window + window URL/preload helpers
renderer/
  main/                    entry, router, RootView, HomeView (owns SplitView)
  components/              app-sidebar, list-pane, graph-pane, graph/, detail/, library-dialogs
  lib/                     library-api (hooks), scope, search, format, harness, graph-data
  settings/                Settings window (Appearance, Harnesses, Hidden Projects)
  preload.ts               Glaze-managed bridge — don't edit unless exposing a new API
```

**Glaze-free code:** `services/harnesses/*`, `memory-files.ts`, `util.ts`, `platform.ts`, `shared/types.ts` import nothing from `@glaze/*`. Keep it that way — the planned MCP server and any Windows/Linux port reuse them as plain Node. Only `library.ts` and `preferences.ts` touch Glaze (`ipcMain`, `logger`, `shell`, `app`).

## Data contract (`main/shared/types.ts`)

- **IDs:** session `"<harness>:<nativeId>"`, memory `"mem:<absolute path>"` (or a virtual `codex-memory:<thread>` path for DB-backed memories), project = absolute cwd.
- `LibrarySnapshot { home, harnesses[], sessions[], memories[], projects[], hiddenProjects[], scannedAt, errors[] }`.
- `HarnessInfo.enabled` = added by the user; only enabled harnesses are scanned and watched.
- `MemorySummary.harnesses` can hold several ids (e.g. `AGENTS.md` → codex/opencode/cursor) and is filtered to enabled harnesses; a memory with none left is dropped.
- Renderer imports these with `import type` from `@main/shared/types` only — never runtime values from `@main`.

## IPC channels

| Channel | Params | Returns |
| --- | --- | --- |
| `library:get` | `{ force? }` | `LibrarySnapshot` (also starts watchers) |
| `session:get` | `{ id }` | `SessionDetail` (≤ 3000 entries) |
| `memory:get` / `memory:save` | `{ id }` / `{ id, content }` | `MemoryDetail` / `MemorySummary` |
| `harness:setEnabled` | `{ id, enabled }` | `LibrarySnapshot` (≥ 1 harness must stay) |
| `project:rename` | `{ path, name \| null }` | `LibrarySnapshot` (null = reset) |
| `project:setHidden` | `{ path, hidden }` | `LibrarySnapshot` |
| `project:trash` / `item:trash` | `{ path }` / `{ id }` | `TrashResult { library, trashed, failed[] }` |
| `item:reveal` / `item:copyText` | `{ path }` / `{ text }` | — (reveal only known library paths) |
| broadcast `library:changed` | `{ scannedAt }` | renderer invalidates queries |

Every mutation rebuilds the snapshot and broadcasts `library:changed`, so the main window and Settings stay in sync.

## Harness sources

| Harness | Sessions | Memories | Tested |
| --- | --- | --- | --- |
| Claude Code | `~/.claude/projects/<encoded cwd>/*.jsonl` | `<encoded>/memory/*.md`, `~/.claude/CLAUDE.md`, project CLAUDE files | ✅ |
| Codex | `~/.codex/sessions/**/rollout-*.jsonl` (+ `session_index.jsonl` titles) | `~/.codex/AGENTS.md`, `memories_N.sqlite` | sessions ✅, DB memories ❌ |
| Cursor | `<config>/Cursor/User/globalStorage/state.vscdb` (`composerData:*`, `bubbleId:*`) | `.cursorrules`, `.cursor/rules` | ❌ |
| opencode | `~/.local/share/opencode/storage/{session,message,part}` | `AGENTS.md` | ❌ |

Claude encodes a cwd into its projects folder name lossily (`/`, `.`, `_` all become `-`); `resolveEncodedClaudeDir()` walks the filesystem to recover the real path.

## Conventions

- **State:** view/scope/query/selection live in the Home route's search params (`view`, `scope`, `q`, `sel`) — not `useState`. Data comes from React Query hooks in `renderer/lib/library-api.ts`; mutations that return a snapshot write it straight into the cache.
- **Backend:** handlers stay thin and validate every param; logic lives in `services/`. Throw specific errors (they surface as toasts).
- **Files:** durable app data goes under `app.getPath("userData")`; write atomically (`writeFileAtomic`). Never write inside a user's agent folders except through explicit, confirmed user actions.
- **Destructive actions** go to the macOS Trash (`shell.trashItem`) behind an `AlertDialog`. Only single-file-per-session harnesses (Claude, Codex) can trash sessions; the rule is mirrored in `canTrash()` (backend `trashPathsFor`).
- **Portability:** anything OS-specific goes in `platform.ts`; use `isAbsolutePath()` / `isVirtualPath()` instead of `startsWith("/")`.
- **UI:** use `@glaze/core/components` and `Text` variants with semantic colors (`primary/secondary/tertiary`), `lucide-react` icons, `min-w-0` on flexible text. One accent button per surface.
- **Commits:** Conventional Commits (`feat(scope): …`, `fix`, `refactor`, `docs`, `chore`).
- **Git hygiene:** agent tooling (`.claude/`, `.agents/`, root `CLAUDE.md` / `AGENTS.md`, `.mcp.json`, `.glaze*`) and env/key files are ignored — keep them out.

## Gotchas

- `SidebarListGroup` only renders `actions` when `collapsible` is set (that's why Harnesses is collapsible).
- `ContextMenu` / `DropdownMenu` items are native macOS menus: item children must be plain text, icons are SF Symbol names (`"trash"`, `"folder"`, `"pencil"`).
- SQLite is read through the `sqlite3` CLI (`-readonly -json`), not a native module — keeps the bundle free of native builds.
- Very long sessions are capped at 3000 transcript entries and paged 80 → +160 in the inspector.
- Root `CLAUDE.md` / `AGENTS.md` in this folder are regenerated by Glaze for its own agent; put project docs in `docs/`.
