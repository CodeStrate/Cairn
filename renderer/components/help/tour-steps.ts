/**
 * The guided tour. Each step points at an element marked `data-tour="<target>"`; a step
 * whose target isn't on screen (or has no target) shows as a centred card instead, so the
 * tour never gets stuck when a panel is closed.
 */
export interface TourStep {
  target?: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to Wefty",
    body: "Wefty gathers what your coding agents leave on disk — session transcripts, memories, and project context files — into one library. Everything stays local. This tour takes about a minute.",
  },
  {
    target: "sidebar",
    title: "Your library",
    body: "Filter by everything, sessions, or memories, by harness (Claude Code is on by default; add others with +), or by project. Right-click a project to rename it, open it in the terminal, or remove it.",
  },
  {
    target: "views",
    title: "Three ways to look",
    body: "Timeline shows each project as a lane over time, Graph shows how sessions and memories link, and List is a plain, searchable list.",
  },
  {
    target: "main",
    title: "Reading the timeline",
    body: "Bars are sessions from first to last message; diamonds are memory files at their last edit. Hover to light up related items, click to open one. Drag empty space or scroll sideways to pan, ⌘-scroll to zoom.",
  },
  {
    target: "search",
    title: "Search",
    body: "Search matches titles, prompts, paths, and projects. In the timeline and graph, non-matches fade instead of disappearing.",
  },
  {
    target: "terminal",
    title: "Built-in terminal",
    body: "Opens a shell beside your library. Sessions can resume here in their own folder: Claude Code, Codex, and opencode resume natively.",
  },
  {
    target: "main",
    title: "Drag and drop",
    body: "Drag a list row, timeline bar, or graph node (past the canvas edge) onto the terminal to type its path or resume command — nothing runs until you press Enter. Drop a session or memory file from Finder onto Wefty to open it.",
  },
  {
    target: "main",
    title: "Hand a session off",
    body: "Open a session to read its transcript (searchable, tools can be hidden). Its ⋯ menu builds a Markdown handoff you can copy, drop into the terminal, or use to continue the work in Claude Code or Codex — even if it started in another harness.",
  },
  {
    target: "help",
    title: "Help is here",
    body: "Open Help any time for the full guide, or replay this tour from it or from the Help menu.",
  },
];
