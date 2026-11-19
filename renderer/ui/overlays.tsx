import { useState, type ComponentProps, type ReactNode } from "react";
import {
  ChevronRight,
  CircleArrowRight,
  CircleMinus,
  ClipboardCopy,
  Copy,
  EyeOff,
  Folder,
  Pencil,
  Play,
  Settings,
  SquareTerminal,
  TextCursorInput,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertDialog as RadixAlertDialog,
  Collapsible,
  ContextMenu as RadixContextMenu,
  Dialog as RadixDialog,
  DropdownMenu as RadixDropdownMenu,
  Tooltip,
} from "radix-ui";
import { Toaster as Sonner } from "sonner";

import { Button, cn, Text } from "./primitives";

export { toast } from "sonner";

// --- Menus ------------------------------------------------------------------

/** Menu items name their icon (the SF Symbol names the Glaze build used); mapped to Lucide here. */
const MENU_ICONS: Record<string, LucideIcon> = {
  "arrow.right.circle": CircleArrowRight,
  "doc.on.clipboard": ClipboardCopy,
  "doc.on.doc": Copy,
  "eye.slash": EyeOff,
  folder: Folder,
  gearshape: Settings,
  "minus.circle": CircleMinus,
  pencil: Pencil,
  play: Play,
  terminal: SquareTerminal,
  "text.insert": TextCursorInput,
  trash: Trash2,
};

const MENU_CONTENT =
  "z-1000 min-w-48 overflow-hidden rounded-lg bg-surface-popover p-1 text-regular text-primary shadow-popover backdrop-blur-xl";
const MENU_ITEM =
  "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1 outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-40 data-highlighted:bg-accent data-highlighted:text-accent-contrast [&_svg]:size-3.5 [&_svg]:shrink-0";

interface MenuItemExtras {
  icon?: string;
  /** Secondary line under the label. */
  sublabel?: ReactNode;
}

function MenuItemBody({ icon, sublabel, children }: MenuItemExtras & { children: ReactNode }) {
  const Icon = icon ? MENU_ICONS[icon] : undefined;
  return (
    <>
      {Icon ? <Icon aria-hidden /> : icon ? <span className="size-3.5" /> : null}
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{children}</span>
        {sublabel ? <span className="truncate text-small opacity-70">{sublabel}</span> : null}
      </span>
    </>
  );
}

export const ContextMenu = RadixContextMenu.Root;
export const ContextMenuTrigger = RadixContextMenu.Trigger;

export function ContextMenuContent({
  className,
  ...props
}: ComponentProps<typeof RadixContextMenu.Content>) {
  return (
    <RadixContextMenu.Portal>
      <RadixContextMenu.Content className={cn(MENU_CONTENT, className)} {...props} />
    </RadixContextMenu.Portal>
  );
}

export function ContextMenuItem({
  icon,
  sublabel,
  className,
  children,
  ...props
}: ComponentProps<typeof RadixContextMenu.Item> & MenuItemExtras) {
  return (
    <RadixContextMenu.Item className={cn(MENU_ITEM, className)} {...props}>
      <MenuItemBody icon={icon} sublabel={sublabel}>
        {children}
      </MenuItemBody>
    </RadixContextMenu.Item>
  );
}

export function ContextMenuSeparator() {
  return <RadixContextMenu.Separator className="mx-1 my-1 h-px bg-separator" />;
}

export const DropdownMenu = RadixDropdownMenu.Root;
export const DropdownMenuTrigger = RadixDropdownMenu.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof RadixDropdownMenu.Content>) {
  return (
    <RadixDropdownMenu.Portal>
      <RadixDropdownMenu.Content
        sideOffset={sideOffset}
        className={cn(MENU_CONTENT, className)}
        {...props}
      />
    </RadixDropdownMenu.Portal>
  );
}

