import { List as ListIcon, Waypoints } from "lucide-react";
import {
  SegmentedControl,
  SegmentedControlItem,
  Toolbar,
  ToolbarActions,
  ToolbarContent,
  ToolbarDescription,
  ToolbarSearchButton,
  ToolbarTitle,
} from "@glaze/core/components";

import type { ViewMode } from "../lib/search";

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
        <ToolbarSearchButton value={query} onChange={onQueryChange} size="large" />
        <SegmentedControl
          value={view}
          onValueChange={(value) => {
            if (value === "graph" || value === "list") onViewChange(value);
          }}
          variant="glass"
          size="large"
          aria-label="View mode"
        >
          <SegmentedControlItem value="graph" iconOnly aria-label="Graph" title="Graph">
            <Waypoints />
          </SegmentedControlItem>
          <SegmentedControlItem value="list" iconOnly aria-label="List" title="List">
            <ListIcon />
          </SegmentedControlItem>
        </SegmentedControl>
      </ToolbarActions>
    </Toolbar>
  );
}
