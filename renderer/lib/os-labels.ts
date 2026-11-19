/**
 * Words and shortcuts that differ by OS (macOS, Windows, Linux), so the UI never says
 * "Mac" or "Finder" on a PC. window.wefty is set by the preload before any page script runs.
 */

const os: string = window.wefty.platform;
const isMac = os === "darwin";
export const MOD_KEY = isMac ? "⌘" : "Ctrl";

function comboKeys(...keys: string[]): string {
  return keys.join(isMac ? " " : "+");
}

export const SHORTCUTS = {
  settings: comboKeys(MOD_KEY, ","),
  save: comboKeys(MOD_KEY, "S"),
  help: comboKeys(MOD_KEY, "?"),
  search: comboKeys(MOD_KEY, "F"),
  sidebar: isMac ? comboKeys("⌃", "⌘", "S") : comboKeys("Ctrl", "Alt", "S"),
} as const;

/** OS-specific nouns. Keys are typed, so a typo is a compile error instead of blank text. */
export type OSLabel = "reveal" | "trash" | "fileManager" | "device";

const LABEL_MAP: Record<"darwin" | "win32" | "linux", Record<OSLabel, string>> = {
  win32: {
    reveal: "Show in File Explorer",
    trash: "Recycle Bin",
    fileManager: "File Explorer",
    device: "device",
  },
  darwin: {
    reveal: "Reveal in Finder",
    trash: "Trash",
    fileManager: "Finder",
    device: "Mac",
  },
  linux: {
    reveal: "Show in File Manager",
    trash: "Trash",
    fileManager: "File Manager",
    device: "device",
  },
};

// Any other platform (FreeBSD, …) uses the Linux words rather than crashing on a missing key.
const labels = LABEL_MAP[os in LABEL_MAP ? (os as keyof typeof LABEL_MAP) : "linux"];

export const getOSLabel = (label: OSLabel): string => labels[label];
