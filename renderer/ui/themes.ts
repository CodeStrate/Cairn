/**
 * Colour themes. A theme overrides the `--wf-*` tokens from theme.css (so every component
 * follows) and supplies the terminal palette. "Wefty" is the default: it keeps the
 * translucent macOS look and follows Light/Dark; the others are opaque and fixed.
 */
import type { ITheme } from "@xterm/xterm";

import type { ThemeMode } from "@main/shared/types";

export interface ThemePreset {
  id: string;
  name: string;
  mode: ThemeMode;
  /** CSS custom properties set on <html>. `--wf-fg`/`--wf-bg` are "r g b" triplets. */
  vars: Record<string, string>;
  /** Light and dark terminal palettes for adaptive themes; one palette otherwise. */
  terminal: ITheme | { light: ITheme; dark: ITheme };
}

const WEFTY_TERMINAL_DARK: ITheme = {
  background: "#0e0e10",
  foreground: "#e4e4e7",
  cursor: "#e4e4e7",
  cursorAccent: "#0e0e10",
  selectionBackground: "#3a4a6b",
};

const WEFTY_TERMINAL_LIGHT: ITheme = {
  background: "#f7f7f8",
  foreground: "#1f1f22",
  cursor: "#1f1f22",
  cursorAccent: "#f7f7f8",
  selectionBackground: "#b9d0ff",
};

