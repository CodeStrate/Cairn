import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "@glaze/core/components";

import { baseName } from "./format";
import { createTerminal, killTerminal, onTerminalExit, writeTerminal } from "./terminal-api";
import { forgetTerminal, startRecording } from "./terminal-bus";

export interface TerminalTab {
  id: string;
  title: string;
  cwd: string;
  exited: boolean;
}

export interface OpenTerminalOptions {
  cwd?: string | null;
  /** Typed into the shell once it starts. */
  command?: string | null;
  title?: string;
}

interface TerminalContextValue {
  tabs: TerminalTab[];
  activeId: string | null;
  open: boolean;
  /** Resolves to the new tab's id, or null if the shell couldn't start. */
  openTerminal: (options?: OpenTerminalOptions) => Promise<string | null>;
  /**
   * Types text at the active shell's prompt without pressing Enter. With no live tab,
   * opens one first (in `cwd`, when given).
   */
  insertText: (text: string, cwd?: string | null) => Promise<void>;
  closeTab: (id: string) => void;
  setActive: (id: string) => void;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

function failure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function TerminalProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    startRecording();
    return onTerminalExit((id) => {
      setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, exited: true } : tab)));
    });
  }, []);

  const openTerminal = useCallback(async (options: OpenTerminalOptions = {}) => {
    try {
      const created = await createTerminal({
        cwd: options.cwd ?? null,
        command: options.command ?? null,
      });
      const title = options.title ?? (baseName(created.cwd) || "Terminal");
      setTabs((current) => [
        ...current,
        { id: created.id, title, cwd: created.cwd, exited: false },
      ]);
      setActiveId(created.id);
      setOpen(true);
      return created.id;
    } catch (error) {
      toast.error(`Couldn't open a terminal: ${failure(error)}`);
      return null;
    }
  }, []);

  const insertText = useCallback(
    async (text: string, cwd?: string | null) => {
      const live = tabs.find((tab) => tab.id === activeId && !tab.exited);
      const id = live?.id ?? (await openTerminal({ cwd: cwd ?? null }));
      if (!id) return;
      setOpen(true);
      try {
        await writeTerminal(id, `${text} `);
      } catch (error) {
        toast.error(`Couldn't send to the terminal: ${failure(error)}`);
      }
    },
    [tabs, activeId, openTerminal],
  );

  const closeTab = useCallback((id: string) => {
    void killTerminal(id).catch(() => undefined);
    forgetTerminal(id);
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === id);
      const next = current.filter((tab) => tab.id !== id);
      setActiveId((active) =>
        active === id ? (next[Math.min(index, next.length - 1)]?.id ?? null) : active,
      );
      if (next.length === 0) setOpen(false);
      return next;
    });
  }, []);

  const toggle = useCallback(() => {
    if (open) setOpen(false);
    else if (tabs.length === 0) void openTerminal();
    else setOpen(true);
  }, [open, tabs.length, openTerminal]);

  const value = useMemo<TerminalContextValue>(
    () => ({
      tabs,
      activeId,
      open,
      openTerminal,
      insertText,
      closeTab,
      setActive: setActiveId,
      setOpen,
      toggle,
    }),
    [tabs, activeId, open, openTerminal, insertText, closeTab, toggle],
  );

  return <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>;
}

export function useTerminals(): TerminalContextValue {
  const value = useContext(TerminalContext);
  if (!value) throw new Error("useTerminals must be used inside <TerminalProvider>");
  return value;
}
