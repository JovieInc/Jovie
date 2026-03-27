import { contentSurfaceCardVariants } from '@/components/molecules/ContentSurfaceCard';

/**
 * Dashboard Card System Tokens
 *
 * Linear-inspired card system using OKLCH design tokens.
 * These tokens ensure consistent styling for surfaces, borders,
 * radii, shadows, and padding across all dashboard components.
 *
 * Design principles (from Linear):
 * 1. Cards sit on one consistent subtle elevation tier across light and dark.
 * 2. Separation comes from a thin seam border plus a single low-depth shadow.
 * 3. Hover uses bg/border changes only — cards do not jump tiers on hover.
 * 4. Stronger shadows are still reserved for popovers/dropdowns only.
 */

// Animation tokens - Linear-style timing
const timing = {
  fast: 'duration-fast',
  normal: 'duration-normal',
  slow: 'duration-slow',
  easing: 'ease-interactive', // Linear's signature easing
} as const;

/** Collapse multi-line template class strings into a single line. */
function tw(strings: TemplateStringsArray, ...values: unknown[]): string {
  return String.raw({ raw: strings }, ...values)
    .replaceAll(/\s+/g, ' ')
    .trim();
}

export const cardTokens = {
  // Base card styles - Linear-inspired sophistication
  base: `${contentSurfaceCardVariants()} transition-[background-color,border-color] ${timing.slow} ${timing.easing}`,

  // Padding variations (8px grid system) - mobile-first responsive
  padding: {
    none: 'p-0',
    micro: 'p-2 sm:p-3', // 8px -> 12px
    compact: 'p-3 sm:p-4', // 12px -> 16px
    default: 'p-4 sm:p-6', // 16px -> 24px
    large: 'p-5 sm:p-8', // 20px -> 32px
    spacious: 'p-6 sm:p-10', // 24px -> 40px
  },

  // Border radius variations - Linear-style precision
  radius: {
    none: 'rounded-none',
    minimal: 'rounded-md', // 6px
    small: 'rounded-lg', // 8px
    default: 'rounded-xl', // 12px
    large: 'rounded-2xl', // 16px
    full: 'rounded-full',
  },

  // Enhanced shadow system - respects OKLCH-based dark mode
  // Using semantic shadow variables defined in design-system.css
  shadow: {
    none: 'shadow-none',
    subtle: 'shadow-sm',
    default: 'shadow-md',
    medium: 'shadow-lg',
    large: 'shadow-xl',
  },

  // Sophisticated border system using design tokens
  border: {
    none: 'border-0',
    subtle: 'border border-[var(--color-border-subtle)]',
    default: 'border border-[var(--color-border-default)]',
    strong: 'border border-[var(--color-border-strong)]',
    accent: 'border border-[var(--color-accent)]',
  },

  // Interactive states - Linear-inspired responsiveness
  interactive: {
    hover: tw`
      hover:bg-[var(--color-bg-surface-2)]
      hover:border-[var(--color-border-default)]
      transition-all ${timing.normal} ${timing.easing}
    `,

    active: tw`
      active:bg-[var(--color-bg-surface-3)]
    `,

    focus: tw`
      focus-visible:outline-none
      focus-visible:ring-2
      focus-visible:ring-[var(--color-accent)]
      focus-visible:ring-offset-2
      focus-visible:ring-offset-[var(--color-bg-base)]
    `,
  },

  // Glass effects — reserved for sticky headers/toolbars only (not content cards)
  glass: {
    subtle: 'backdrop-blur-sm bg-(--linear-app-content-surface)/80',
    medium: 'backdrop-blur-md bg-(--linear-app-content-surface)/70',
    strong: 'backdrop-blur-lg bg-(--linear-app-content-surface)/60',
  },

  // Status variants for feedback
  status: {
    success: 'border-[var(--color-success)] bg-[var(--color-success-subtle)]',
    warning: 'border-[var(--color-warning)] bg-[var(--color-warning-subtle)]',
    error: 'border-[var(--color-error)] bg-[var(--color-error-subtle)]',
    info: 'border-[var(--color-info)] bg-[var(--color-info-subtle)]',
  },

  // Enhanced variant compositions with Linear-level sophistication
  variants: {
    // Default static card - responsive padding
    default: tw`
      bg-surface-1
    `,

    // Interactive clickable card - flat Linear-style (bg change only, no shadow/transform animation)
    interactive: tw`
      bg-surface-1
      cursor-pointer
      transition-[background-color,border-color] ${timing.normal} ${timing.easing}
      hover:bg-surface-0
      hover:border-default
      focus-visible:outline-none
      focus-visible:ring-2
      focus-visible:ring-(--linear-border-focus)
      focus-visible:ring-offset-2
    `,

    // Settings card - elevated surface, no hover effects (Linear-style)
    settings: tw`
      bg-surface-1
    `,

    // Analytics/metric card - minimal, data-focused
    analytics: tw`
      bg-surface-1
      transition-[background-color,border-color] ${timing.fast} ${timing.easing}
      hover:bg-surface-0
      hover:border-default
    `,

    // Empty state card - centered content, responsive padding
    'empty-state': tw`
      bg-surface-1
      text-center
    `,

    // Elevated card — flat (same surface as parent, border only)
    elevated: tw`
      bg-(--linear-app-content-surface)
      border border-(--linear-app-frame-seam)
      rounded-xl
      p-4 sm:p-6
      transition-[background-color,border-color] ${timing.slow} ${timing.easing}
    `,

    // Floating card — flat with border (shadow only for actual modals/popovers)
    floating: tw`
      bg-(--linear-app-content-surface)
      border border-(--linear-app-frame-seam)
      rounded-xl
      p-4 sm:p-6
      transition-[background-color,border-color] ${timing.slow} ${timing.easing}
    `,

    // Onboarding card — flat with border
    onboarding: tw`
      relative
      bg-(--linear-app-content-surface)
      border border-(--linear-app-frame-seam)
      rounded-2xl
      transition-[background-color,border-color] ${timing.slow} ${timing.easing}
    `,

    // Feature card — flat with border
    feature: tw`
      bg-(--linear-app-content-surface)
      border border-(--linear-app-frame-seam)
      rounded-2xl
      p-6 sm:p-8
      transition-[background-color,border-color] ${timing.slow} ${timing.easing}
      hover:border-[var(--color-border-default)]
    `,

    // Compact card - for dense layouts
    compact: tw`
      bg-[var(--color-bg-surface-1)]
      rounded-lg
      p-4
      transition-[background-color,border-color]
    `,

    // Ghost card - minimal, no background
    ghost: tw`
      rounded-xl
      p-6
      transition-[background-color,border-color] ${timing.normal} ${timing.easing}
      hover:bg-[var(--color-interactive-hover)]
    `,
  },
} as const;

