import { useState, useEffect } from "react";
import {
  Button,
  Label,
  RadioGroup,
  RadioGroupItem,
  ScrollArea,
  Switch,
  Toolbar,
  ToolbarContent,
  ToolbarTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  toast,
} from "@glaze/core/components";
import type { NativeThemeInfo } from "@glaze/core/ipc";

import type { HarnessInfo } from "@main/shared/types";

import { errorMessage } from "../components/detail/detail-parts";
import { plural, shortenPath } from "../lib/format";
import { HARNESS_ORDER } from "../lib/harness";
import {
  useLibrary,
  useLibraryUpdates,
  useSetHarnessEnabled,
  useSetProjectHidden,
} from "../lib/library-api";

function harnessDescription(harness: HarnessInfo): string {
  if (!harness.enabled) return harness.available ? "Found on this Mac" : "Not found on this Mac";
  return `${plural(harness.sessionCount, "session")} · ${harness.memoryCount} ${
    harness.memoryCount === 1 ? "memory" : "memories"
  }`;
}

function LibrarySettings() {
  const library = useLibrary();
  const setHarnessEnabled = useSetHarnessEnabled();
  const setProjectHidden = useSetProjectHidden();
  useLibraryUpdates();

  const harnesses = HARNESS_ORDER.map((id) =>
    library.data?.harnesses.find((harness) => harness.id === id),
  ).filter((harness): harness is HarnessInfo => harness !== undefined);
  const enabledCount = harnesses.filter((harness) => harness.enabled).length;
  const hiddenProjects = library.data?.hiddenProjects ?? [];

  return (
    <>
      <FieldSet>
        <FieldLegend>Harnesses</FieldLegend>
        <FieldDescription>
          Only added harnesses are scanned and shown in the library.
        </FieldDescription>
        <FieldGroup>
          {harnesses.map((harness) => (
            <Field key={harness.id} orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor={`harness-${harness.id}`}>{harness.name}</FieldLabel>
                <FieldDescription>{harnessDescription(harness)}</FieldDescription>
              </FieldContent>
              <Switch
                id={`harness-${harness.id}`}
                checked={harness.enabled}
                disabled={(harness.enabled && enabledCount <= 1) || setHarnessEnabled.isPending}
                onCheckedChange={(enabled) =>
                  setHarnessEnabled.mutate(
                    { id: harness.id, enabled },
                    {
                      onError: (error) =>
                        toast.error(`Couldn't update ${harness.name}: ${errorMessage(error)}`),
                    },
                  )
                }
              />
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>

      {hiddenProjects.length > 0 ? (
        <FieldSet>
          <FieldLegend>Hidden Projects</FieldLegend>
          <FieldDescription>
            Projects you removed from the library. Their files were not changed.
          </FieldDescription>
          <FieldGroup>
            {hiddenProjects.map((project) => (
              <Field key={project.path} orientation="horizontal">
                <FieldContent>
                  <FieldLabel>{project.name}</FieldLabel>
                  <FieldDescription>
                    {shortenPath(project.path, library.data?.home ?? "")}
                  </FieldDescription>
                </FieldContent>
                <Button
                  size="small"
                  onClick={() =>
                    setProjectHidden.mutate(
                      { path: project.path, hidden: false },
                      {
                        onError: (error) =>
                          toast.error(`Couldn't restore ${project.name}: ${errorMessage(error)}`),
                      },
                    )
                  }
                >
                  Show in Library
                </Button>
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>
      ) : null}
    </>
  );
}

export function SettingsView() {
  const [themeInfo, setThemeInfo] = useState<NativeThemeInfo | null>(null);
  const [_isLoading, setIsLoading] = useState(true);

  // Close settings window on Escape, unless an interactive element is focused or a popover is open
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;

      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }

      if (document.querySelector("[data-radix-popper-content-wrapper]")) {
        return;
      }

      event.preventDefault();
      window.glazeAPI.glaze.ipc.invoke("window:closeSettings");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const refreshThemeInfo = async () => {
    try {
      const info = await window.glazeAPI.nativeTheme.getInfo();
      setThemeInfo(info);
    } catch (error) {
      toast.error(`Failed to get theme info: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshThemeInfo();
  }, []);

  const handleThemeChange = async (value: string) => {
    const source = value as "system" | "light" | "dark";
    try {
      await window.glazeAPI.nativeTheme.setThemeSource(source);
      await refreshThemeInfo();
    } catch (error) {
      toast.error(`Failed to set theme: ${error}`);
    }
  };

  return (
    <ScrollArea
      toolbar={
        <Toolbar>
          <ToolbarContent>
            <ToolbarTitle>Settings</ToolbarTitle>
          </ToolbarContent>
        </Toolbar>
      }
    >
      <div className="px-4 flex flex-col gap-8 mb-8">
        <FieldSet>
          <FieldLegend>Appearance</FieldLegend>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="theme">Theme</FieldLabel>
              </FieldContent>
              <RadioGroup
                value={themeInfo?.themeSource ?? "system"}
                onValueChange={handleThemeChange}
                orientation="horizontal"
              >
                <Label>
                  <RadioGroupItem value="system" />
                  Auto
                </Label>
                <Label>
                  <RadioGroupItem value="light" />
                  Light
                </Label>
                <Label>
                  <RadioGroupItem value="dark" />
                  Dark
                </Label>
              </RadioGroup>
            </Field>
          </FieldGroup>
        </FieldSet>

        <LibrarySettings />
      </div>
    </ScrollArea>
  );
}
