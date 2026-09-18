import type {
  Column,
  CustomVisualizationProps,
  FormatValueOptions,
  HoveredDataPoint,
  RowValue,
} from "@metabase/custom-viz";
import { formatValue } from "@metabase/custom-viz";
import { useCallback, useMemo, useState } from "react";

import { createRamp, readableInk } from "./color";
import {
  CELL_GAP,
  CELL_RADIUS,
  LABEL_SIZE,
  LEGEND_BAND,
  LEGEND_BAR_HEIGHT,
  LEGEND_BAR_WIDTH,
  PAD,
  ROW_LABEL_INSET,
  computeLayout,
  createMeasurer,
  truncate,
} from "./layout";
import { buildModel, cellKey } from "./model";
import type { HeatmapCell, Settings } from "./types";

/** Above this many cells the grid stops being readable and starts being slow. */
export const MAX_CELLS = 10_000;

/**
 * Cell labels sit on a saturated fill rather than on the page, so they don't
 * use the theme's page ink. Metabase's text colours are translucent, and
 * flattened onto a mid-ramp fill they bottom out around 4.3:1 — under the 4.5:1
 * WCAG floor for 12px text. Plain black and white are the only pair that clears
 * it everywhere on the ramp (worst case 4.6:1, at the point where the two swap).
 */
const CELL_INKS = ["#000000", "#ffffff"];

