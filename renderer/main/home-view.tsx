import { useState, type ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { SplitView, toast } from "@glaze/core/components";

import type { HarnessId, LibraryItem, ProjectSummary } from "@main/shared/types";

import { MemoryDetailPane } from "../components/detail/memory-detail";
import { SessionDetailPane } from "../components/detail/session-detail";
import { errorMessage } from "../components/detail/detail-parts";
import { AppSidebar } from "../components/app-sidebar";
import { GraphPane } from "../components/graph-pane";
import { LibraryDialogs, type LibraryAction } from "../components/library-dialogs";
import { ListPane } from "../components/list-pane";
import { PrimaryToolbar } from "../components/primary-toolbar";
import { plural } from "../lib/format";
import { HARNESS_STYLES } from "../lib/harness";
import {
  useLibrary,
  useLibraryUpdates,
  useRescanLibrary,
  useSetHarnessEnabled,
  useSetProjectHidden,
} from "../lib/library-api";
import {
  findItem,
  matchesQuery,
  parseScope,
  projectScope,
  scopeTitle,
  scopedItems,
} from "../lib/scope";
import type { HomeSearch } from "../lib/search";

export function HomeView() {
  const search = useSearch({ from: "/" });
  const navigate = useNavigate({ from: "/" });
  const library = useLibrary();
  const rescan = useRescanLibrary();
  const setHarnessEnabled = useSetHarnessEnabled();
  const setProjectHidden = useSetProjectHidden();
  const [action, setAction] = useState<LibraryAction | null>(null);
  useLibraryUpdates();

  const update = (patch: Partial<HomeSearch>) => {
    void navigate({ search: (previous) => ({ ...previous, ...patch }) });
  };

  const data = library.data;
  const scope = parseScope(search.scope);
  const items = data ? scopedItems(data, scope) : [];
  const filtered = search.q ? items.filter((item) => matchesQuery(item, search.q)) : items;
  const selected = data && search.sel ? findItem(data, search.sel) : null;

  const sessionCount = filtered.filter((item) => item.kind === "session").length;
  const memoryCount = filtered.length - sessionCount;
  const subtitle = data
    ? `${plural(sessionCount, "session")} · ${memoryCount} ${memoryCount === 1 ? "memory" : "memories"}${
        search.q ? " matching" : ""
      }`
    : "Scanning agent folders…";

  const toolbar = (
    <PrimaryToolbar
      title={scopeTitle(scope, data)}
      subtitle={subtitle}
      query={search.q}
      onQueryChange={(q) => update({ q })}
      view={search.view}
      onViewChange={(view) => update({ view })}
    />
  );

  const handleRescan = () => {
    rescan.mutate(undefined, {
      onError: (error) => toast.error(`Rescan failed: ${errorMessage(error)}`),
    });
  };

  const handleHarnessEnabled = (id: HarnessId, enabled: boolean) => {
    setHarnessEnabled.mutate(
      { id, enabled },
      {
        onSuccess: () => {
          if (enabled) update({ scope: `harness:${id}`, sel: undefined });
          else if (search.scope === `harness:${id}`) update({ scope: "all" });
        },
        onError: (error) =>
          toast.error(`Couldn't update ${HARNESS_STYLES[id].name}: ${errorMessage(error)}`),
      },
    );
  };

  const leaveProject = (projectPath: string) => {
    if (search.scope === projectScope(projectPath)) update({ scope: "all", sel: undefined });
  };

  const handleHideProject = (project: ProjectSummary) => {
    setProjectHidden.mutate(
      { path: project.path, hidden: true },
      {
        onSuccess: () => {
          leaveProject(project.path);
          toast.success(`Removed ${project.name} from the library`, {
            description: "Bring it back anytime from Settings.",
          });
        },
        onError: (error) => toast.error(`Couldn't remove ${project.name}: ${errorMessage(error)}`),
      },
    );
  };

  const closeDetail = () => update({ sel: undefined });
  const selectItem = (id: string | null) => update({ sel: id ?? undefined });
  const requestTrash = (item: LibraryItem) => setAction({ kind: "trash-item", item });

  let inspector: ReactNode;
  if (data && selected?.kind === "session") {
    inspector = (
      <SessionDetailPane
        key={selected.id}
        session={selected}
        library={data}
        onSelect={selectItem}
        onClose={closeDetail}
        onRequestTrash={requestTrash}
      />
    );
  } else if (data && selected?.kind === "memory") {
    inspector = (
      <MemoryDetailPane
        key={selected.id}
        memory={selected}
        library={data}
        onSelect={selectItem}
        onClose={closeDetail}
        onRequestTrash={requestTrash}
      />
    );
  }

  return (
    <>
      <SplitView
        storageKey="cairn"
        className="h-full"
        sidebar={
          <AppSidebar
            library={data}
            scope={search.scope}
            onScopeChange={(next) => update({ scope: next })}
            onRescan={handleRescan}
            rescanning={rescan.isPending}
            onSetHarnessEnabled={handleHarnessEnabled}
            onHideProject={handleHideProject}
            onAction={setAction}
          />
        }
        sidebarSize={{ default: 230, min: 190, max: 320 }}
        primarySize={{ min: 380 }}
        inspector={inspector}
        inspectorSize={{ default: 460, min: 340 }}
      >
        {search.view === "graph" ? (
          <GraphPane
            toolbar={toolbar}
            library={data}
            items={items}
            query={search.q}
            selectedId={selected?.id ?? null}
            onSelect={selectItem}
            onOpenProject={(projectPath) => update({ scope: projectScope(projectPath) })}
          />
        ) : (
          <ListPane
            toolbar={toolbar}
            library={data}
            items={filtered}
            loading={library.isPending}
            query={search.q}
            selectedId={selected?.id ?? null}
            onSelect={selectItem}
            onRequestTrash={requestTrash}
          />
        )}
      </SplitView>
      {data ? (
        <LibraryDialogs
          action={action}
          library={data}
          onClose={() => setAction(null)}
          onProjectTrashed={leaveProject}
          onItemTrashed={(id) => {
            if (search.sel === id) closeDetail();
          }}
        />
      ) : null}
    </>
  );
}
