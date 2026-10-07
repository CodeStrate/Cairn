import { Outlet } from "@tanstack/react-router";
import * as React from "react";
import { useTheme } from "@glaze/core/hooks";

export function RootView() {
  useTheme();

  // Cleanup IPC connection on unmount
  React.useEffect(() => {
    return () => {
      window.glazeAPI?.glaze?.ipc?.disconnect();
    };
  }, []);

  return (
    <div className="h-full relative [&:not(:has([data-toolbar]))_.drag-region]:z-50">
      {/* Draggable top bar - fallback for when no toolbar is present */}
      <div className="drag-region fixed top-0 left-0 right-0 h-13" />
      {/* The home view owns its SplitView shell (sidebar, graph/list, inspector). */}
      <Outlet />
    </div>
  );
}
