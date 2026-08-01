/**
 * One source of truth for design decisions, consumed two ways.
 *
 * Web reads these as CSS custom properties (tokens.css); native reads the
 * objects directly. A colour defined once here cannot drift between platforms.
 *
 * ── The system ───────────────────────────────────────────────────────────────
 * RelayFlow is an operational console. QSTP staff live in it all day, so the
 * interface is near-monochrome: colour is a signal, not decoration, and
 * anything coloured should mean something.
 *
 * That gives two separate colour jobs, kept deliberately apart:
 *
 *   accent   Violet. Interactive things — links, focus rings, primary actions,
 *            the selected item in a menu. Never used for state.
 *   status   A louder, independent ramp for state: conflict, overdue, healthy.
 *
 * Collapsing those two into one hue is what makes consoles unreadable — every
 * button starts looking like an error.
 *
 * One palette serves all three portals. QSTP staff, startup owners and
 * candidates see the same components in the same colours; what differs between
 * the portals is the density and the shape of the navigation, not the system.
 */

export const palette = {
  /**
   * Slate neutrals carry ~95% of the interface. Defined in OKLCH so the
   * lightness steps are perceptually even, which matters when six greys sit
   * next to each other in a dense table. The light end is warmed a few degrees
   * toward the brand hue so a white card on the page background reads as two
   * surfaces rather than as a printing error.
   */
  neutral: {
    0: 'oklch(1 0 0)',
    25: 'oklch(0.993 0.004 301)',
    50: 'oklch(0.985 0.007 304)',
    100: 'oklch(0.972 0.007 295)',
    150: 'oklch(0.962 0.007 277)',
    200: 'oklch(0.938 0.009 280)',
    300: 'oklch(0.887 0.014 277)',
    400: 'oklch(0.744 0.023 268)',
    500: 'oklch(0.551 0.023 264)',
    600: 'oklch(0.453 0.028 267)',
    700: 'oklch(0.395 0.032 268)',
    800: 'oklch(0.312 0.034 270)',
    850: 'oklch(0.273 0.038 271)',
    900: 'oklch(0.226 0.034 271)',
    950: 'oklch(0.195 0.031 272)',
    1000: 'oklch(0.162 0.039 281)',
  },

  /** The brand violet, worked into a usable ramp. */
  brand: {
    50: 'oklch(0.970 0.015 299)',
    100: 'oklch(0.950 0.026 298)',
    200: 'oklch(0.886 0.057 298)',
    300: 'oklch(0.782 0.111 297)',
    400: 'oklch(0.667 0.172 294)',
    500: 'oklch(0.565 0.228 291)',
    600: 'oklch(0.514 0.232 289)',
    700: 'oklch(0.463 0.221 287)',
    800: 'oklch(0.390 0.182 287)',
    900: 'oklch(0.297 0.125 288)',
  },

  /**
   * Status ramp. Each hue is only ever used for its meaning:
   *   critical  a conflict or a hard failure — someone must intervene
   *   warning   a deadline at risk, an override, a low-confidence value
   *   positive  confirmed, verified, healthy
   *   info      in progress, awaiting someone else
   */
  critical: {
    subtle: 'oklch(0.964 0.016 13)',
    base: 'oklch(0.594 0.223 25)',
    strong: 'oklch(0.518 0.200 26)',
    onSubtle: 'oklch(0.467 0.181 26)',
  },
  warning: {
    subtle: 'oklch(0.963 0.022 63)',
    base: 'oklch(0.722 0.180 53)',
    strong: 'oklch(0.629 0.161 51)',
    onSubtle: 'oklch(0.505 0.126 53)',
  },
  positive: {
    subtle: 'oklch(0.953 0.016 161)',
    base: 'oklch(0.581 0.144 153)',
    strong: 'oklch(0.501 0.124 153)',
    onSubtle: 'oklch(0.434 0.106 154)',
  },
  info: {
    subtle: 'oklch(0.949 0.024 288)',
    base: 'oklch(0.564 0.222 263)',
    strong: 'oklch(0.476 0.194 263)',
    onSubtle: 'oklch(0.425 0.164 263)',
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

/**
 * Radii.
 *
 * `md` is the control radius — buttons, inputs, menu items — and `xl` is the
 * card radius. Those two carry almost everything, and keeping them two clear
 * steps apart is what stops a button pasted into a card looking like a smaller
 * card.
 */
export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 10,
  xl: 14,
  full: 9999,
} as const;

/**
 * Type ramp anchored at 14px.
 *
 * Hierarchy is carried by weight and colour rather than by size — there are
 * only three steps between body copy and a page title. Anything below 12px is
 * reserved for non-essential metadata and never for a value a decision depends
 * on, which is why the ramp stops there.
 */
export const fontSize = {
  '2xs': 11,
  xs: 12,
  sm: 13,
  base: 14,
  md: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
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
    // Hover is the brand at its faintest rather than a grey, so hovering a row
    // and selecting it are the same colour at two strengths.
    surfaceHover: palette.brand[50],
    border: palette.neutral[150],
    borderStrong: palette.neutral[200],
    textPrimary: palette.neutral[1000],
    textSecondary: palette.neutral[700],
    textMuted: palette.neutral[500],
    textInverse: palette.neutral[0],
    accent: palette.brand[500],
    accentHover: palette.brand[600],
    accentSubtle: palette.brand[50],
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
    accent: palette.brand[400],
    accentHover: palette.brand[300],
    accentSubtle: palette.brand[900],
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
