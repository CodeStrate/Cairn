import { ChartGantt, List as ListIcon, Network, SquareTerminal } from "lucide-react";
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
}

export function PrimaryToolbar({ title, subtitle, query, onQueryChange, view, onViewChange }: PrimaryToolbarProps) {
  return (
    <Toolbar>
      <ToolbarContent>
        <ToolbarTitle>{title}</ToolbarTitle>
        <ToolbarDescription>{subtitle}</ToolbarDescription>
      </ToolbarContent>
      <ToolbarActions>
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
        <ToolbarSearchButton value={query} onChange={onQueryChange} size="large" />
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
      </ToolbarActions>
    </Toolbar>
  );
}
