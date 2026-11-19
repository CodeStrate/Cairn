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
  THEME_PRESETS,
  cn,
  findTheme,
  terminalPalette,
  toast,
  useTheme,
  type ThemePreset,
} from "@renderer/ui";

import type { HarnessInfo, ThemeInfo } from "@main/shared/types";

import { errorMessage } from "../components/detail/detail-parts";
import { invoke } from "../lib/bridge";
import { getOSLabel } from "@renderer/lib/os-labels";
import { plural, shortenPath } from "../lib/format";
import { HARNESS_ORDER } from "../lib/harness";
import {
  useLibrary,
  useLibraryUpdates,
  useSetHarnessEnabled,
  useSetProjectHidden,
} from "../lib/library-api";

function harnessDescription(harness: HarnessInfo): string {
  const device = getOSLabel("device");
  if (!harness.enabled)
    return harness.available ? `Found on this ${device}` : `Not found on this ${device}`;
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

/** A small picture of the theme: window, sidebar card, accent, and terminal colours. */
function ThemeSwatch({ preset, dark }: { preset: ThemePreset; dark: boolean }) {
  const terminal = terminalPalette(
    preset,
    preset.mode === "adaptive" ? dark : preset.mode === "dark",
  );
  const page = preset.vars["--wf-window"] ?? (dark ? "#1c1c1e" : "#ffffff");
  const panel = preset.vars["--wf-sidebar-panel"] ?? (dark ? "#2a2a2c" : "#efeff1");
  const accent = preset.vars["--wf-accent"] ?? "var(--wf-accent)";
  const ansi = [
    terminal.red,
    terminal.green,
    terminal.yellow,
    terminal.blue,
    terminal.magenta,
    terminal.cyan,
  ];
  return (
    <div className="flex h-16 overflow-hidden rounded-lg" style={{ background: page }} aria-hidden>
      <div className="m-1.5 w-7 rounded-md" style={{ background: panel }} />
      <div className="flex flex-1 flex-col justify-between py-2 pr-2">
        <div className="h-1.5 w-10 rounded-full" style={{ background: accent }} />
        <div className="flex gap-1 rounded px-1.5 py-1" style={{ background: terminal.background }}>
          {ansi.map((color, index) => (
            <span key={index} className="size-1.5 rounded-full" style={{ background: color }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ThemeGallery({
  selectedId,
  dark,
  onSelect,
}: {
  selectedId: string;
  dark: boolean;
  onSelect: (preset: ThemePreset) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3 py-3">
      {THEME_PRESETS.map((preset) => {
        const selected = preset.id === selectedId;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(preset)}
            className={cn(
              "flex flex-col gap-1.5 rounded-xl p-1.5 text-left outline-none ring-offset-0",
              "hover:bg-control-subtle focus-visible:ring-2 focus-visible:ring-accent/60",
              selected && "ring-2 ring-accent",
            )}
          >
            <ThemeSwatch preset={preset} dark={dark} />
            <span className="px-0.5 text-small text-primary">
              {preset.name}
              <span className="text-tertiary">
                {preset.mode === "adaptive"
                  ? " · Light & Dark"
                  : preset.mode === "dark"
                    ? " · Dark"
                    : " · Light"}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SettingsView() {
  useTheme();
  const [themeInfo, setThemeInfo] = useState<ThemeInfo | null>(null);
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
      void invoke("window:closeSettings");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const refreshThemeInfo = async () => {
    try {
      const info = await invoke<ThemeInfo>("theme:get");
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

  const handleThemePreset = async (preset: ThemePreset) => {
    try {
      setThemeInfo(await invoke<ThemeInfo>("theme:set", { themeId: preset.id, mode: preset.mode }));
    } catch (error) {
      toast.error(`Failed to set theme: ${error}`);
    }
  };
  const activePreset = findTheme(themeInfo?.themeId);

  const handleThemeChange = async (value: string) => {
    const source = value as "system" | "light" | "dark";
    try {
      setThemeInfo(await invoke<ThemeInfo>("theme:set", { source }));
    } catch (error) {
      toast.error(`Failed to set theme: ${error}`);
    }
  };

  return (
    <ScrollArea
      toolbar={
        <Toolbar leadingInset>
          <ToolbarContent>
            <ToolbarTitle>Settings</ToolbarTitle>
          </ToolbarContent>
        </Toolbar>
      }
    >
      <div className="px-4 flex flex-col gap-8 mb-8">
        <FieldSet>
          <FieldLegend>Theme</FieldLegend>
          <FieldDescription>Colours for the whole app, including the terminal.</FieldDescription>
          <ThemeGallery
            selectedId={activePreset.id}
            dark={themeInfo?.shouldUseDarkColors ?? true}
            onSelect={(preset) => void handleThemePreset(preset)}
          />
        </FieldSet>

        <FieldSet>
          <FieldLegend>Appearance</FieldLegend>
          {activePreset.mode !== "adaptive" ? (
            <FieldDescription>
              {activePreset.name} is always {activePreset.mode}. Choose Wefty to follow Light and
              Dark.
            </FieldDescription>
          ) : null}
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="theme">Theme</FieldLabel>
              </FieldContent>
              <RadioGroup
                value={themeInfo?.themeSource ?? "system"}
                onValueChange={handleThemeChange}
                orientation="horizontal"
                disabled={activePreset.mode !== "adaptive"}
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