/**
 * Linear Surface Tokens
 *
 * Shared app-card system matching Linear.app — content cards sit on one
 * subtle elevation tier with a seam border and a low-depth shadow.
 * Sidebar and drawer cards sit one step above that so they read as
 * floating above the drawer/main content field, while popovers remain
 * the strongest floating surface.
 */
const elevatedSidebarCardShadow =
  'shadow-[0_12px_28px_rgba(15,23,42,0.08),0_2px_6px_rgba(15,23,42,0.05)]';

export const LINEAR_SURFACE = {
  /** Drawer section card — border-separated section inside sidebars. */
  drawerCard: `rounded-[10px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) ${elevatedSidebarCardShadow}`,

  /** Smaller drawer section card — inline property groups. */
  drawerCardSm: `rounded-[8px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) ${elevatedSidebarCardShadow}`,

  /** Primary sidebar card — header/analytics cards in sidebars. */
  sidebarCard: `rounded-[10px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) ${elevatedSidebarCardShadow}`,

  /** Content container — wraps tables, mobile lists, empty states. */
  contentContainer:
    'rounded-[10px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) shadow-[var(--linear-app-card-shadow)]',

  /** Banner/callout card. */
  bannerCard:
    'rounded-[10px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) shadow-[var(--linear-app-card-shadow)]',

  /** Dialog inner card — sections inside dialogs. */
  dialogCard:
    'rounded-[10px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) shadow-[var(--linear-app-card-shadow)]',

  /** Sticky header — toolbar-like headers with backdrop blur. */
  stickyHeader:
    'border-(--linear-app-frame-seam) bg-(--linear-app-content-surface)',

  /** Toolbar / popover / dropdown — same surface. */
  toolbar: 'border-(--linear-app-frame-seam) bg-(--linear-app-content-surface)',

  /** Popover container — the ONE surface that gets a shadow (floats above content). */
  popover:
    'rounded-[10px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-0 shadow-[0_8px_24px_rgba(0,0,0,0.08)]',
} as const;

export const LINEAR_SURFACE_TIER = {
  drawerCard: 2,
  drawerCardSm: 2,
  sidebarCard: 2,
  contentContainer: 1,
  bannerCard: 1,
  dialogCard: 1,
  stickyHeader: 1,
  toolbar: 1,
  popover: 3,
} as const;

// Type exports for TypeScript consumers
export type CardPadding = keyof typeof cardTokens.padding;
export type CardRadius = keyof typeof cardTokens.radius;
export type CardShadow = keyof typeof cardTokens.shadow;
export type CardBorder = keyof typeof cardTokens.border;
export type CardVariant = keyof typeof cardTokens.variants;
export type CardStatus = keyof typeof cardTokens.status;
export type LinearSurface = keyof typeof LINEAR_SURFACE;
export type LinearSurfaceTier =
  (typeof LINEAR_SURFACE_TIER)[keyof typeof LINEAR_SURFACE_TIER];
