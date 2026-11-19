import {
  Children,
  isValidElement,
  useEffect,
  type ComponentProps,
  type ElementType,
  type ReactNode,
} from "react";
import { clsx, type ClassValue } from "clsx";
import {
  Label as RadixLabel,
  RadioGroup as RadixRadioGroup,
  Switch as RadixSwitch,
} from "radix-ui";
import { extendTailwindMerge } from "tailwind-merge";

import { applyTheme } from "./themes";

/**
 * tailwind-merge only knows Tailwind's default font sizes; without this it reads our type
 * scale (text-small, text-regular, …, from theme.css) as text *colours* and drops a real
 * colour like text-accent-contrast when both appear. Keep in sync with the --text-* tokens.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "mini",
            "small",
            "regular",
            "strong",
            "large",
            "large-strong",
            "heading1",
            "heading2",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Applies the saved colour theme and keeps it current: light/dark changes from the OS or
 * nativeTheme, and theme changes made in Settings (broadcast as `theme:changed`).
 */
export function useTheme(): void {
  useEffect(() => {
    const load = (info: { themeId: string; accentColor: string | null }) =>
      applyTheme(info.themeId, info.accentColor);
    void window.wefty.ipc
      .invoke<{ themeId: string; accentColor: string | null }>("theme:get")
      .then(load)
      .catch(() => applyTheme());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMedia = () => applyTheme();
    media.addEventListener("change", onMedia);
    const offChanged = window.wefty.ipc.on("theme:changed", (payload) =>
      load(payload as { themeId: string; accentColor: string | null }),
    );
    return () => {
      media.removeEventListener("change", onMedia);
      offChanged();
    };
  }, []);
}

// --- Text -------------------------------------------------------------------

const TEXT_VARIANTS = {
  mini: "text-mini",
  "mini-strong": "text-mini font-semibold",
  small: "text-small",
  "small-strong": "text-small font-semibold",
  "small-mono": "font-mono text-[11.5px] leading-4",
  regular: "text-regular",
  strong: "text-strong",
  large: "text-large",
  "large-strong": "text-large-strong",
  "extra-large": "text-[18px] leading-6",
  "extra-large-strong": "text-[18px] leading-6 font-semibold",
  heading1: "text-heading1",
  heading2: "text-heading2",
  mono: "font-mono text-[12.5px] leading-4.5",
  "mono-strong": "font-mono text-[12.5px] leading-4.5 font-semibold",
} as const;

const TEXT_COLORS = {
  primary: "text-primary",
  secondary: "text-secondary",
  tertiary: "text-tertiary",
  quaternary: "text-quaternary",
  accent: "text-accent",
  disabled: "text-quaternary",
  link: "text-accent underline-offset-2 hover:underline",
  inherit: "text-inherit",
  red: "text-red-500",
  orange: "text-orange-500",
  yellow: "text-yellow-500",
  green: "text-green-500",
  blue: "text-blue-500",
  purple: "text-purple-500",
  magenta: "text-fuchsia-500",
} as const;

export type TextVariant = keyof typeof TEXT_VARIANTS;
export type TextColor = keyof typeof TEXT_COLORS;

type TextProps = Omit<ComponentProps<"span">, "color"> & {
  as?: ElementType;
  variant?: TextVariant;
  color?: TextColor;
  align?: "left" | "center" | "right";
  truncate?: boolean;
};

export function Text({
  as: Component = "span",
  variant = "regular",
  color = "primary",
  align,
  truncate,
  className,
  ...props
}: TextProps) {
  return (
    <Component
      className={cn(
        TEXT_VARIANTS[variant],
        TEXT_COLORS[color],
        align && `text-${align}`,
        truncate && "truncate",
        className,
      )}
      {...props}
    />
  );
}

// --- Button -----------------------------------------------------------------

const BUTTON_VARIANTS = {
  default: "bg-control text-primary hover:bg-control-hover",
  transparent: "bg-transparent text-secondary hover:bg-control hover:text-primary",
  glass: "bg-control text-secondary hover:bg-control-hover hover:text-primary rounded-full",
  accent: "bg-accent text-accent-contrast hover:bg-accent-hover",
  destructive: "bg-destructive text-white hover:opacity-90",
} as const;

const BUTTON_SIZES = {
  small: { base: "h-6 px-2 text-small gap-1 [&_svg]:size-3.5", icon: "size-6" },
  medium: { base: "h-7 px-2.5 text-regular gap-1.5 [&_svg]:size-4", icon: "size-7" },
  large: { base: "h-8 px-3 text-regular gap-1.5 [&_svg]:size-4", icon: "size-8" },
} as const;

type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  /** Square, icon-sized button. Inferred when the only child is an icon. */
  iconOnly?: boolean;
};

function looksIconOnly(children: ReactNode): boolean {
  const parts = Children.toArray(children);
  return parts.length === 1 && isValidElement(parts[0]) && typeof parts[0].type !== "string";
}

