import type {
  Column,
  CreateCustomVisualization,
  Series,
} from "@metabase/custom-viz";
import { defineConfig } from "@metabase/custom-viz";

import { MAX_CELLS, Visualization } from "./Visualization";
import {
  buildModel,
  dimensionColumns,
  findColumn,
  measureColumns,
} from "./model";
import type { Settings } from "./types";

const columnsOf = (series: Series) => series[0]?.data.cols ?? [];

const asOptions = (cols: Column[]) =>
  cols.map((col) => ({ name: col.display_name, value: col.name }));

const isKnownColumn = (series: Series, name: string | null | undefined) =>
  findColumn(columnsOf(series), name) !== null;

const createVisualization: CreateCustomVisualization<Settings> = ({
  defineSetting,
}) => {
  return defineConfig<Settings>({
    getName: () => "Tabular heatmap",
    minSize: { width: 4, height: 4 },
    defaultSize: { width: 9, height: 7 },
    canSavePng: true,

    checkRenderable(series, settings) {
      if (series.length !== 1) {
        throw new Error("Tabular heatmap can only show a single series.");
      }

      const cols = columnsOf(series);
      if (cols.length < 3) {
        throw new Error(
          "Tabular heatmap needs at least three columns: two to group by and one to measure.",
        );
      }

      if (!settings.rowColumn || !settings.colColumn || !settings.valueColumn) {
        throw new Error(
          "Pick a row, a column and a value in the settings sidebar.",
        );
      }

      if (settings.rowColumn === settings.colColumn) {
        throw new Error("Rows and columns have to use two different fields.");
      }

      const model = buildModel(series, settings);
      if (!model) {
        throw new Error(`No numeric values to plot in ${settings.valueColumn}.`);
      }

      const cellCount = model.rowValues.length * model.colValues.length;
      if (cellCount > MAX_CELLS) {
        throw new Error(
          `This would draw ${cellCount.toLocaleString()} cells. Group by fewer values — the limit is ${MAX_CELLS.toLocaleString()}.`,
        );
      }
    },

    settings: {
      rowColumn: defineSetting({
        id: "rowColumn",
        title: "Row",
        getSection: () => "Data",
        index: 0,
        widget: "field",
        isValid: (series, settings) =>
          isKnownColumn(series, settings.rowColumn),
        getDefault: (series) => dimensionColumns(columnsOf(series))[0]?.name,
        getProps: (series) => ({
          columns: columnsOf(series),
          options: asOptions(dimensionColumns(columnsOf(series))),
        }),
        persistDefault: true,
      }),

      colColumn: defineSetting({
        id: "colColumn",
        title: "Column",
        getSection: () => "Data",
        index: 1,
        widget: "field",
        readDependencies: ["rowColumn"],
        isValid: (series, settings) =>
          isKnownColumn(series, settings.colColumn) &&
          settings.colColumn !== settings.rowColumn,
        getDefault: (series, settings) => {
          const candidates = dimensionColumns(columnsOf(series));
          return (
            candidates.find((col) => col.name !== settings.rowColumn)?.name ??
            candidates[1]?.name
          );
        },
        getProps: (series) => ({
          columns: columnsOf(series),
          options: asOptions(dimensionColumns(columnsOf(series))),
        }),
        persistDefault: true,
      }),

      valueColumn: defineSetting({
        id: "valueColumn",
        title: "Value",
        getSection: () => "Data",
        index: 2,
        widget: "field",
        isValid: (series, settings) =>
          isKnownColumn(series, settings.valueColumn),
        getDefault: (series) => measureColumns(columnsOf(series))[0]?.name,
        getProps: (series) => ({
          columns: columnsOf(series),
          options: asOptions(measureColumns(columnsOf(series))),
          showColumnSetting: true,
        }),
        persistDefault: true,
      }),

      titleColumn: defineSetting({
        id: "titleColumn",
        title: "Tooltip title",
        getSection: () => "Data",
        group: "Tooltip",
        index: 3,
        widget: "field",
        isValid: (series, settings) =>
          settings.titleColumn == null ||
          isKnownColumn(series, settings.titleColumn),
        getDefault: () => null,
        getProps: (series) => ({
          columns: columnsOf(series),
          options: asOptions(columnsOf(series)),
        }),
      }),

      detailColumns: defineSetting({
        id: "detailColumns",
        title: "Tooltip details",
        getSection: () => "Data",
        group: "Tooltip",
        index: 4,
        widget: "fields",
        isValid: (series, settings) =>
          (settings.detailColumns ?? []).every((name) =>
            isKnownColumn(series, name),
          ),
        getDefault: () => [],
        getProps: (series) => ({
          columns: columnsOf(series),
          options: asOptions(columnsOf(series)),
          addAnother: "Add a field",
        }),
      }),

      showValues: defineSetting({
        id: "showValues",
        title: "Show values in cells",
        getSection: () => "Display",
        index: 0,
        inline: true,
        widget: "toggle",
        getDefault: () => true,
      }),

      showLegend: defineSetting({
        id: "showLegend",
        title: "Show color legend",
        getSection: () => "Display",
        index: 1,
        inline: true,
        widget: "toggle",
        getDefault: () => true,
      }),
    },

    VisualizationComponent: Visualization,
  });
};

export default createVisualization;
