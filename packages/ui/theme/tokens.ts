/**
 * Jovie Design Tokens
 *
 * These tokens reference CSS custom properties defined in design-system.css
 * using OKLCH color space for perceptual uniformity (Linear-inspired).
 *
 * Core principles:
 * 1. Only 3 theme inputs (base hue, accent hue, contrast)
 * 2. All colors derived from those inputs
 * 3. Perceptually uniform via OKLCH
 */

// ============================================
// SURFACE COLORS (Layered elevation)
// ============================================
export const surfaces = {
  base: 'var(--color-bg-base)',
  'surface-0': 'var(--color-bg-surface-0)',
  'surface-1': 'var(--color-bg-surface-1)',
  'surface-2': 'var(--color-bg-surface-2)',
  'surface-3': 'var(--color-bg-surface-3)',
} as const;

// ============================================
// TEXT COLORS (Semantic hierarchy)
// ============================================
export const text = {
  primary: 'var(--color-text-primary-token)',
  secondary: 'var(--color-text-secondary-token)',
  tertiary: 'var(--color-text-tertiary-token)',
  quaternary: 'var(--color-text-quaternary-token)',
  disabled: 'var(--color-text-disabled-token)',
} as const;

// ============================================
// BORDER COLORS
// ============================================
export const borders = {
  subtle: 'var(--color-border-subtle)',
  default: 'var(--color-border-default)',
  strong: 'var(--color-border-strong)',
} as const;

// ============================================
// ACCENT COLORS
// ============================================
export const accent = {
  base: 'var(--color-accent)',
  hover: 'var(--color-accent-hover)',
  active: 'var(--color-accent-active)',
  subtle: 'var(--color-accent-subtle)',
  foreground: 'var(--color-accent-foreground)',
} as const;

// ============================================
// BUTTON COLORS
// ============================================
export const buttons = {
  primary: {
    bg: 'var(--color-btn-primary-bg)',
    fg: 'var(--color-btn-primary-fg)',
    hover: 'var(--color-btn-primary-hover)',
  },
  secondary: {
    bg: 'var(--color-btn-secondary-bg)',
    fg: 'var(--color-btn-secondary-fg)',
    hover: 'var(--color-btn-secondary-hover)',
  },
} as const;

// ============================================
// INTERACTIVE STATES
// ============================================
export const interactive = {
  hover: 'var(--color-interactive-hover)',
  active: 'var(--color-interactive-active)',
} as const;

// ============================================
// STATUS COLORS
// ============================================
export const status = {
  success: {
    base: 'var(--color-success)',
    subtle: 'var(--color-success-subtle)',
    foreground: 'var(--color-success-foreground)',
  },
  warning: {
    base: 'var(--color-warning)',
    subtle: 'var(--color-warning-subtle)',
    foreground: 'var(--color-warning-foreground)',
  },
  error: {
    base: 'var(--color-error)',
    subtle: 'var(--color-error-subtle)',
    foreground: 'var(--color-error-foreground)',
  },
  info: {
    base: 'var(--color-info)',
    subtle: 'var(--color-info-subtle)',
    foreground: 'var(--color-info-foreground)',
  },
} as const;

// ============================================
// FEATURE ACCENT COLORS
// ============================================
export const featureAccents = {
  conversion: 'var(--accent-conv)',
  analytics: 'var(--accent-analytics)',
  speed: 'var(--accent-speed)',
  beauty: 'var(--accent-beauty)',
  seo: 'var(--accent-seo)',
  links: 'var(--accent-links)',
  pro: 'var(--accent-pro)',
} as const;

// ============================================
// SIDEBAR COLORS (RGB triplets for alpha)
// ============================================
export const sidebar = {
  background: 'rgb(var(--sidebar-background))',
  foreground: 'rgb(var(--sidebar-foreground))',
  primary: 'rgb(var(--sidebar-primary))',
  primaryForeground: 'rgb(var(--sidebar-primary-foreground))',
  accent: 'rgb(var(--sidebar-accent))',
  accentForeground: 'rgb(var(--sidebar-accent-foreground))',
  border: 'rgb(var(--sidebar-border))',
  ring: 'rgb(var(--sidebar-ring))',
  muted: 'rgb(var(--sidebar-muted))',
  mutedForeground: 'rgb(var(--sidebar-muted-foreground))',
  surface: 'rgb(var(--sidebar-surface))',
  surfaceHover: 'rgb(var(--sidebar-surface-hover))',
  inputBackground: 'rgb(var(--sidebar-input-background))',
  inputBorder: 'rgb(var(--sidebar-input-border))',
} as const;

// ============================================
// SHADOWS
// ============================================
export const shadows = {
  sm: 'var(--shadow-sm)',
  md: 'var(--shadow-md)',
  lg: 'var(--shadow-lg)',
  xl: 'var(--shadow-xl)',
} as const;

// ============================================
// BORDER RADIUS
// ============================================
export const radii = {
  none: 'var(--radius-none)',
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  xl: 'var(--radius-xl)',
  '2xl': 'var(--radius-2xl)',
  full: 'var(--radius-full)',
} as const;

// ============================================
// SPACING (8px grid system)
// ============================================
export const spacing = {
  0: 'var(--space-0)',
  px: 'var(--space-px)',
  0.5: 'var(--space-0-5)',
  1: 'var(--space-1)',
  1.5: 'var(--space-1-5)',
  2: 'var(--space-2)',
  2.5: 'var(--space-2-5)',
  3: 'var(--space-3)',
  4: 'var(--space-4)',
  5: 'var(--space-5)',
  6: 'var(--space-6)',
  8: 'var(--space-8)',
  10: 'var(--space-10)',
  12: 'var(--space-12)',
  16: 'var(--space-16)',
  20: 'var(--space-20)',
  24: 'var(--space-24)',
} as const;

// ============================================
// TYPOGRAPHY
// ============================================
export const typography = {
  fontSans: 'var(--font-sans)',
  fontMono: 'var(--font-mono)',
  fontFeatures: 'var(--font-features)',
  size: {
    xs: 'var(--text-xs)',
    sm: 'var(--text-sm)',
    base: 'var(--text-base)',
    lg: 'var(--text-lg)',
    xl: 'var(--text-xl)',
    '2xl': 'var(--text-2xl)',
    '3xl': 'var(--text-3xl)',
    '4xl': 'var(--text-4xl)',
    '5xl': 'var(--text-5xl)',
  },
  leading: {
    none: 'var(--leading-none)',
    tight: 'var(--leading-tight)',
    snug: 'var(--leading-snug)',
    normal: 'var(--leading-normal)',
    relaxed: 'var(--leading-relaxed)',
  },
  tracking: {
    tighter: 'var(--tracking-tighter)',
    tight: 'var(--tracking-tight)',
    normal: 'var(--tracking-normal)',
    wide: 'var(--tracking-wide)',
  },
} as const;

// ============================================
// ANIMATION
// ============================================
export const animation = {
  duration: {
    fast: 'var(--duration-fast)',
    normal: 'var(--duration-normal)',
    slow: 'var(--duration-slow)',
    slower: 'var(--duration-slower)',
  },
  easing: {
    out: 'var(--ease-out)',
    inOut: 'var(--ease-in-out)',
    spring: 'var(--ease-spring)',
  },
} as const;
