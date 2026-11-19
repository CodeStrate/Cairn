/**
 * Keyboard shortcut labels in app set via OS: Windows, MacOS or Linux
 */

const isMac = window.wefty.platform === "darwin";

export const MOD_KEY = isMac ? "⌘" : "Ctrl";

function comboKeys(...keys: string[]): string {
  return keys.join(isMac ? " " : "+");
}

export const SHORTCUTS = {
  settings: comboKeys(MOD_KEY, ","),
  help: comboKeys(MOD_KEY, "?"),
  search: comboKeys(MOD_KEY, "F"),
  sidebar: isMac ? comboKeys("⌃", "⌘", "S") : comboKeys("Ctrl", "Alt", "S"),
} as const;
