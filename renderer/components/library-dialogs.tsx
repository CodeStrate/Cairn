import { useState } from "react";
import { AlertDialog, Dialog, Input, Text, toast } from "@glaze/core/components";

import type { LibraryItem, LibrarySnapshot, ProjectSummary } from "@main/shared/types";

import { baseName, plural, shortenPath } from "../lib/format";
import { canTrash } from "../lib/harness";
import { useRenameProject, useTrashItem, useTrashProject } from "../lib/library-api";
import { errorMessage } from "./detail/detail-parts";

export type LibraryAction =
  | { kind: "rename-project"; project: ProjectSummary }
  | { kind: "trash-project"; project: ProjectSummary }
  | { kind: "trash-item"; item: LibraryItem };

interface LibraryDialogsProps {
  action: LibraryAction | null;
  library: LibrarySnapshot;
  onClose: () => void;
  /** Called after a project's files were trashed. */
  onProjectTrashed: (projectPath: string) => void;
  onItemTrashed: (id: string) => void;
}

function quoted(text: string, max = 60): string {
  return `“${text.length > max ? `${text.slice(0, max - 1)}…` : text}”`;
}

function defaultProjectName(projectPath: string, home: string): string {
  return projectPath === home ? "Home" : baseName(projectPath);
}

function RenameProjectDialog({
  project,
  home,
  onClose,
}: {
  project: ProjectSummary;
  home: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(project.name);
  const rename = useRenameProject();
  const fallback = defaultProjectName(project.path, home);

  const handleConfirm = async () => {
    const trimmed = name.trim();
    try {
      await rename.mutateAsync({
        path: project.path,
        name: trimmed && trimmed !== fallback ? trimmed : null,
      });
    } catch (error) {
      toast.error(`Couldn't rename: ${errorMessage(error)}`);
      throw error;
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="small"
      title="Rename Project"
      description={shortenPath(project.path, home)}
      confirmLabel="Rename"
      onConfirm={handleConfirm}
    >
      <div className="flex flex-col gap-2">
        <Input
          aria-label="Project name"
          value={name}
          placeholder={fallback}
          autoFocus
          onFocus={(event) => event.target.select()}
          onChange={(event) => setName(event.target.value)}
        />
        <Text variant="small" color="tertiary">
          Only changes the name shown here. The folder on disk stays the same.
        </Text>
      </div>
    </Dialog>
  );
}

function TrashProjectDialog({
  project,
  library,
  onClose,
  onTrashed,
}: {
  project: ProjectSummary;
  library: LibrarySnapshot;
  onClose: () => void;
  onTrashed: (projectPath: string) => void;
}) {
  const trash = useTrashProject();
  const items = [...library.sessions, ...library.memories].filter(
    (item) => item.cwd === project.path,
  );
  const trashable = items.filter(canTrash);
  const sessions = trashable.filter((item) => item.kind === "session").length;
  const memories = trashable.length - sessions;
  const insideProject = trashable.some(
    (item) => item.kind === "memory" && item.path.startsWith(`${project.path}/`),
  );
  const skipped = items.length - trashable.length;

  const parts = [
    `${plural(sessions, "session")} and ${plural(memories, "memory file")} will be moved to the Trash`,
  ];
  if (insideProject)
    parts[0] += ", including context files inside the project folder such as CLAUDE.md";
  parts[0] += ".";
  if (skipped > 0) parts.push(`${plural(skipped, "item")} kept in shared databases will stay.`);
  parts.push("You can restore everything from the Trash.");

  const handleConfirm = async () => {
    try {
      const result = await trash.mutateAsync({ path: project.path });
      if (result.failed.length > 0) {
        toast.error(`${plural(result.failed.length, "file")} couldn't be moved to the Trash`);
      } else {
        toast.success(`Moved ${project.name} data to the Trash`);
      }
      onTrashed(project.path);
    } catch (error) {
      toast.error(`Couldn't move to the Trash: ${errorMessage(error)}`);
    }
  };

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Move ${quoted(project.name)} Data to the Trash?`}
      description={
        trashable.length > 0
          ? parts.join(" ")
          : "Nothing in this project can be moved to the Trash."
      }
      confirmLabel="Move to Trash"
      confirmVariant="destructive"
      confirmDisabled={trashable.length === 0}
      onConfirm={handleConfirm}
    />
  );
}

function TrashItemDialog({
  item,
  library,
  onClose,
  onTrashed,
}: {
  item: LibraryItem;
  library: LibrarySnapshot;
  onClose: () => void;
  onTrashed: (id: string) => void;
}) {
  const trash = useTrashItem();
  const description =
    item.kind === "session"
      ? "The session transcript will be moved to the Trash and can no longer be resumed until you restore it."
      : `${shortenPath(item.path, library.home)} will be moved to the Trash, so agents stop reading it. You can restore it from the Trash.`;

  const handleConfirm = async () => {
    try {
      await trash.mutateAsync({ id: item.id });
      toast.success(`Moved ${quoted(item.title, 40)} to the Trash`);
      onTrashed(item.id);
    } catch (error) {
      toast.error(`Couldn't move to the Trash: ${errorMessage(error)}`);
    }
  };

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Move ${quoted(item.title)} to the Trash?`}
      description={description}
      confirmLabel="Move to Trash"
      confirmVariant="destructive"
      onConfirm={handleConfirm}
    />
  );
}

export function LibraryDialogs({
  action,
  library,
  onClose,
  onProjectTrashed,
  onItemTrashed,
}: LibraryDialogsProps) {
  if (!action) return null;
  switch (action.kind) {
    case "rename-project":
      return (
        <RenameProjectDialog
          key={action.project.id}
          project={action.project}
          home={library.home}
          onClose={onClose}
        />
      );
    case "trash-project":
      return (
        <TrashProjectDialog
          key={action.project.id}
          project={action.project}
          library={library}
          onClose={onClose}
          onTrashed={onProjectTrashed}
        />
      );
    case "trash-item":
      return (
        <TrashItemDialog
          key={action.item.id}
          item={action.item}
          library={library}
          onClose={onClose}
          onTrashed={onItemTrashed}
        />
      );
  }
}
