import type { Column, RowValue, Series } from "@metabase/custom-viz";
import { isNumeric } from "@metabase/custom-viz";

import type { HeatmapCell, HeatmapModel, Settings } from "./types";

const NULL_KEY = "__null__";

/** Stable identity for a dimension value, including nulls and dates. */
export function valueKey(value: RowValue): string {
  if (value === null || value === undefined) {
    return NULL_KEY;
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export const cellKey = (rowIndex: number, colIndex: number) =>
  `${rowIndex}:${colIndex}`;

export function findColumn(
  cols: Column[],
  name: string | null | undefined,
): Column | null {
  if (!name) {
    return null;
  }
  return cols.find((col) => col.name === name) ?? null;
}

/**
 * Columns that can act as a heatmap dimension. Anything that isn't the
 * measure will do — dates and booleans group just as well as strings.
 */
export function dimensionColumns(cols: Column[]): Column[] {
  const nonNumeric = cols.filter((col) => !isNumeric(col));
  return nonNumeric.length >= 2 ? nonNumeric : cols;
}

export function measureColumns(cols: Column[]): Column[] {
  const numeric = cols.filter(isNumeric);
  return numeric.length > 0 ? numeric : cols;
}

/**
 * Turn the result rows into a full row-by-column matrix.
 *
 * Every distinct value of each dimension gets a slot, in order of first
 * appearance, so combinations missing from the results render as empty cells.
 * If the same pair shows up more than once the first row wins — a heatmap can
 * only show one number per cell, and summing an average would be wrong.
 */
export function buildModel(
  series: Series,
  settings: Settings,
): HeatmapModel | null {
  const [{ data }] = series;
  const { cols, rows } = data;

  const rowCol = findColumn(cols, settings.rowColumn);
  const colCol = findColumn(cols, settings.colColumn);
  const valueCol = findColumn(cols, settings.valueColumn);

  if (!rowCol || !colCol || !valueCol) {
    return null;
  }

  const rowIdx = cols.indexOf(rowCol);
  const colIdx = cols.indexOf(colCol);
  const valueIdx = cols.indexOf(valueCol);

  const rowValues: RowValue[] = [];
  const colValues: RowValue[] = [];
  const rowSlots = new Map<string, number>();
  const colSlots = new Map<string, number>();

  const slotFor = (
    value: RowValue,
    slots: Map<string, number>,
    values: RowValue[],
  ) => {
    const key = valueKey(value);
    const existing = slots.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const index = values.length;
    slots.set(key, index);
    values.push(value);
    return index;
  };

  const cells = new Map<string, HeatmapCell>();
  let min = Infinity;
  let max = -Infinity;

  for (const row of rows) {
    const r = slotFor(row[rowIdx], rowSlots, rowValues);
    const c = slotFor(row[colIdx], colSlots, colValues);
    const key = cellKey(r, c);

    if (cells.has(key)) {
      continue;
    }

    const raw = row[valueIdx];
    const value = typeof raw === "number" ? raw : Number(raw);
    if (raw === null || raw === undefined || raw === "" || !Number.isFinite(value)) {
      continue;
    }

    cells.set(key, { rowIndex: r, colIndex: c, value, row });
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  if (cells.size === 0) {
    return null;
  }

  const detailCols = (settings.detailColumns ?? [])
    .map((name) => findColumn(cols, name))
    .filter((col): col is Column => col !== null);

  return {
    rowValues,
    colValues,
    cells,
    min,
    max,
    rowCol,
    colCol,
    valueCol,
    titleCol: findColumn(cols, settings.titleColumn),
    detailCols,
  };
}
