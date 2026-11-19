import { useEffect, useRef, useState } from "react";
import { currentTerminalTheme, onThemeChange, Text } from "@renderer/ui";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import { resizeTerminal, writeTerminal } from "../../lib/terminal-api";
import { attachTerminal } from "../../lib/terminal-bus";

/**
 * xterm.js kept, with ghostty-web as a drop in later option.
 */
interface TerminalViewProps {
  id: string;
  /** Shown and in front: refit and focus when this flips on. */
  visible: boolean;
}

export function TerminalView({ id, visible }: TerminalViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let term: Terminal;
    let fit: FitAddon;
    try {
      term = new Terminal({
        fontSize: 12.5,
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Monaco, monospace',
        cursorBlink: true,
        scrollback: 10_000,
        allowProposedApi: false,
        macOptionIsMeta: true,
        theme: currentTerminalTheme(),
      });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
    } catch (reason) {
      console.error("[terminal] failed to start", reason);
      setError(reason instanceof Error ? reason.message : String(reason));
      return;
    }

    const refit = () => {
      if (host.clientWidth > 0 && host.clientHeight > 0) fit.fit();
    };
    refit();

    const inputSub = term.onData((data) => void writeTerminal(id, data).catch(() => undefined));
    const resizeSub = term.onResize(
      ({ cols, rows }) => void resizeTerminal(id, cols, rows).catch(() => undefined),
    );
    const detach = attachTerminal(id, (data) => term.write(data));
    const observer = new ResizeObserver(() => refit());
    observer.observe(host);
    // Follow theme changes (Settings → Theme, or light/dark switching) without a restart.
    const offTheme = onThemeChange(() => {
      term.options.theme = currentTerminalTheme();
    });
    // The shell started at 80×24; tell it the real size right away.
    void resizeTerminal(id, term.cols, term.rows).catch(() => undefined);

    termRef.current = term;
    fitRef.current = fit;
    return () => {
      offTheme();
      observer.disconnect();
      inputSub.dispose();
      resizeSub.dispose();
      detach();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [id]);

  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      const host = hostRef.current;
      if (host && host.clientWidth > 0 && host.clientHeight > 0) fitRef.current?.fit();
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  return (
    <div className="absolute inset-0" style={{ visibility: visible ? "visible" : "hidden" }}>
      <div ref={hostRef} className="absolute inset-0 overflow-hidden px-2 py-1.5" />
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <Text variant="small" color="secondary">
            The terminal couldn't start: {error}
          </Text>
        </div>
      ) : null}
    </div>
  );
}
