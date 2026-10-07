import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  HarnessId,
  LibrarySnapshot,
  MemoryDetail,
  MemorySummary,
  SessionDetail,
  TrashResult,
} from "@main/shared/types";

const LIBRARY_KEY = ["library"] as const;

function ipc() {
  return window.glazeAPI.glaze.ipc;
}

export function useLibrary() {
  return useQuery({
    queryKey: LIBRARY_KEY,
    queryFn: () => ipc().invoke<LibrarySnapshot>("library:get", {}),
    staleTime: 30_000,
  });
}

export function useRescanLibrary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => ipc().invoke<LibrarySnapshot>("library:get", { force: true }),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(LIBRARY_KEY, snapshot);
      void queryClient.invalidateQueries({ queryKey: ["session"] });
      void queryClient.invalidateQueries({ queryKey: ["memory"] });
    },
  });
}

/** The backend watches agent folders and broadcasts when anything changes. */
export function useLibraryUpdates(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    return ipc().onNotification("library:changed", () => {
      void queryClient.invalidateQueries({ queryKey: LIBRARY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["session"] });
    });
  }, [queryClient]);
}

export function useSessionDetail(id: string) {
  return useQuery({
    queryKey: ["session", id],
    queryFn: () => ipc().invoke<SessionDetail>("session:get", { id }),
  });
}

export function useMemoryDetail(id: string) {
  return useQuery({
    queryKey: ["memory", id],
    queryFn: () => ipc().invoke<MemoryDetail>("memory:get", { id }),
  });
}

export function useSaveMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; content: string }) => ipc().invoke<MemorySummary>("memory:save", input),
    onSuccess: async (_memory, input) => {
      await queryClient.invalidateQueries({ queryKey: ["memory", input.id] });
      void queryClient.invalidateQueries({ queryKey: LIBRARY_KEY });
    },
  });
}

/** Mutations that return a fresh snapshot replace the cached library immediately. */
function useLibraryMutation<Input, Result>(
  invoke: (input: Input) => Promise<Result>,
  pickLibrary: (result: Result) => LibrarySnapshot,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: invoke,
    onSuccess: (result) => {
      queryClient.setQueryData(LIBRARY_KEY, pickLibrary(result));
    },
  });
}

export function useSetHarnessEnabled() {
  return useLibraryMutation(
    (input: { id: HarnessId; enabled: boolean }) => ipc().invoke<LibrarySnapshot>("harness:setEnabled", input),
    (library) => library,
  );
}

export function useRenameProject() {
  return useLibraryMutation(
    (input: { path: string; name: string | null }) => ipc().invoke<LibrarySnapshot>("project:rename", input),
    (library) => library,
  );
}

export function useSetProjectHidden() {
  return useLibraryMutation(
    (input: { path: string; hidden: boolean }) => ipc().invoke<LibrarySnapshot>("project:setHidden", input),
    (library) => library,
  );
}

export function useTrashProject() {
  return useLibraryMutation(
    (input: { path: string }) => ipc().invoke<TrashResult>("project:trash", input),
    (result) => result.library,
  );
}

export function useTrashItem() {
  return useLibraryMutation(
    (input: { id: string }) => ipc().invoke<TrashResult>("item:trash", input),
    (result) => result.library,
  );
}

export function revealInFinder(path: string): Promise<void> {
  return ipc().invoke<void>("item:reveal", { path });
}

export function copyText(text: string): Promise<void> {
  return ipc().invoke<void>("item:copyText", { text });
}
