import type { Column, RowValue } from "@metabase/custom-viz";

export type Settings = {
  /** Column whose distinct values become the rows (y axis). */
  rowColumn?: string | null;
  /** Column whose distinct values become the columns (x axis). */
  colColumn?: string | null;
  /** Numeric column that drives the cell colour. */
  valueColumn?: string | null;
  /** Optional column shown first in the tooltip. */
  titleColumn?: string | null;
  /** Extra columns appended to the tooltip, in order. */
  detailColumns?: string[] | null;
  showValues?: boolean | null;
  showLegend?: boolean | null;
};

export type HeatmapCell = {
  rowIndex: number;
  colIndex: number;
  value: number;
  /** The result row this cell came from, for tooltips and drill-through. */
  row: RowValue[];
};

export type HeatmapModel = {
  rowValues: RowValue[];
  colValues: RowValue[];
  /** Keyed by `${rowIndex}:${colIndex}` — absent means an empty cell. */
  cells: Map<string, HeatmapCell>;
  min: number;
  max: number;
  rowCol: Column;
  colCol: Column;
  valueCol: Column;
  titleCol: Column | null;
  detailCols: Column[];
};
