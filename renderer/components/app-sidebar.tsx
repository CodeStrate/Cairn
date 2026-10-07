import { Brain, Folder, Layers, MessagesSquare, Plus, RefreshCw } from "lucide-react";
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Sidebar,
  SidebarFooter,
  SidebarList,
  SidebarListGroup,
  SidebarListItem,
  Text,
} from "@glaze/core/components";

import type { HarnessId, HarnessInfo, LibrarySnapshot, ProjectSummary } from "@main/shared/types";

import { relativeTime } from "../lib/format";
import { HARNESS_ORDER, HARNESS_STYLES } from "../lib/harness";
import { projectScope } from "../lib/scope";
import { revealPath } from "./item-actions";
import type { LibraryAction } from "./library-dialogs";
import { HarnessDot } from "./item-visuals";

interface AppSidebarProps {
  library: LibrarySnapshot | undefined;
  scope: string;
  onScopeChange: (scope: string) => void;
  onRescan: () => void;
  rescanning: boolean;
  onSetHarnessEnabled: (id: HarnessId, enabled: boolean) => void;
  onHideProject: (project: ProjectSummary) => void;
  onAction: (action: LibraryAction) => void;
}

function sortedHarnesses(library: LibrarySnapshot | undefined): HarnessInfo[] {
  if (!library) return [];
  return HARNESS_ORDER.map((id) => library.harnesses.find((harness) => harness.id === id)).filter(
    (harness): harness is HarnessInfo => harness !== undefined,
  );
}

function AddHarnessMenu({
  harnesses,
  onAdd,
}: {
  harnesses: HarnessInfo[];
  onAdd: (id: HarnessId) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="transparent"
          size="small"
          iconOnly
          aria-label="Add Harness"
          title="Add Harness"
        >
          <Plus className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {harnesses.length === 0 ? (
          <DropdownMenuLabel>All harnesses are in the library</DropdownMenuLabel>
        ) : null}
        {harnesses.map((harness) => (
          <DropdownMenuItem
            key={harness.id}
            sublabel={harness.available ? "Found on this Mac" : "Not found on this Mac"}
            onSelect={() => onAdd(harness.id)}
          >
            {harness.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar({
  library,
  scope,
  onScopeChange,
  onRescan,
  rescanning,
  onSetHarnessEnabled,
  onHideProject,
  onAction,
}: AppSidebarProps) {
  const sessionCount = library?.sessions.length;
  const memoryCount = library?.memories.length;
  const total = library ? library.sessions.length + library.memories.length : undefined;
  const harnesses = sortedHarnesses(library);
  const added = harnesses.filter((harness) => harness.enabled);
  const notAdded = harnesses.filter((harness) => !harness.enabled);

  return (
    <Sidebar
      actions={
        <Button
          aria-label="Rescan agent folders"
          title="Rescan agent folders"
          onClick={onRescan}
          disabled={rescanning}
        >
          <RefreshCw className={rescanning ? "animate-spin" : undefined} />
        </Button>
      }
      footer={
        library ? (
          <SidebarFooter>
            <Text variant="small" color="tertiary" className="px-3 py-2">
              Updated {relativeTime(library.scannedAt).toLowerCase()}
            </Text>
          </SidebarFooter>
        ) : undefined
      }
    >
      <SidebarList>
        <SidebarListGroup title="Library">
          <SidebarListItem
            icon={<Layers />}
            title="Everything"
            accessory={total}
            selected={scope === "all"}
            onClick={() => onScopeChange("all")}
          />
          <SidebarListItem
            icon={<MessagesSquare />}
            title="Sessions"
            accessory={sessionCount}
            selected={scope === "sessions"}
            onClick={() => onScopeChange("sessions")}
          />
          <SidebarListItem
            icon={<Brain />}
            title="Memories"
            accessory={memoryCount}
            selected={scope === "memories"}
            onClick={() => onScopeChange("memories")}
          />
        </SidebarListGroup>

        <SidebarListGroup
          title="Harnesses"
          actions={
            library ? (
              <AddHarnessMenu harnesses={notAdded} onAdd={(id) => onSetHarnessEnabled(id, true)} />
            ) : null
          }
        >
          {added.map((harness) => {
            const count = harness.sessionCount + harness.memoryCount;
            return (
              <ContextMenu key={harness.id}>
                <ContextMenuTrigger asChild>
                  <SidebarListItem
                    icon={<HarnessDot harness={harness.id} />}
                    title={HARNESS_STYLES[harness.id].name}
                    subtitle={harness.available ? undefined : "Not found on this Mac"}
                    accessory={count ? count : undefined}
                    selected={scope === `harness:${harness.id}`}
                    onClick={() => onScopeChange(`harness:${harness.id}`)}
                  />
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    icon="minus.circle"
                    disabled={added.length <= 1}
                    onSelect={() => onSetHarnessEnabled(harness.id, false)}
                  >
                    Remove from Library
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </SidebarListGroup>

        {library && library.projects.length > 0 ? (
          <SidebarListGroup title="Projects" collapsible>
            {library.projects.map((project) => (
              <ContextMenu key={project.id}>
                <ContextMenuTrigger asChild>
                  <SidebarListItem
                    icon={<Folder />}
                    title={project.name}
                    accessory={project.sessionCount + project.memoryCount}
                    selected={scope === projectScope(project.path)}
                    onClick={() => onScopeChange(projectScope(project.path))}
                  />
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    icon="pencil"
                    onSelect={() => onAction({ kind: "rename-project", project })}
                  >
                    Rename…
                  </ContextMenuItem>
                  <ContextMenuItem icon="folder" onSelect={() => revealPath(project.path)}>
                    Reveal in Finder
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem icon="eye.slash" onSelect={() => onHideProject(project)}>
                    Remove from Library
                  </ContextMenuItem>
                  <ContextMenuItem
                    icon="trash"
                    onSelect={() => onAction({ kind: "trash-project", project })}
                  >
                    Move Project Data to Trash…
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </SidebarListGroup>
        ) : null}
      </SidebarList>
    </Sidebar>
  );
}