/** Opaque surfaces derived from four colours, so every preset stays consistent. */
function surfaces(page: string, window: string, panel: string, popover: string) {
  return {
    "--wf-page": page,
    "--wf-window": window,
    "--wf-sidebar": "transparent",
    "--wf-sidebar-panel": panel,
    "--wf-popover": popover,
    "--wf-terminal-bg": page,
  };
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "wefty",
    name: "Wefty",
    mode: "adaptive",
    vars: {},
    terminal: { light: WEFTY_TERMINAL_LIGHT, dark: WEFTY_TERMINAL_DARK },
  },
  {
    id: "graphite",
    name: "Graphite",
    mode: "dark",
    vars: {
      "--wf-fg": "236 236 240",
      "--wf-bg": "18 18 20",
      "--wf-accent": "#8b95ff",
      ...surfaces("#121214", "#161618", "#1d1d21", "#1f1f23"),
    },
    terminal: {
      background: "#121214",
      foreground: "#e4e4e8",
      cursor: "#8b95ff",
      cursorAccent: "#121214",
      selectionBackground: "#33365a",
      black: "#1f1f23",
      red: "#f2777a",
      green: "#99cc99",
      yellow: "#ffcc66",
      blue: "#8b95ff",
      magenta: "#cc99cc",
      cyan: "#66cccc",
      white: "#d4d4d8",
      brightBlack: "#5c5c66",
      brightRed: "#ff8e90",
      brightGreen: "#b5e0b5",
      brightYellow: "#ffd98a",
      brightBlue: "#a8b0ff",
      brightMagenta: "#dcb3dc",
      brightCyan: "#8ee0e0",
      brightWhite: "#f4f4f5",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    mode: "dark",
    vars: {
      "--wf-fg": "214 222 235",
      "--wf-bg": "10 14 20",
      "--wf-accent": "#5ccfe6",
      ...surfaces("#0a0e14", "#0d1219", "#131a24", "#141b26"),
    },
    terminal: {
      background: "#0a0e14",
      foreground: "#b3b1ad",
      cursor: "#e6b450",
      cursorAccent: "#0a0e14",
      selectionBackground: "#273747",
      black: "#01060e",
      red: "#ea6c73",
      green: "#91b362",
      yellow: "#f9af4f",
      blue: "#53bdfa",
      magenta: "#fae994",
      cyan: "#90e1c6",
      white: "#c7c7c7",
      brightBlack: "#686868",
      brightRed: "#f07178",
      brightGreen: "#c2d94c",
      brightYellow: "#ffb454",
      brightBlue: "#59c2ff",
      brightMagenta: "#ffee99",
      brightCyan: "#95e6cb",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "nord",
    name: "Nord",
    mode: "dark",
    vars: {
      "--wf-fg": "229 233 240",
      "--wf-bg": "46 52 64",
      "--wf-accent": "#88c0d0",
      ...surfaces("#2b303b", "#2e3440", "#353c4a", "#3b4252"),
    },
    terminal: {
      background: "#2b303b",
      foreground: "#d8dee9",
      cursor: "#d8dee9",
      cursorAccent: "#2b303b",
      selectionBackground: "#434c5e",
      black: "#3b4252",
      red: "#bf616a",
      green: "#a3be8c",
      yellow: "#ebcb8b",
      blue: "#81a1c1",
      magenta: "#b48ead",
      cyan: "#88c0d0",
      white: "#e5e9f0",
      brightBlack: "#4c566a",
      brightRed: "#bf616a",
      brightGreen: "#a3be8c",
      brightYellow: "#ebcb8b",
      brightBlue: "#81a1c1",
      brightMagenta: "#b48ead",
      brightCyan: "#8fbcbb",
      brightWhite: "#eceff4",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    mode: "dark",
    vars: {
      "--wf-fg": "248 248 242",
      "--wf-bg": "40 42 54",
      "--wf-accent": "#bd93f9",
      ...surfaces("#21222c", "#282a36", "#2f3141", "#343746"),
    },
    terminal: {
      background: "#21222c",
      foreground: "#f8f8f2",
      cursor: "#f8f8f2",
      cursorAccent: "#21222c",
      selectionBackground: "#44475a",
      black: "#21222c",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#bd93f9",
      magenta: "#ff79c6",
      cyan: "#8be9fd",
      white: "#f8f8f2",
      brightBlack: "#6272a4",
      brightRed: "#ff6e6e",
      brightGreen: "#69ff94",
      brightYellow: "#ffffa5",
      brightBlue: "#d6acff",
      brightMagenta: "#ff92df",
      brightCyan: "#a4ffff",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    mode: "dark",
    vars: {
      "--wf-fg": "147 161 161",
      "--wf-bg": "0 43 54",
      "--wf-accent": "#268bd2",
      ...surfaces("#00232c", "#002b36", "#073642", "#073642"),
    },
    terminal: {
      background: "#00232c",
      foreground: "#93a1a1",
      cursor: "#93a1a1",
      cursorAccent: "#00232c",
      selectionBackground: "#0a4a5a",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#586e75",
      brightRed: "#cb4b16",
      brightGreen: "#93a1a1",
      brightYellow: "#839496",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3",
    },
  },
  {
    id: "paper",
    name: "Paper",
    mode: "light",
    vars: {
      "--wf-fg": "41 37 36",
      "--wf-bg": "250 248 243",
      "--wf-accent": "#c2410c",
      ...surfaces("#f4f1ea", "#faf8f3", "#ece8de", "#fdfcf9"),
    },
    terminal: {
      background: "#f4f1ea",
      foreground: "#292524",
      cursor: "#c2410c",
      cursorAccent: "#f4f1ea",
      selectionBackground: "#e7d8c3",
      black: "#292524",
      red: "#b91c1c",
      green: "#4d7c0f",
      yellow: "#a16207",
      blue: "#1d4ed8",
      magenta: "#a21caf",
      cyan: "#0e7490",
      white: "#d6d3d1",
      brightBlack: "#78716c",
      brightRed: "#dc2626",
      brightGreen: "#65a30d",
      brightYellow: "#ca8a04",
      brightBlue: "#2563eb",
      brightMagenta: "#c026d3",
      brightCyan: "#0891b2",
      brightWhite: "#f5f5f4",
    },
  },
  {
    id: "github-light",
    name: "GitHub Light",
    mode: "light",
    vars: {
      "--wf-fg": "31 35 40",
      "--wf-bg": "255 255 255",
      "--wf-accent": "#0969da",
      ...surfaces("#f6f8fa", "#ffffff", "#eef1f4", "#ffffff"),
    },
    terminal: {
      background: "#f6f8fa",
      foreground: "#1f2328",
      cursor: "#0969da",
      cursorAccent: "#f6f8fa",
      selectionBackground: "#c8e1ff",
      black: "#24292f",
      red: "#cf222e",
      green: "#116329",
      yellow: "#4d2d00",
      blue: "#0969da",
      magenta: "#8250df",
      cyan: "#1b7c83",
      white: "#6e7781",
      brightBlack: "#57606a",
      brightRed: "#a40e26",
      brightGreen: "#1a7f37",
      brightYellow: "#633c01",
      brightBlue: "#218bff",
      brightMagenta: "#a475f9",
      brightCyan: "#3192aa",
      brightWhite: "#8c959f",
    },
  },
];

/** Category colours from a terminal palette, so harness dots and badges match the theme. */
function paletteTints(palette: ITheme): Record<string, string> {
  const pick = (value: string | undefined, fallback: string) => value ?? fallback;
  const red = pick(palette.red, "#e05252");
  const yellow = pick(palette.yellow, "#d9a520");
  return {
    "--wf-tint-orange": `color-mix(in oklab, ${red} 50%, ${yellow})`,
    "--wf-tint-blue": pick(palette.blue, "#3b8eea"),
    "--wf-tint-purple": pick(palette.magenta, "#9a6fd6"),
    "--wf-tint-green": pick(palette.green, "#3aa676"),
    "--wf-tint-yellow": yellow,
    "--wf-tint-red": red,
    "--wf-tint-magenta": pick(palette.brightMagenta ?? palette.magenta, "#d05bb4"),
  };
}

export function findTheme(id: string | undefined): ThemePreset {
  return THEME_PRESETS.find((preset) => preset.id === id) ?? THEME_PRESETS[0];
}

export function terminalPalette(preset: ThemePreset, dark: boolean): ITheme {
  const palette = preset.terminal;
  return "light" in palette && "dark" in palette ? (dark ? palette.dark : palette.light) : palette;
}

// --- Runtime: the active theme, applied to <html>, observable by the terminal --------

let activeTheme: ThemePreset = THEME_PRESETS[0];
let appliedVars: string[] = [];
let systemAccent: string | null = null;
const listeners = new Set<() => void>();

function isDark(): boolean {
  if (activeTheme.mode !== "adaptive") return activeTheme.mode === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Writes the active theme onto <html> and notifies subscribers (terminals). */
export function applyTheme(themeId?: string, accent?: string | null): void {
  if (themeId !== undefined) activeTheme = findTheme(themeId);
  if (accent !== undefined) systemAccent = accent;
  const root = document.documentElement;
  root.classList.toggle("dark", isDark());
  root.classList.toggle("themed", activeTheme.id !== "wefty");
  for (const name of appliedVars) root.style.removeProperty(name);
  appliedVars = Object.keys(activeTheme.vars);
  for (const [name, value] of Object.entries(activeTheme.vars)) root.style.setProperty(name, value);
  // Presets tint harness colours and badges from their own terminal palette.
  if (activeTheme.id !== "wefty") {
    for (const [name, value] of Object.entries(
      paletteTints(terminalPalette(activeTheme, isDark())),
    )) {
      root.style.setProperty(name, value);
      appliedVars.push(name);
    }
  }
  // The default theme uses the OS accent; presets bring their own.
  if (!activeTheme.vars["--wf-accent"] && systemAccent) {
    root.style.setProperty("--wf-accent", systemAccent);
    appliedVars.push("--wf-accent");
  }
  for (const listener of listeners) listener();
}

export function currentTerminalTheme(): ITheme {
  return terminalPalette(activeTheme, isDark());
}

/** Called whenever the theme (or light/dark) changes. Returns an unsubscribe function. */
export function onThemeChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
