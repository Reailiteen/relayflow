/**
 * One source of truth for design decisions, consumed two ways.
 *
 * Web reads these as CSS custom properties (tokens.css, generated from this
 * file's values); native reads the objects directly. A colour defined once here
 * cannot drift between platforms, which is the failure the audit called out as
 * "documentation inconsistency" — two apps slowly becoming different products.
 */

export const palette = {
  // Neutrals carry most of the interface; they are defined in OKLCH so that
  // lightness steps are perceptually even rather than merely numerically even.
  neutral: {
    0: 'oklch(1 0 0)',
    50: 'oklch(0.985 0.002 250)',
    100: 'oklch(0.967 0.003 250)',
    200: 'oklch(0.925 0.005 250)',
    300: 'oklch(0.87 0.007 250)',
    400: 'oklch(0.708 0.01 250)',
    500: 'oklch(0.556 0.012 250)',
    600: 'oklch(0.44 0.012 250)',
    700: 'oklch(0.37 0.011 250)',
    800: 'oklch(0.27 0.01 250)',
    900: 'oklch(0.21 0.009 250)',
    950: 'oklch(0.145 0.008 250)',
  },
  brand: {
    100: 'oklch(0.93 0.05 255)',
    300: 'oklch(0.78 0.12 255)',
    500: 'oklch(0.62 0.18 255)',
    700: 'oklch(0.48 0.16 255)',
    900: 'oklch(0.34 0.12 255)',
  },
  positive: { 500: 'oklch(0.65 0.16 150)' },
  caution: { 500: 'oklch(0.78 0.15 85)' },
  critical: { 500: 'oklch(0.58 0.2 27)' },
} as const;

/** A 4px base scale. Values are numbers so native can use them unconverted. */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/**
 * Semantic roles. Components reference these, never the raw palette — so a
 * rebrand is a change here, not a sweep through every component.
 */
export const semantic = {
  light: {
    background: palette.neutral[0],
    surface: palette.neutral[50],
    surfaceRaised: palette.neutral[0],
    border: palette.neutral[200],
    textPrimary: palette.neutral[900],
    textSecondary: palette.neutral[600],
    textInverse: palette.neutral[0],
    accent: palette.brand[500],
    accentText: palette.neutral[0],
    positive: palette.positive[500],
    caution: palette.caution[500],
    critical: palette.critical[500],
  },
  dark: {
    background: palette.neutral[950],
    surface: palette.neutral[900],
    surfaceRaised: palette.neutral[800],
    border: palette.neutral[800],
    textPrimary: palette.neutral[50],
    textSecondary: palette.neutral[400],
    textInverse: palette.neutral[950],
    accent: palette.brand[300],
    accentText: palette.neutral[950],
    positive: palette.positive[500],
    caution: palette.caution[500],
    critical: palette.critical[500],
  },
} as const;

export type ColorScheme = keyof typeof semantic;
export type SemanticColor = keyof typeof semantic.light;

/**
 * The palette as consumers see it. Widened from the `as const` literals above
 * so that light and dark are the same type — a component styled for one must
 * typecheck against the other.
 */
export type SemanticColors = Record<SemanticColor, string>;

/**
 * Resolves a platform's colour-scheme signal to a palette. React Native's
 * `useColorScheme()` can return null or 'unspecified', and CSS media queries
 * can be absent — every one of those means "we do not know", which resolves to
 * light rather than to a crash.
 */
export function colorsFor(scheme: string | null | undefined): SemanticColors {
  return scheme === 'dark' ? semantic.dark : semantic.light;
}
