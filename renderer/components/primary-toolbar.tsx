import { ChartGantt, CircleHelp, List as ListIcon, Network, SquareTerminal } from "lucide-react";
import {
  Button,
  SegmentedControl,
  SegmentedControlItem,
  Toolbar,
  ToolbarActions,
  ToolbarContent,
  ToolbarDescription,
  ToolbarSearchButton,
  ToolbarTitle,
} from "@glaze/core/components";

import { isViewMode, type ViewMode } from "../lib/search";
import { useTerminals } from "../lib/terminal-context";

interface PrimaryToolbarProps {
  title: string;
  subtitle: string;
  query: string;
  onQueryChange: (query: string) => void;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onOpenHelp: () => void;
}

export function PrimaryToolbar({
  title,
  subtitle,
  query,
  onQueryChange,
  view,
  onViewChange,
  onOpenHelp,
}: PrimaryToolbarProps) {
  const { toggle, open } = useTerminals();
  return (
    <Toolbar>
      <ToolbarContent>
        <ToolbarTitle>{title}</ToolbarTitle>
        <ToolbarDescription>{subtitle}</ToolbarDescription>
      </ToolbarContent>
      <ToolbarActions>
        {/* data-tour wrappers are the guided tour's anchors (see help/tour-steps.ts). */}
        <div data-tour="help" className="flex">
          <Button
            variant="glass"
            size="large"
            iconOnly
            aria-label="Help"
            title="Help"
            onClick={onOpenHelp}
          >
            <CircleHelp />
          </Button>
        </div>
        <div data-tour="terminal" className="flex">
          <Button
            variant="glass"
            size="large"
            iconOnly
            aria-label="Toggle terminal"
            title={open ? "Hide terminal" : "Show terminal"}
            onClick={toggle}
          >
            <SquareTerminal />
          </Button>
        </div>
        <div data-tour="search" className="flex">
          <ToolbarSearchButton value={query} onChange={onQueryChange} size="large" />
        </div>
        <div data-tour="views" className="flex">
          <SegmentedControl
            value={view}
            onValueChange={(value) => {
              if (isViewMode(value)) onViewChange(value);
            }}
            variant="glass"
            size="large"
            aria-label="View mode"
          >
            <SegmentedControlItem value="river" iconOnly aria-label="Timeline" title="Timeline">
              <ChartGantt />
            </SegmentedControlItem>
            <SegmentedControlItem value="graph" iconOnly aria-label="Graph" title="Graph">
              <Network />
            </SegmentedControlItem>
            <SegmentedControlItem value="list" iconOnly aria-label="List" title="List">
              <ListIcon />
            </SegmentedControlItem>
          </SegmentedControl>
        </div>
      </ToolbarActions>
    </Toolbar>
  );
}