export function Visualization({
  width,
  height,
  series,
  settings,
  renderingContext,
  onClick,
  onHover,
}: CustomVisualizationProps<Settings>) {
  const { getColor, measureText, fontFamily, colorScheme } = renderingContext;
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const model = useMemo(() => buildModel(series, settings), [series, settings]);
  const ramp = useMemo(
    () => createRamp(getColor("brand"), colorScheme),
    [getColor, colorScheme],
  );
  const measure = useMemo(() => createMeasurer(measureText), [measureText]);

  const format = useCallback(
    (value: RowValue, column: Column, overrides?: FormatValueOptions) =>
      formatValue(value, {
        column,
        ...(settings.column?.(column) ?? {}),
        ...overrides,
      }),
    [settings],
  );

  const labels = useMemo(() => {
    if (!model) {
      return null;
    }
    return {
      rows: model.rowValues.map((value) => format(value, model.rowCol)),
      columns: model.colValues.map((value) => format(value, model.colCol)),
    };
  }, [model, format]);

  const handleHover = useCallback(
    (cell: HeatmapCell, element: Element) => {
      if (!model) {
        return;
      }
      const { cols } = series[0].data;
      const seen = new Set<Column>();
      const points: HoveredDataPoint[] = [];

      const push = (column: Column | null) => {
        if (!column || seen.has(column)) {
          return;
        }
        seen.add(column);
        points.push({
          key: column.display_name,
          value: cell.row[cols.indexOf(column)],
          col: column,
        });
      };

      push(model.titleCol);
      push(model.rowCol);
      push(model.colCol);
      push(model.valueCol);
      model.detailCols.forEach(push);

      setHoveredKey(cellKey(cell.rowIndex, cell.colIndex));
      onHover({ element, data: points });
    },
    [model, series, onHover],
  );

  const handleLeave = useCallback(() => {
    setHoveredKey(null);
    onHover(null);
  }, [onHover]);

  const handleClick = useCallback(
    (cell: HeatmapCell, event: React.MouseEvent<SVGRectElement>) => {
      if (!model) {
        return;
      }
      const { cols } = series[0].data;
      onClick({
        value: cell.value,
        column: model.valueCol,
        dimensions: [
          { value: cell.row[cols.indexOf(model.rowCol)], column: model.rowCol },
          { value: cell.row[cols.indexOf(model.colCol)], column: model.colCol },
        ],
        origin: { row: cell.row, cols },
        data: cols.map((col, index) => ({ col, value: cell.row[index] })),
        event: event.nativeEvent,
        element: event.currentTarget,
      });
    },
    [model, series, onClick],
  );

  if (!width || !height || !model || !labels) {
    return null;
  }

  const showLegend = settings.showLegend !== false;
  const showValues = settings.showValues !== false;

  const legendBand = showLegend ? LEGEND_BAND : 0;
  const layout = computeLayout({
    width,
    height,
    rowCount: model.rowValues.length,
    columnCount: model.colValues.length,
    maxRowLabelWidth: Math.max(...labels.rows.map(measure), 0),
    maxColumnLabelWidth: Math.max(...labels.columns.map(measure), 0),
    legendBand,
  });

  if (!layout) {
    return null;
  }

  const {
    gridX,
    gridY,
    gridWidth,
    gridHeight,
    cellWidth,
    cellHeight,
    rotateColumnLabels,
    columnLabelBudget,
  } = layout;

  const span = model.max - model.min;
  const positionOf = (value: number) => (span === 0 ? 0.5 : (value - model.min) / span);

  const borderColor = getColor("border");
  const mutedInk = getColor("text-secondary");
  const outlineInk = getColor("text-primary");
  const textStyle = { fontFamily, fontSize: LABEL_SIZE };

  /**
   * The exact value when it fits, the abbreviated one when it doesn't, and
   * nothing when neither does. Abbreviating unconditionally would round $3,845
   * to "$4k" even where there was room to say so precisely.
   */
  const fitValue = (value: number, budget: number): string | null => {
    const exact = format(value, model.valueCol);
    if (measure(exact) <= budget) {
      return exact;
    }
    const compact = format(value, model.valueCol, { compact: true });
    return measure(compact) <= budget ? compact : null;
  };

  const rects = [...model.cells.values()].map((cell) => {
    const fill = ramp.at(positionOf(cell.value));
    const x = gridX + cell.colIndex * cellWidth + CELL_GAP / 2;
    const y = gridY + cell.rowIndex * cellHeight + CELL_GAP / 2;
    const w = Math.max(1, cellWidth - CELL_GAP);
    const h = Math.max(1, cellHeight - CELL_GAP);
    const key = cellKey(cell.rowIndex, cell.colIndex);

    const label = showValues && h >= 16 ? fitValue(cell.value, w - 8) : null;

    return { cell, key, fill, x, y, w, h, label };
  });

  const hovered = rects.find((rect) => rect.key === hoveredKey);

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Heatmap of ${model.valueCol.display_name} by ${model.rowCol.display_name} and ${model.colCol.display_name}`}
      onMouseLeave={handleLeave}
      // An inline SVG sits on the text baseline, so the container ends up a few
      // pixels taller than the SVG. Metabase measures the container and feeds
      // the result back as `height`, so that gap compounds on every render
      // until the chart overflows. `block` breaks the loop.
      style={{ display: "block" }}
    >
      {showLegend && (
        <Legend
          x={width - PAD - LEGEND_BAR_WIDTH}
          y={PAD}
          stops={ramp.stops}
          min={fitValue(model.min, LEGEND_BAR_WIDTH / 2 - 6) ?? ""}
          max={fitValue(model.max, LEGEND_BAR_WIDTH / 2 - 6) ?? ""}
          ink={mutedInk}
          textStyle={textStyle}
        />
      )}

      <line
        x1={gridX - 3}
        y1={gridY}
        x2={gridX - 3}
        y2={gridY + gridHeight}
        stroke={borderColor}
      />
      <line
        x1={gridX - 3}
        y1={gridY + gridHeight + 3}
        x2={gridX + gridWidth}
        y2={gridY + gridHeight + 3}
        stroke={borderColor}
      />

      {labels.rows.map((label, index) => (
        <text
          key={index}
          x={gridX - ROW_LABEL_INSET + 3}
          y={gridY + (index + 0.5) * cellHeight}
          textAnchor="end"
          dominantBaseline="central"
          fill={mutedInk}
          style={textStyle}
        >
          {truncate(label, layout.gutter - ROW_LABEL_INSET, measure)}
        </text>
      ))}

      {labels.columns.map((label, index) => {
        const x = gridX + (index + 0.5) * cellWidth;
        const y = gridY + gridHeight + 12;
        const text = truncate(label, columnLabelBudget(index), measure);
        return (
          <text
            key={index}
            x={x}
            y={y}
            textAnchor={rotateColumnLabels ? "end" : "middle"}
            dominantBaseline={rotateColumnLabels ? "central" : "hanging"}
            fill={mutedInk}
            style={textStyle}
            transform={rotateColumnLabels ? `rotate(-45 ${x} ${y})` : undefined}
          >
            {text}
          </text>
        );
      })}

      {rects.map(({ cell, key, fill, x, y, w, h, label }) => (
        <g key={key}>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            rx={Math.min(CELL_RADIUS, w / 2, h / 2)}
            fill={fill}
            style={{ cursor: "pointer" }}
            onMouseEnter={(event) => handleHover(cell, event.currentTarget)}
            onClick={(event) => handleClick(cell, event)}
          />
          {label && (
            <text
              x={x + w / 2}
              y={y + h / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill={readableInk(fill, CELL_INKS)}
              style={{ ...textStyle, pointerEvents: "none" }}
            >
              {label}
            </text>
          )}
        </g>
      ))}

      {hovered && (
        <rect
          x={hovered.x}
          y={hovered.y}
          width={hovered.w}
          height={hovered.h}
          rx={Math.min(CELL_RADIUS, hovered.w / 2, hovered.h / 2)}
          fill="none"
          stroke={outlineInk}
          strokeWidth={2}
          pointerEvents="none"
        />
      )}
    </svg>
  );
}

function Legend({
  x,
  y,
  stops,
  min,
  max,
  ink,
  textStyle,
}: {
  x: number;
  y: number;
  stops: string[];
  min: string;
  max: string;
  ink: string;
  textStyle: { fontFamily: string; fontSize: number };
}) {
  const gradientId = "tabular-heatmap-legend";
  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          {stops.map((stop, index) => (
            <stop
              key={index}
              offset={`${(index / (stops.length - 1)) * 100}%`}
              stopColor={stop}
            />
          ))}
        </linearGradient>
      </defs>
      <rect
        x={x}
        y={y}
        width={LEGEND_BAR_WIDTH}
        height={LEGEND_BAR_HEIGHT}
        rx={LEGEND_BAR_HEIGHT / 2}
        fill={`url(#${gradientId})`}
      />
      <text
        x={x}
        y={y + LEGEND_BAR_HEIGHT + 4}
        textAnchor="start"
        dominantBaseline="hanging"
        fill={ink}
        style={textStyle}
      >
        {min}
      </text>
      <text
        x={x + LEGEND_BAR_WIDTH}
        y={y + LEGEND_BAR_HEIGHT + 4}
        textAnchor="end"
        dominantBaseline="hanging"
        fill={ink}
        style={textStyle}
      >
        {max}
      </text>
    </g>
  );
}
