/**
 * Dashboard Card System Tokens
 *
 * This file defines the standardized tokens for dashboard card components
 * across the application. These tokens ensure consistent styling for
 * surfaces, borders, radii, shadows, and padding.
 */

export const cardTokens = {
  // Base card styles - Linear-inspired sophistication
  base: 'bg-surface-1 border border-subtle rounded-xl transition-all duration-300 ease-out',

  // Padding variations with mathematical consistency
  padding: {
    default: 'p-6',
    large: 'p-8',
    compact: 'p-4',
    micro: 'p-3',
  },

  // Border radius variations - Linear-style precision
  radius: {
    default: 'rounded-xl',
    small: 'rounded-lg',
    large: 'rounded-2xl',
    minimal: 'rounded-md',
  },

  // Enhanced shadow system for dark mode depth
  shadow: {
    none: 'shadow-none',
    subtle: 'shadow-sm shadow-black/5 dark:shadow-black/20',
    default: 'shadow-md shadow-black/8 dark:shadow-black/25',
    medium: 'shadow-lg shadow-black/10 dark:shadow-black/30',
    large: 'shadow-xl shadow-black/12 dark:shadow-black/35',
    floating: 'shadow-2xl shadow-black/15 dark:shadow-black/40',
  },

  // Sophisticated border system
  border: {
    none: 'border-0',
    subtle: 'border border-subtle',
    default: 'border border-default',
    strong: 'border border-strong',
    interactive: 'border border-interactive',
  },

  // Interactive states - Linear-inspired responsiveness
  interactive: {
    hover:
      'hover:bg-surface-2 hover:border-interactive hover:shadow-lg hover:shadow-black/10 dark:hover:shadow-black/30 hover:ring-1 hover:ring-interactive/20 transform hover:-translate-y-0.5',
    active:
      'active:bg-surface-3 active:shadow-inner active:transform active:translate-y-0',
    focus:
      'focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
  },

  // Glass effects for modern UI depth
  glass: {
    subtle: 'backdrop-blur-sm bg-glass-subtle',
    medium: 'backdrop-blur-md bg-glass-medium',
    strong: 'backdrop-blur-lg bg-glass-strong',
  },

  // Enhanced variant compositions with Linear-level sophistication
  variants: {
    default:
      'bg-surface-1 border border-subtle rounded-xl p-6 shadow-sm shadow-black/5 dark:shadow-black/20 hover:shadow-md hover:shadow-black/8 dark:hover:shadow-black/25 transition-all duration-300 ease-out',

    interactive:
      'bg-surface-1 backdrop-blur-sm rounded-xl border border-subtle p-6 text-left shadow-sm shadow-black/5 dark:shadow-black/20 hover:shadow-xl hover:shadow-black/12 dark:hover:shadow-black/35 hover:ring-1 hover:ring-interactive/20 hover:border-interactive hover:bg-surface-2 transition-all duration-300 ease-out group transform hover:-translate-y-1 cursor-pointer',

    settings:
      'bg-surface-1 border border-subtle rounded-xl p-6 shadow-sm shadow-black/5 dark:shadow-black/20 hover:shadow-md hover:shadow-black/8 dark:hover:shadow-black/25 transition-all duration-300 ease-out',

    analytics:
      'rounded-xl border border-foreground/8 bg-surface-1 p-5 hover:border-foreground/12 transition-colors duration-150 ease-out',

    'empty-state':
      'bg-surface-1 border border-subtle rounded-xl p-8 text-center relative overflow-hidden shadow-sm shadow-black/5 dark:shadow-black/20',

    elevated:
      'bg-surface-2 border border-default rounded-xl p-6 shadow-md shadow-black/8 dark:shadow-black/25 hover:shadow-lg hover:shadow-black/10 dark:hover:shadow-black/30 transition-all duration-300 ease-out',

    floating:
      'bg-surface-1 backdrop-blur-lg border border-default rounded-xl p-6 shadow-xl shadow-black/12 dark:shadow-black/35 hover:shadow-2xl hover:shadow-black/15 dark:hover:shadow-black/40 transition-all duration-300 ease-out',

    onboarding:
      'relative bg-surface-1 rounded-2xl p-6 shadow-lg shadow-black/8 dark:shadow-black/30 transition-all duration-300 ease-out before:absolute before:inset-0 before:rounded-2xl before:p-[1px] before:bg-gradient-to-br before:from-black/10 before:via-black/5 before:to-transparent dark:before:from-white/20 dark:before:via-white/5 before:-z-10 after:absolute after:inset-[1px] after:rounded-[15px] after:bg-surface-1 after:-z-10 ring-1 ring-black/10 dark:ring-white/5',
  },
};
