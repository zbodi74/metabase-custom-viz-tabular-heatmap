/**
 * Sequential colour ramp for the heatmap, derived at runtime from the
 * instance's brand colour so the chart follows whitelabelling and dark mode.
 *
 * The ramp is single-hue with monotone OKLCH lightness — the shape a sequential
 * (magnitude) scale is supposed to have. The light/dark anchors below were
 * chosen so the ramp clears the ordinal palette checks in both modes:
 * monotone lightness, adjacent ΔL >= 0.06 over nine sampled steps, and the
 * surface-facing end at >= 2:1 contrast against the card background.
 */

type Oklch = { L: number; C: number; H: number };
type Rgb = [number, number, number];
/** A colour plus its alpha — Metabase's ink colours are alpha-based hsla(). */
type Rgba = { rgb: Rgb; alpha: number };

const srgbToLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

const linearToSrgb = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function hslToRgb(h: number, s: number, l: number): Rgb {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1
      ? [chroma, x, 0]
      : hp < 2
        ? [x, chroma, 0]
        : hp < 3
          ? [0, chroma, x]
          : hp < 4
            ? [0, x, chroma]
            : hp < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const m = l - chroma / 2;
  return [r + m, g + m, b + m];
}

function parseColor(input: string): Rgba | null {
  const value = input.trim();

  const fn = value.match(
    /^(rgb|hsl)a?\(\s*([\d.-]+)(?:deg)?[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?(?:[\s,/]+([\d.]+)%?)?\s*\)$/i,
  );
  if (fn) {
    const [, kind, a, b, c, rawAlpha] = fn;
    const alpha = rawAlpha === undefined ? 1 : Number(rawAlpha);
    const rgb: Rgb =
      kind.toLowerCase() === "hsl"
        ? hslToRgb(Number(a), Number(b) / 100, Number(c) / 100)
        : [Number(a) / 255, Number(b) / 255, Number(c) / 255];
    return { rgb, alpha: clamp01(alpha) };
  }

  const hex = value.replace("#", "");
  const expanded =
    hex.length === 3 || hex.length === 4
      ? hex
          .slice(0, 3)
          .split("")
          .map((c) => c + c)
          .join("")
      : hex.slice(0, 6);

  if (!/^[0-9a-f]{6}$/i.test(expanded)) {
    return null;
  }

  const n = parseInt(expanded, 16);
  const alpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return {
    rgb: [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255],
    alpha,
  };
}

function rgbToHex([r, g, b]: Rgb): string {
  const part = (v: number) =>
    Math.round(clamp01(v) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function rgbToOklab([r, g, b]: Rgb): [number, number, number] {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);

  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]: [number, number, number]): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

/** Largest in-gamut chroma at this lightness/hue, so light ends don't clip. */
function oklchToHex({ L, C, H }: Oklch): string {
  const h = (H * Math.PI) / 180;
  const at = (chroma: number) =>
    oklabToRgb([L, chroma * Math.cos(h), chroma * Math.sin(h)]);

  let chroma = C;
  if (!inGamut(at(C))) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(at(mid))) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    chroma = lo;
  }

  return rgbToHex(at(chroma));
}

function hexToOklch(color: string): Oklch {
  const rgb = parseColor(color)?.rgb ?? [0.31, 0.62, 0.89];
  const [L, a, b] = rgbToOklab(rgb);
  return {
    L,
    C: Math.hypot(a, b),
    H: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
  };
}

const ANCHORS = {
  // light mode: low values pale, high values deep
  light: { L0: 0.765, L1: 0.265, C0: 0.3, C1: 1.0 },
  // dark mode: the ramp flips so high values glow against the dark surface
  dark: { L0: 0.42, L1: 0.91, C0: 0.34, C1: 0.72 },
} as const;

export type ColorScheme = "light" | "dark";

export type Ramp = {
  /** Colour for a normalised position in [0, 1]. */
  at: (t: number) => string;
  /** Evenly spaced samples, used for the legend gradient. */
  stops: string[];
};

export function createRamp(brand: string, scheme: ColorScheme): Ramp {
  const { C, H } = hexToOklch(brand);
  const anchors = ANCHORS[scheme];
  const chroma = Math.max(C, 0.12);

  const at = (t: number) => {
    const u = clamp01(Number.isFinite(t) ? t : 0);
    return oklchToHex({
      L: anchors.L0 + (anchors.L1 - anchors.L0) * u,
      C: chroma * (anchors.C0 + (anchors.C1 - anchors.C0) * u),
      H,
    });
  };

  const stops = Array.from({ length: 9 }, (_, i) => at(i / 8));

  return { at, stops };
}

function relativeLuminance([r, g, b]: Rgb): number {
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (hi + 0.05) / (lo + 0.05);
}

export function contrast(a: string, b: string): number {
  return contrastRatio(
    parseColor(a)?.rgb ?? [0, 0, 0],
    parseColor(b)?.rgb ?? [0, 0, 0],
  );
}

/** Flatten a translucent colour onto an opaque one. */
function composite(front: Rgba, back: Rgb): Rgb {
  return back.map(
    (channel, i) => front.rgb[i] * front.alpha + channel * (1 - front.alpha),
  ) as Rgb;
}

/**
 * Pick whichever ink reads better on a given cell fill.
 *
 * Metabase's text colours are translucent (`hsla(…, 0.84)`), so the ratio that
 * matters is the one after the ink is flattened onto the cell, not the ink's
 * own colour.
 */
export function readableInk(background: string, inks: string[]): string {
  const backRgb = parseColor(background)?.rgb ?? [1, 1, 1];

  let best = inks[0];
  let bestRatio = -Infinity;

  for (const ink of inks) {
    const parsed = parseColor(ink);
    if (!parsed) {
      continue;
    }
    const ratio = contrastRatio(composite(parsed, backRgb), backRgb);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = ink;
    }
  }

  return best;
}
