/**
 * Dashboard Card System Tokens
 *
 * Linear-inspired card system using OKLCH design tokens.
 * These tokens ensure consistent styling for surfaces, borders,
 * radii, shadows, and padding across all dashboard components.
 *
 * Design principles (from Linear):
 * 1. Surface hierarchy for depth (0-3 levels)
 * 2. Subtle shadows that respect light/dark modes
 * 3. Smooth micro-interactions with spring easing
 * 4. Perceptually uniform colors via OKLCH
 */

// Animation tokens - Linear-style timing
const timing = {
  fast: 'duration-150',
  normal: 'duration-200',
  slow: 'duration-300',
  easing: 'ease-[cubic-bezier(0.16,1,0.3,1)]', // Linear's signature easing
} as const;

/** Collapse multi-line template class strings into a single line. */
function tw(strings: TemplateStringsArray, ...values: unknown[]): string {
  return String.raw({ raw: strings }, ...values)
    .replaceAll(/\s+/g, ' ')
    .trim();
}

export const cardTokens = {
  // Base card styles - Linear-inspired sophistication
  base: `bg-surface-1 border border-subtle rounded-xl transition-all ${timing.slow} ${timing.easing}`,

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
    subtle: 'shadow-[var(--shadow-sm)]',
    default: 'shadow-[var(--shadow-md)]',
    medium: 'shadow-[var(--shadow-lg)]',
    large: 'shadow-[var(--shadow-xl)]',
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
      hover:shadow-[var(--shadow-lg)]
      hover:-translate-y-0.5
      transition-all ${timing.normal} ${timing.easing}
    `,

    active: tw`
      active:bg-[var(--color-bg-surface-3)]
      active:shadow-[var(--shadow-sm)]
      active:translate-y-0
      active:scale-[0.99]
    `,

    focus: tw`
      focus-visible:outline-none
      focus-visible:ring-2
      focus-visible:ring-[var(--color-accent)]
      focus-visible:ring-offset-2
      focus-visible:ring-offset-[var(--color-bg-base)]
    `,
  },

  // Glass effects for modern UI depth
  glass: {
    subtle: 'backdrop-blur-sm bg-[var(--color-bg-surface-1)]/80',
    medium: 'backdrop-blur-md bg-[var(--color-bg-surface-1)]/70',
    strong: 'backdrop-blur-lg bg-[var(--color-bg-surface-1)]/60',
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
      bg-[var(--color-bg-surface-1)]
      border border-[var(--color-border-subtle)]
      rounded-xl
      p-4 sm:p-6
      shadow-[var(--shadow-sm)]
      transition-all ${timing.slow} ${timing.easing}
    `,

    // Interactive clickable card - full hover effects, responsive padding
    interactive: tw`
      bg-[var(--color-bg-surface-1)]
      border border-[var(--color-border-subtle)]
      rounded-xl
      p-4 sm:p-6
      shadow-[var(--shadow-sm)]
      cursor-pointer
      transition-all ${timing.normal} ${timing.easing}
      hover:bg-[var(--color-bg-surface-2)]
      hover:border-[var(--color-border-default)]
      hover:shadow-[var(--shadow-lg)]
      hover:-translate-y-1
      active:translate-y-0
      active:shadow-[var(--shadow-md)]
      focus-visible:outline-none
      focus-visible:ring-2
      focus-visible:ring-[var(--color-accent)]
      focus-visible:ring-offset-2
    `,

    // Settings card - elevated surface, no hover effects (Linear-style)
    settings: tw`
      bg-[var(--color-bg-surface-2)]
      border border-[var(--color-border-subtle)]
      rounded-lg
      px-4 py-3 sm:px-5 sm:py-3.5
    `,

    // Analytics/metric card - minimal, data-focused
    analytics: tw`
      bg-[var(--color-bg-surface-1)]
      border border-[var(--color-border-subtle)]
      rounded-xl
      p-5
      transition-colors ${timing.fast} ${timing.easing}
      hover:border-[var(--color-border-default)]
    `,

    // Empty state card - centered content, responsive padding
    'empty-state': tw`
      bg-[var(--color-bg-surface-1)]
      border border-[var(--color-border-subtle)]
      rounded-xl
      p-6 sm:p-8
      text-center
      shadow-[var(--shadow-sm)]
    `,

    // Elevated card - stands out with stronger border, responsive padding
    elevated: tw`
      bg-[var(--color-bg-surface-1)]
      border border-[var(--color-border-default)]
      rounded-xl
      p-4 sm:p-6
      shadow-[var(--shadow-sm)]
      transition-all ${timing.slow} ${timing.easing}
      hover:shadow-[var(--shadow-md)]
    `,

    // Floating card - modal-like presence, responsive padding
    floating: tw`
      bg-[var(--color-bg-surface-1)]
      border border-[var(--color-border-default)]
      rounded-xl
      p-4 sm:p-6
      shadow-[var(--shadow-xl)]
      backdrop-blur-lg
      transition-all ${timing.slow} ${timing.easing}
    `,

    // Onboarding card - gradient border effect, responsive padding
    onboarding: tw`
      relative
      bg-[var(--color-bg-surface-1)]
      rounded-2xl
      p-4 sm:p-6
      shadow-[var(--shadow-lg)]
      ring-1
      ring-[var(--color-border-subtle)]
      transition-all ${timing.slow} ${timing.easing}
    `,

    // Feature card - for showcasing features, responsive padding
    feature: tw`
      bg-[var(--color-bg-surface-1)]
      border border-[var(--color-border-subtle)]
      rounded-2xl
      p-6 sm:p-8
      shadow-[var(--shadow-sm)]
      transition-all ${timing.slow} ${timing.easing}
      hover:shadow-[var(--shadow-md)]
      hover:border-[var(--color-accent-subtle)]
    `,

    // Compact card - for dense layouts
    compact: tw`
      bg-[var(--color-bg-surface-1)]
      border border-[var(--color-border-subtle)]
      rounded-lg
      p-4
      transition-all ${timing.fast} ${timing.easing}
    `,

    // Ghost card - minimal, no background
    ghost: tw`
      rounded-xl
      p-6
      transition-all ${timing.normal} ${timing.easing}
      hover:bg-[var(--color-interactive-hover)]
    `,
  },
} as const;

// Type exports for TypeScript consumers
export type CardPadding = keyof typeof cardTokens.padding;
export type CardRadius = keyof typeof cardTokens.radius;
export type CardShadow = keyof typeof cardTokens.shadow;
export type CardBorder = keyof typeof cardTokens.border;
export type CardVariant = keyof typeof cardTokens.variants;
export type CardStatus = keyof typeof cardTokens.status;