export function DropdownMenuItem({
  icon,
  sublabel,
  className,
  children,
  ...props
}: ComponentProps<typeof RadixDropdownMenu.Item> & MenuItemExtras) {
  return (
    <RadixDropdownMenu.Item className={cn(MENU_ITEM, className)} {...props}>
      <MenuItemBody icon={icon} sublabel={sublabel}>
        {children}
      </MenuItemBody>
    </RadixDropdownMenu.Item>
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof RadixDropdownMenu.Label>) {
  return (
    <RadixDropdownMenu.Label
      className={cn("px-2 py-1 text-small text-tertiary", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <RadixDropdownMenu.Separator className="mx-1 my-1 h-px bg-separator" />;
}

// --- Dialogs ----------------------------------------------------------------

const DIALOG_SIZES = {
  small: "w-95",
  medium: "w-120",
  large: "w-155",
  xl: "w-190",
  "2xl": "w-225",
} as const;

const OVERLAY = "fixed inset-0 z-900 bg-black/30 backdrop-blur-[2px]";
const PANEL =
  "fixed top-1/2 left-1/2 z-901 flex max-h-[85vh] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl bg-window-bg p-5 shadow-popover outline-none";

interface ConfirmProps {
  /** Runs on confirm; the dialog closes when it resolves and stays open if it throws. */
  onConfirm?: () => void | Promise<void>;
  confirmLabel?: ReactNode;
  confirmVariant?: "accent" | "destructive";
  confirmDisabled?: boolean;
}

function useConfirm(onConfirm: ConfirmProps["onConfirm"], close: () => void) {
  const [pending, setPending] = useState(false);
  const run = async () => {
    if (!onConfirm) return close();
    setPending(true);
    try {
      await onConfirm();
      close();
    } catch {
      // The caller reported the error (e.g. a toast); keep the dialog open to retry.
    } finally {
      setPending(false);
    }
  };
  return { pending, run };
}

interface DialogProps extends ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  size?: keyof typeof DIALOG_SIZES;
  showCloseButton?: boolean;
  children?: ReactNode;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  size = "medium",
  showCloseButton,
  onConfirm,
  confirmLabel = "OK",
  confirmVariant = "accent",
  confirmDisabled,
  children,
}: DialogProps) {
  const { pending, run } = useConfirm(onConfirm, () => onOpenChange(false));
  const hasFooter = onConfirm !== undefined;
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={OVERLAY} />
        <RadixDialog.Content className={cn(PANEL, DIALOG_SIZES[size])}>
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <RadixDialog.Title asChild>
                <Text as="h2" variant="large-strong">
                  {title}
                </Text>
              </RadixDialog.Title>
              {description ? (
                <RadixDialog.Description asChild>
                  <Text as="p" variant="small" color="secondary" className="wrap-break-word">
                    {description}
                  </Text>
                </RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            {showCloseButton ? (
              <RadixDialog.Close asChild>
                <Button variant="transparent" size="small" aria-label="Close">
                  <X />
                </Button>
              </RadixDialog.Close>
            ) : null}
          </div>
          {children ? <div className="min-h-0">{children}</div> : null}
          {hasFooter ? (
            <form
              className="flex justify-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void run();
              }}
            >
              <RadixDialog.Close asChild>
                <Button>Cancel</Button>
              </RadixDialog.Close>
              <Button type="submit" variant={confirmVariant} disabled={confirmDisabled || pending}>
                {confirmLabel}
              </Button>
            </form>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = "OK",
  confirmVariant = "accent",
  confirmDisabled,
}: Omit<DialogProps, "children" | "size" | "showCloseButton">) {
  const { pending, run } = useConfirm(onConfirm, () => onOpenChange(false));
  return (
    <RadixAlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixAlertDialog.Portal>
        <RadixAlertDialog.Overlay className={OVERLAY} />
        <RadixAlertDialog.Content className={cn(PANEL, DIALOG_SIZES.small)}>
          <RadixAlertDialog.Title asChild>
            <Text as="h2" variant="large-strong" className="wrap-break-word">
              {title}
            </Text>
          </RadixAlertDialog.Title>
          <RadixAlertDialog.Description asChild>
            <Text as="p" color="secondary" className="wrap-break-word">
              {description}
            </Text>
          </RadixAlertDialog.Description>
          <div className="flex justify-end gap-2">
            <RadixAlertDialog.Cancel asChild>
              <Button>Cancel</Button>
            </RadixAlertDialog.Cancel>
            <Button
              variant={confirmVariant}
              disabled={confirmDisabled || pending}
              onClick={() => void run()}
            >
              {confirmLabel}
            </Button>
          </div>
        </RadixAlertDialog.Content>
      </RadixAlertDialog.Portal>
    </RadixAlertDialog.Root>
  );
}

// --- Collapsible --------------------------------------------------------------

export function CollapsibleRoot({ className, ...props }: ComponentProps<typeof Collapsible.Root>) {
  return <Collapsible.Root className={cn("group/collapsible min-w-0", className)} {...props} />;
}

export function CollapsibleTrigger({
  className,
  variant,
  ...props
}: ComponentProps<typeof Collapsible.Trigger> & { variant?: "section" }) {
  return (
    <Collapsible.Trigger
      className={cn(
        "flex items-center gap-1.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        variant === "section" && "text-small font-semibold text-secondary hover:text-primary",
        className,
      )}
      {...props}
    />
  );
}

export function CollapsibleChevron({ className }: { className?: string }) {
  return (
    <ChevronRight
      aria-hidden
      className={cn(
        "size-3 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-90",
        className,
      )}
    />
  );
}

export const CollapsibleContent = Collapsible.Content;

// --- Feedback -----------------------------------------------------------------

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <Tooltip.Provider delayDuration={500}>{children}</Tooltip.Provider>;
}

export function Toaster() {
  const dark = document.documentElement.classList.contains("dark");
  return (
    <Sonner
      position="bottom-right"
      theme={dark ? "dark" : "light"}
      toastOptions={{ className: "text-regular!" }}
    />
  );
}

export function EmptyState({
  title,
  description,
  placement,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** "viewport" centres in the whole window area; default centres in the parent. */
  placement?: "viewport" | "container";
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none flex flex-col items-center justify-center gap-1.5 p-8 text-center",
        placement === "viewport" ? "min-h-[60vh]" : "absolute inset-0",
      )}
    >
      <Text variant="large-strong" color="secondary">
        {title}
      </Text>
      {description ? (
        <Text color="tertiary" className="max-w-sm text-pretty">
          {description}
        </Text>
      ) : null}
      {action ? <div className="pointer-events-auto mt-2">{action}</div> : null}
    </div>
  );
}

