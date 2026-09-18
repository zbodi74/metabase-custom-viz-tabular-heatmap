# Tabular heatmap

A Metabase custom visualization: a row × column grid of cells coloured by a
single measure, with a gradient legend and a drill-through-aware tooltip.

Built with [`@metabase/custom-viz`](https://www.npmjs.com/package/@metabase/custom-viz)
`2.0.0-canary.1`, targeting Metabase `>=1.64 <1.66`.

![A four-row by five-column heatmap of revenue by product category and traffic
source. Cells run from pale blue at the low end to near-black blue at the high
end, each labelled with its value. One cell is hovered, showing a tooltip with
the segment name, both dimensions, the value and two detail
columns.](docs/images/heatmap-basic.png)

Two dimensions, one measure, a tooltip title and two tooltip detail columns.
The Gizmo × Twitter combination is absent from the results, so its cell is
empty rather than the row being one cell short.

![A ten-row by ten-column heatmap of revenue by shipping state and campaign.
Column labels are rotated 45 degrees below the grid. Several cells are blank
where the combination has no data.](docs/images/heatmap-dense.png)

A denser, sparser grid. Column labels rotate once they stop fitting under
their column, and the gutter widens to keep the leftmost one on the canvas.

## Data shape

| Role | Setting | Notes |
| --- | --- | --- |
| Row dimension | **Row** | Distinct values become rows, in order of first appearance |
| Column dimension | **Column** | Distinct values become columns, same ordering |
| Measure | **Value** | Numeric; drives the cell colour. Honours the column formatting popover |
| Tooltip title | **Tooltip title** | Optional; shown as the first tooltip row |
| Tooltip detail | **Tooltip details** | Optional, any number of columns, appended to the tooltip |

Only the first three are required. Extra columns in the result are ignored
unless you add them as tooltip details, so the query is not restricted to
exactly three columns the way the Table pivot toggle is.

### Full matrix, not just the rows present

Every row value × column value combination gets a cell. Combinations missing
from the results render empty, so gaps read as gaps rather than silently
collapsing the grid.

If the same (row, column) pair appears more than once, **the first result row
wins**. A heatmap can only show one number per cell, and aggregating on the
visualization's behalf would be wrong for a measure that is already an average
or a ratio.

`checkRenderable` refuses to draw more than 10,000 cells (`MAX_CELLS`), which
is the point where the grid stops being readable and starts being slow.

## Colour

The ramp is sequential — a single hue with monotone lightness — derived at
run time from `renderingContext.getColor("brand")`, so it follows whitelabel
colours instead of hard-coding a palette.

Light and dark mode use separately chosen anchors rather than one being an
automatic flip of the other (`ANCHORS` in `src/color.ts`). Sampled at nine
steps, both clear the ordinal-ramp checks: monotone lightness, adjacent
ΔL ≥ 0.06, and the surface-facing end at ≥ 2:1 contrast against the card
background.

Cell labels use plain black or white, whichever reads better on that cell.
Metabase's own text colours are translucent `hsla()`, and flattened onto a
mid-ramp fill they bottom out at about 4.3:1 — under the 4.5:1 floor for 12px
text. Black and white clear it across the whole ramp (worst case 4.6:1, at the
value where the two swap over). Axis labels and the legend, which sit on the
card surface rather than on a fill, use the theme's `text-secondary`.

## Layout notes

Two things here are less obvious than they look:

- **The root `<svg>` is `display: block`.** An inline SVG sits on the text
  baseline, so its container ends up a few pixels taller than the SVG itself.
  Metabase measures the container and feeds the result back as the `height`
  prop, so that gap compounds on every render — the chart grew from 1030px to
  1084px and pushed its own axis out of view before this was fixed.
- **Rotated column labels widen the left gutter.** A label rotated -45° hangs
  down and to the left of its column, so the leftmost one runs off the canvas
  unless the gutter reserves room for the overhang. Labels are truncated only
  when the band or the left edge genuinely does not allow the full string
  (capped at 35% of the chart width, so long labels cannot crowd out the cells).

Cell values print exactly when they fit and fall back to the abbreviated form
when they do not, so `$3,845` is never rounded to `$4k` where there was room to
be precise. The same rule sizes the legend's end labels.

## Build

```
npm install
npm run build      # -> dist/index.js, then "Tabular heatmap-<version>.tgz"
npm run type-check
```

Upload the `.tgz` under **Admin → Settings → Custom visualizations**.

`scripts/deploy.sh` does the same over the API, registering the plugin on the
first run and replacing the bundle in place afterwards — so the plugin id, and
any questions already using it, keep working:

```
export METABASE_URL=https://your-metabase
export METABASE_API_KEY=mb_...        # an admin API key
./scripts/deploy.sh
```

## Limitations inherited from the platform

Custom visualizations only render for a signed-in viewer. Public links, guest
embeds, dashboard subscriptions and static exports all fall back to the default
visualization for the query's data shape. Authenticated modular embeds need the
name allowlisted: `allowedCustomVisualizations: ["custom:Tabular heatmap"]`.

The sandbox blocks network access, storage and most browser APIs, so everything
the chart draws comes from `series` and `settings`.

## License

MIT — see [LICENSE](LICENSE).