export function Button({
  variant = "default",
  size = "medium",
  iconOnly,
  className,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  const square = iconOnly ?? looksIconOnly(children);
  const sizing = BUTTON_SIZES[size];
  return (
    <button
      type={type}
      data-variant={variant}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors outline-none select-none",
        "focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-40",
        BUTTON_VARIANTS[variant],
        sizing.base,
        square && cn(sizing.icon, "px-0"),
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// --- Badge ------------------------------------------------------------------

/**
 * Tinted from the theme's category colours (`--wf-tint-*`), so badges follow the theme.
 * Written out in full because Tailwind only generates classes it can find literally.
 */
const BADGE_COLORS = {
  primary: "bg-control text-primary",
  secondary: "bg-control text-secondary",
  blue: "bg-[color-mix(in_srgb,var(--wf-tint-blue)_14%,transparent)] text-(--wf-tint-blue)",
  green: "bg-[color-mix(in_srgb,var(--wf-tint-green)_14%,transparent)] text-(--wf-tint-green)",
  yellow: "bg-[color-mix(in_srgb,var(--wf-tint-yellow)_14%,transparent)] text-(--wf-tint-yellow)",
  orange: "bg-[color-mix(in_srgb,var(--wf-tint-orange)_14%,transparent)] text-(--wf-tint-orange)",
  red: "bg-[color-mix(in_srgb,var(--wf-tint-red)_14%,transparent)] text-(--wf-tint-red)",
  purple: "bg-[color-mix(in_srgb,var(--wf-tint-purple)_14%,transparent)] text-(--wf-tint-purple)",
  magenta:
    "bg-[color-mix(in_srgb,var(--wf-tint-magenta)_14%,transparent)] text-(--wf-tint-magenta)",
} as const;

export function Badge({
  color = "secondary",
  className,
  ...props
}: Omit<ComponentProps<"span">, "color"> & { color?: keyof typeof BADGE_COLORS }) {
  return (
    <span
      className={cn(
        "inline-flex h-5.5 items-center rounded-full px-2.5 text-small font-medium whitespace-nowrap",
        BADGE_COLORS[color],
        className,
      )}
      {...props}
    />
  );
}

// --- Form controls -----------------------------------------------------------

const INPUT_SIZES = {
  small: "h-6 text-small",
  medium: "h-7 text-regular",
  large: "h-8 text-regular",
};

export function Input({
  className,
  size = "medium",
  ...props
}: Omit<ComponentProps<"input">, "size"> & { size?: keyof typeof INPUT_SIZES; variant?: string }) {
  return (
    <input
      className={cn(
        "w-full min-w-0 rounded-md border border-separator bg-input px-2 text-primary outline-none placeholder:text-tertiary",
        "focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-50",
        INPUT_SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full min-w-0 resize-y rounded-md border border-separator bg-input px-2.5 py-2 text-regular text-primary outline-none",
        "placeholder:text-tertiary focus:border-accent focus:ring-2 focus:ring-accent/25",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<typeof RadixLabel.Root>) {
  return (
    <RadixLabel.Root
      className={cn("inline-flex items-center gap-1.5 text-regular text-primary", className)}
      {...props}
    />
  );
}

export function Switch({ className, ...props }: ComponentProps<typeof RadixSwitch.Root>) {
  return (
    <RadixSwitch.Root
      className={cn(
        "relative inline-flex h-4.5 w-8 shrink-0 items-center rounded-full bg-control-hover transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40 data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4" />
    </RadixSwitch.Root>
  );
}

export function RadioGroup({ className, ...props }: ComponentProps<typeof RadixRadioGroup.Root>) {
  return (
    <RadixRadioGroup.Root
      className={cn(
        "flex gap-3 data-[orientation=vertical]:flex-col data-[orientation=horizontal]:items-center",
        className,
      )}
      {...props}
    />
  );
}

export function RadioGroupItem({
  className,
  ...props
}: ComponentProps<typeof RadixRadioGroup.Item>) {
  return (
    <RadixRadioGroup.Item
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border border-separator bg-input outline-none",
        "focus-visible:ring-2 focus-visible:ring-accent/50 data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <RadixRadioGroup.Indicator className="size-1.5 rounded-full bg-white" />
    </RadixRadioGroup.Item>
  );
}

// --- Field layout (settings forms) ---------------------------------------------

export function FieldSet({ className, ...props }: ComponentProps<"fieldset">) {
  return <fieldset className={cn("flex min-w-0 flex-col gap-2", className)} {...props} />;
}

export function FieldLegend({ className, ...props }: ComponentProps<"legend">) {
  return <legend className={cn("mb-1 text-strong text-primary", className)} {...props} />;
}

export function FieldGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col divide-y divide-separator rounded-lg bg-well px-3", className)}
      {...props}
    />
  );
}

export function Field({
  className,
  orientation = "vertical",
  ...props
}: ComponentProps<"div"> & { orientation?: "vertical" | "horizontal" }) {
  return (
    <div
      className={cn(
        "flex min-w-0 gap-3 py-2.5",
        orientation === "horizontal" ? "items-center justify-between" : "flex-col",
        className,
      )}
      {...props}
    />
  );
}

export function FieldContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)} {...props} />;
}

export function FieldLabel({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-regular text-primary", className)} {...props} />;
}

export function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-small text-secondary", className)} {...props} />;
}
