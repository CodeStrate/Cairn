import { Outlet } from "@tanstack/react-router";

import { useTheme } from "@renderer/ui";

import { TerminalProvider } from "../lib/terminal-context";

export function RootView() {
  useTheme();

  return (
    <div className="relative h-full">
      {/* The home view owns its SplitView shell (sidebar, timeline/graph/list, inspector). */}
      <TerminalProvider>
        <Outlet />
      </TerminalProvider>
    </div>
  );
}
