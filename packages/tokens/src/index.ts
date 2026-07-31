/**
 * One source of truth for design decisions, consumed two ways.
 *
 * Web reads these as CSS custom properties (tokens.css); native reads the
 * objects directly. A colour defined once here cannot drift between platforms.
 *
 * ── The system ───────────────────────────────────────────────────────────────
 * RelayFlow is an operational console. QSTP staff live in it all day, so the
 * interface is near-monochrome and information-dense: colour is a signal, not
 * decoration, and anything coloured should mean something.
 *
 * That gives two separate colour jobs, kept deliberately apart:
 *
 *   accent   Qatar maroon. Interactive things — links, focus rings, primary
 *            actions. Deep and desaturated so it never reads as an alarm.
 *   status   A louder, independent ramp for state: conflict, overdue, healthy.
 *
 * Collapsing those two into one hue is what makes consoles unreadable — every
 * button starts looking like an error.
 */

export const palette = {
  /**
   * Slate neutrals carry ~95% of the interface. Defined in OKLCH so the
   * lightness steps are perceptually even, which matters when six greys sit
   * next to each other in a dense table.
   */
  neutral: {
    0: 'oklch(1 0 0)',
    25: 'oklch(0.992 0.001 265)',
    50: 'oklch(0.984 0.002 265)',
    100: 'oklch(0.968 0.003 265)',
    150: 'oklch(0.948 0.004 265)',
    200: 'oklch(0.925 0.005 265)',
    300: 'oklch(0.871 0.007 265)',
    400: 'oklch(0.708 0.011 265)',
    500: 'oklch(0.556 0.013 265)',
    600: 'oklch(0.452 0.013 265)',
    700: 'oklch(0.372 0.012 265)',
    800: 'oklch(0.279 0.011 265)',
    850: 'oklch(0.234 0.010 265)',
    900: 'oklch(0.197 0.009 265)',
    950: 'oklch(0.155 0.008 265)',
    1000: 'oklch(0.118 0.007 265)',
  },

  /** Qatar Foundation maroon, worked into a usable ramp. */
  maroon: {
    50: 'oklch(0.965 0.015 12)',
    100: 'oklch(0.925 0.035 12)',
    200: 'oklch(0.855 0.065 12)',
    300: 'oklch(0.745 0.105 12)',
    400: 'oklch(0.625 0.140 12)',
    500: 'oklch(0.512 0.152 12)',
    600: 'oklch(0.448 0.145 12)',
    700: 'oklch(0.385 0.125 12)',
    800: 'oklch(0.315 0.098 12)',
    900: 'oklch(0.255 0.072 12)',
  },

  /**
   * Status ramp. Each hue is only ever used for its meaning:
   *   critical  a conflict or a hard failure — someone must intervene
   *   warning   a deadline at risk, an override, a low-confidence value
   *   positive  confirmed, verified, healthy
   *   info      in progress, awaiting someone else
   */
  critical: {
    subtle: 'oklch(0.955 0.022 27)',
    base: 'oklch(0.585 0.205 27)',
    strong: 'oklch(0.485 0.185 27)',
    onSubtle: 'oklch(0.395 0.155 27)',
  },
  warning: {
    subtle: 'oklch(0.965 0.035 78)',
    base: 'oklch(0.735 0.155 68)',
    strong: 'oklch(0.605 0.135 62)',
    onSubtle: 'oklch(0.455 0.098 58)',
  },
  positive: {
    subtle: 'oklch(0.958 0.028 155)',
    base: 'oklch(0.615 0.135 155)',
    strong: 'oklch(0.515 0.115 155)',
    onSubtle: 'oklch(0.405 0.092 155)',
  },
  info: {
    subtle: 'oklch(0.958 0.025 245)',
    base: 'oklch(0.605 0.135 245)',
    strong: 'oklch(0.512 0.125 245)',
    onSubtle: 'oklch(0.412 0.105 245)',
  },
} as const;

/**
 * A 4px scale, but a console spends most of its time in the 4–12px range —
 * hence the extra low steps. Numbers, so native can use them unconverted.
 */
export const space = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/** Tight radii. Large rounding reads as consumer software and wastes pixels. */
export const radius = {
  none: 0,
  sm: 3,
  md: 5,
  lg: 7,
  xl: 10,
  full: 9999,
} as const;

