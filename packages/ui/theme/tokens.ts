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
// Now with additional levels matching Linear's ~8 dark surface stops
// ============================================
export const surfaces = {
  base: 'var(--color-bg-base)',
  'surface-0': 'var(--color-bg-surface-0)',
  'surface-1': 'var(--color-bg-surface-1)',
  'surface-2': 'var(--color-bg-surface-2)',
  'surface-3': 'var(--color-bg-surface-3)',
  page: 'var(--color-bg-page)',
  hover: 'var(--color-bg-hover)',
  elevated: 'var(--color-bg-elevated)',
  input: 'var(--color-bg-input)',
  active: 'var(--color-bg-active)',
  button: 'var(--color-bg-button)',
  tooltip: 'var(--color-bg-tooltip)',
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
  tooltip: 'var(--color-text-tooltip)',
} as const;

// ============================================
// BORDER COLORS
// ============================================
export const borders = {
  subtle: 'var(--color-border-subtle)',
  default: 'var(--color-border-default)',
  strong: 'var(--color-border-strong)',
  focus: 'var(--color-border-focus)',
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
  destructive: {
    bg: 'var(--color-btn-destructive-bg)',
    fg: 'var(--color-btn-destructive-fg)',
  },
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
  card: 'var(--shadow-card)',
  cardElevated: 'var(--shadow-card-elevated)',
  divider: 'var(--shadow-divider)',
  buttonInset: 'var(--shadow-button-inset)',
} as const;

// ============================================
// BORDER RADIUS (values emitted from apps/web/design/tokens.json)
// ============================================
export const radii = {
  none: 'var(--radius-none)', // 0
  xs: 'var(--radius-xs)', // 2px
  sm: 'var(--radius-sm)', // 8px
  md: 'var(--radius-md)', // 10px
  default: 'var(--radius-default)', // 4px
  lg: 'var(--radius-lg)', // 12px
  xl: 'var(--radius-xl)', // 16px
  '2xl': 'var(--radius-2xl)', // 20px
  '3xl': 'var(--radius-3xl)', // 24px
  pill: 'var(--radius-pill)', // CSS saturation; used arc depends on visible size
  full: 'var(--radius-full)', // CSS saturation; not a measured 9999px arc
} as const;

/**
 * Semantic pairs for circular corners with a uniform border-box inset.
 * Count border and padding once between outer and inner border edges.
 * Adjacent surfaces and uncontained children are not concentric; use these
 * aliases only when the shared owner establishes that geometry.
 */
export const concentricRadii = {
  card: {
    outer: 'var(--system-b-radius-card)',
    inner: 'var(--system-b-radius-card-inner)',
    inset: 'var(--space-1)',
  },
  overlay: {
    outer: 'var(--system-b-radius-overlay)',
    inner: 'var(--system-b-radius-overlay-inner)',
    inset: 'var(--space-1)',
  },
  panel: {
    outer: 'var(--system-b-radius-panel)',
    inner: 'var(--system-b-radius-panel-inner)',
    inset: 'var(--space-1)',
  },
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
  fontBody: 'var(--font-body)',
  fontDisplay: 'var(--font-display)',
  fontMono: 'var(--font-mono)',
  fontFeatures: 'var(--font-features)',
  roles: {
    display: {
      family: 'Satoshi',
      token: 'var(--font-display)',
      use: 'Large editorial display only',
    },
    body: {
      family: 'Inter',
      token: 'var(--font-body)',
      use: 'Body copy and long-form reading',
    },
    interface: {
      family: 'Inter',
      token: 'var(--font-sans)',
      use: 'Controls, labels, navigation, and data',
    },
  },
  size: {
    '2xs': 'var(--text-2xs)', // 12px — small step (consolidated 2026-09-27)
    xs: 'var(--text-xs)', // 12px
    app: 'var(--text-app)', // 12px — app default (consolidated 2026-09-27)
    sm: 'var(--text-sm)', // 14px
    base: 'var(--text-base)', // 16px
    lg: 'var(--text-lg)', // 16px (display ladder)
    xl: 'var(--text-xl)', // 20px
    '2xl': 'var(--text-2xl)', // 24px
    '3xl': 'var(--text-3xl)', // 32px
    '4xl': 'var(--text-4xl)', // 40px
    '5xl': 'var(--text-5xl)', // 48px
  },
  weight: {
    normal: 'var(--font-weight-normal)', // 400
    book: 'var(--font-weight-book)', // 450 — Linear's UI default!
    medium: 'var(--font-weight-medium)', // 510
    semibold: 'var(--font-weight-semibold)', // 590 — Linear-specific
    bold: 'var(--font-weight-bold)', // 680 — Linear-specific
    heavy: 'var(--font-weight-heavy)', // 680 — matches bold today
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
    instant: 'var(--duration-instant)',
    fast: 'var(--duration-fast)',
    normal: 'var(--duration-normal)', // 150ms — THE Linear standard
    slow: 'var(--duration-slow)',
    slower: 'var(--duration-slower)',
    slowest: 'var(--duration-slowest)',
  },
  easing: {
    out: 'var(--ease-out)',
    inOut: 'var(--ease-in-out)',
    spring: 'var(--ease-spring)',
    linear: 'var(--ease-linear)',
  },
  // Pre-composed transitions (extracted from Linear's 33 unique transition rules)
  transition: {
    colors: 'var(--transition-colors)',
    bg: 'var(--transition-bg)',
    opacity: 'var(--transition-opacity)',
    opacityFast: 'var(--transition-opacity-fast)',
    fill: 'var(--transition-fill)',
    transform: 'var(--transition-transform)',
    collapse: 'var(--transition-collapse)',
    shadow: 'var(--transition-shadow)',
  },
} as const;

// ============================================
// JOVIE COLOR ALIASES (canonical loading-state fills)
// ============================================
export const JovieColor = {
  surface0: surfaces['surface-0'],
  surface1: surfaces['surface-1'],
  surface2: surfaces['surface-2'],
  skeletonBase: 'var(--color-skeleton-base)',
  skeletonShimmer: 'var(--color-skeleton-shimmer)',
} as const;
