import type { TextMeasurer } from "@metabase/custom-viz";

export const PAD = 8;
export const LABEL_SIZE = 12;
export const CELL_GAP = 2;
export const CELL_RADIUS = 4;
export const LEGEND_BAR_WIDTH = 160;
export const LEGEND_BAR_HEIGHT = 8;
export const LEGEND_BAND = 30;

export const labelFont = { size: `${LABEL_SIZE}px`, weight: 400 as const };

/** Gap between a row label and the first cell. */
export const ROW_LABEL_INSET = 12;

const ELLIPSIS = "…";

/** Shorten text to fit `maxWidth`, adding an ellipsis when it has to cut. */
export function truncate(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string {
  if (maxWidth <= 0) {
    return "";
  }
  if (measure(text) <= maxWidth) {
    return text;
  }

  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(text.slice(0, mid) + ELLIPSIS) <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return lo > 0 ? text.slice(0, lo) + ELLIPSIS : "";
}

/** Memoise text measurement — a big grid asks for the same strings a lot. */
export function createMeasurer(measureText: TextMeasurer) {
  const cache = new Map<string, number>();
  return (text: string) => {
    const hit = cache.get(text);
    if (hit !== undefined) {
      return hit;
    }
    const width = measureText(text, labelFont).width;
    cache.set(text, width);
    return width;
  };
}

export type Layout = {
  gutter: number;
  gridX: number;
  gridY: number;
  gridWidth: number;
  gridHeight: number;
  cellWidth: number;
  cellHeight: number;
  rotateColumnLabels: boolean;
  columnLabelBand: number;
  /**
   * How much text the column label at `index` may use. Rotated labels lean
   * down and to the left of their column, so the leftmost ones have less room
   * than the band alone allows.
   */
  columnLabelBudget: (index: number) => number;
};

export function computeLayout({
  width,
  height,
  rowCount,
  columnCount,
  maxRowLabelWidth,
  maxColumnLabelWidth,
  legendBand,
}: {
  width: number;
  height: number;
  rowCount: number;
  columnCount: number;
  maxRowLabelWidth: number;
  maxColumnLabelWidth: number;
  legendBand: number;
}): Layout | null {
  const maxGutter = Math.round(width * 0.35);

  // ROW_LABEL_INSET has to match the budget `truncate` is given for row
  // labels, or the longest label gets an ellipsis with room to spare.
  const rowGutter = Math.max(
    24,
    Math.min(maxRowLabelWidth + ROW_LABEL_INSET, maxGutter),
  );

  const cellWidthFor = (g: number) => (width - PAD * 2 - g) / columnCount;
  const rotateColumnLabels =
    maxColumnLabelWidth > cellWidthFor(rowGutter) - 6;

  // A rotated label hangs down-left from the middle of its column, so the
  // first one reaches past the grid unless the gutter makes room for it.
  // Widening the gutter keeps labels whole instead of truncating them; the
  // 35% cap stops long labels from crowding out the cells.
  const overhang = rotateColumnLabels
    ? maxColumnLabelWidth * Math.SQRT1_2 - cellWidthFor(rowGutter) / 2
    : 0;
  const gutter = Math.min(Math.max(rowGutter, Math.ceil(overhang)), maxGutter);

  // A rotated label leans at 45 degrees, so its footprint is its length
  // projected onto the vertical axis.
  const rotatedBand = Math.min(
    Math.ceil(maxColumnLabelWidth * Math.SQRT1_2) + 12,
    Math.round(height * 0.35),
  );
  const columnLabelBand = rotateColumnLabels ? rotatedBand : LABEL_SIZE + 10;

  const gridX = PAD + gutter;
  const gridY = PAD + legendBand;
  const gridWidth = width - PAD - gridX;
  const gridHeight = height - PAD - columnLabelBand - gridY;

  if (gridWidth < columnCount || gridHeight < rowCount) {
    return null;
  }

  const cellWidth = gridWidth / columnCount;
  // +1 absorbs the rounding in `rotatedBand`, so a label that the band was
  // sized for isn't truncated by a fraction of a pixel.
  const bandBudget = (columnLabelBand - 12) * Math.SQRT2 + 1;

  return {
    gutter,
    gridX,
    gridY,
    gridWidth,
    gridHeight,
    cellWidth,
    cellHeight: gridHeight / rowCount,
    rotateColumnLabels,
    columnLabelBand,
    columnLabelBudget: (index: number) => {
      if (!rotateColumnLabels) {
        return cellWidth - 4;
      }
      // Distance from this label's anchor to the left edge, measured along
      // the 45-degree baseline the text actually runs on.
      const anchorX = gridX + (index + 0.5) * cellWidth;
      return Math.min(bandBudget, anchorX * Math.SQRT2 - 4);
    },
  };
}