/**
 * Type ramp anchored at 13px rather than 16px.
 *
 * This is the single most characteristic decision of a dense console: body copy
 * is small, line height is tight, and the hierarchy is carried by weight and
 * colour rather than by size. Anything below 12px is reserved for non-essential
 * metadata and never for values a decision depends on.
 */
export const fontSize = {
  '2xs': 10,
  xs: 11,
  sm: 12,
  base: 13,
  md: 14,
  lg: 16,
  xl: 19,
  '2xl': 23,
  '3xl': 28,
} as const;

export const lineHeight = {
  tight: 1.2,
  snug: 1.35,
  normal: 1.5,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/**
 * Semantic roles. Components reference these, never the raw palette — so a
 * rebrand is a change here rather than a sweep through every component.
 */
export const semantic = {
  light: {
    background: palette.neutral[50],
    surface: palette.neutral[0],
    surfaceSunken: palette.neutral[100],
    surfaceHover: palette.neutral[100],
    border: palette.neutral[200],
    borderStrong: palette.neutral[300],
    textPrimary: palette.neutral[900],
    textSecondary: palette.neutral[600],
    textMuted: palette.neutral[500],
    textInverse: palette.neutral[0],
    accent: palette.maroon[500],
    accentHover: palette.maroon[600],
    accentSubtle: palette.maroon[50],
    accentText: palette.neutral[0],
    critical: palette.critical.base,
    criticalSubtle: palette.critical.subtle,
    criticalText: palette.critical.onSubtle,
    warning: palette.warning.base,
    warningSubtle: palette.warning.subtle,
    warningText: palette.warning.onSubtle,
    positive: palette.positive.base,
    positiveSubtle: palette.positive.subtle,
    positiveText: palette.positive.onSubtle,
    info: palette.info.base,
    infoSubtle: palette.info.subtle,
    infoText: palette.info.onSubtle,
  },
  dark: {
    background: palette.neutral[1000],
    surface: palette.neutral[950],
    surfaceSunken: palette.neutral[1000],
    surfaceHover: palette.neutral[900],
    border: palette.neutral[850],
    borderStrong: palette.neutral[800],
    textPrimary: palette.neutral[100],
    textSecondary: palette.neutral[400],
    textMuted: palette.neutral[500],
    textInverse: palette.neutral[1000],
    accent: palette.maroon[400],
    accentHover: palette.maroon[300],
    accentSubtle: palette.maroon[900],
    accentText: palette.neutral[0],
    critical: 'oklch(0.685 0.185 27)',
    criticalSubtle: 'oklch(0.275 0.075 27)',
    criticalText: 'oklch(0.845 0.105 27)',
    warning: 'oklch(0.785 0.145 72)',
    warningSubtle: 'oklch(0.285 0.065 68)',
    warningText: 'oklch(0.865 0.095 78)',
    positive: 'oklch(0.705 0.135 155)',
    positiveSubtle: 'oklch(0.265 0.062 155)',
    positiveText: 'oklch(0.845 0.098 155)',
    info: 'oklch(0.695 0.125 245)',
    infoSubtle: 'oklch(0.265 0.062 245)',
    infoText: 'oklch(0.845 0.085 245)',
  },
} as const;

export type ColorScheme = keyof typeof semantic;
export type SemanticColor = keyof typeof semantic.light;

/**
 * The palette as consumers see it. Widened from the `as const` literals above
 * so light and dark are the same type — a component styled for one must
 * typecheck against the other.
 */
export type SemanticColors = Record<SemanticColor, string>;

/**
 * Resolves a platform's colour-scheme signal to a palette. React Native's
 * `useColorScheme()` returns null or 'unspecified' when it does not know, and
 * CSS media queries can be absent — all of which mean light, not a crash.
 */
export function colorsFor(scheme: string | null | undefined): SemanticColors {
  return scheme === 'dark' ? semantic.dark : semantic.light;
}

/** Status vocabulary shared by web and native badges, dots and rows. */
export const STATUS_TONES = ['neutral', 'info', 'positive', 'warning', 'critical'] as const;
export type StatusTone = (typeof STATUS_TONES)[number];