/** Router error boundary. */
export function ErrorBoundaryView({ error, reset }: { error: unknown; reset?: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <Text variant="large-strong">Something went wrong</Text>
      <Text color="secondary" className="max-w-md wrap-break-word selectable">
        {message}
      </Text>
      <Button onClick={() => (reset ? reset() : window.location.reload())}>Try Again</Button>
    </div>
  );
}

// --- Content ------------------------------------------------------------------

export function Markdown({ className, children }: { className?: string; children: string }) {
  return (
    <div className={cn("wf-markdown", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: label }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {label}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function MessageRoot({
  from,
  className,
  ...props
}: ComponentProps<"div"> & { from: "user" | "assistant" }) {
  return (
    <div
      data-from={from}
      className={cn(
        "flex min-w-0",
        from === "user" ? "justify-end" : "justify-start",
        "group/message",
        className,
      )}
      {...props}
    />
  );
}

function MessageContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "min-w-0 selectable",
        "group-data-[from=user]/message:max-w-[88%] group-data-[from=user]/message:rounded-2xl group-data-[from=user]/message:bg-control group-data-[from=user]/message:px-3 group-data-[from=user]/message:py-2",
        "group-data-[from=assistant]/message:w-full",
        className,
      )}
      {...props}
    />
  );
}

/** Chat transcript building blocks (only the message parts Wefty uses). */
export const AIChat = { Message: { Root: MessageRoot, Content: MessageContent } };
