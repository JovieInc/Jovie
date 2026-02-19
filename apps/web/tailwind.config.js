/**
 * 🔒 CRITICAL CONFIGURATION - DO NOT MODIFY
 *
 * This Tailwind CSS v4 configuration is LOCKED.
 *
 * ❌ DO NOT CHANGE:
 * - File extension (must be .js, not .ts or .mjs)
 * - module.exports format (not ES6 exports)
 * - Content array paths
 * - Core structure
 *
 * ⚠️  CHANGING THIS WILL BREAK THE ENTIRE BUILD
 *
 * If you modify this file, run: pnpm tailwind:check
 * to verify the configuration is still valid.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './packages/ui/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // Font weights - Inter variable font precise weights (Linear-extracted)
      fontWeight: {
        normal: 'var(--font-weight-normal)', // 400
        book: 'var(--font-weight-book)', // 450 — Linear's UI default
        medium: 'var(--font-weight-medium)', // 500
        semibold: 'var(--font-weight-semibold)', // 538 — Linear-specific
        bold: 'var(--font-weight-bold)', // 590 — Linear-specific
        heavy: 'var(--font-weight-heavy)', // 700
        // Legacy linear-prefixed aliases
        'linear-normal': 'var(--linear-font-weight-normal)',
        'linear-medium': 'var(--linear-font-weight-medium)',
        'linear-semibold': 'var(--linear-font-weight-semibold)',
        'linear-bold': 'var(--linear-font-weight-bold)',
      },

      // Font sizes - including Linear's 13px app UI size
      fontSize: {
        '2xs': ['var(--text-2xs)', { lineHeight: '1.25' }], // 11px
        app: ['var(--text-app)', { lineHeight: '1.4' }], // 13px — Linear's default
      },

      // Linear spacing tokens
      spacing: {
        'linear-1': 'var(--linear-space-1)',
        'linear-2': 'var(--linear-space-2)',
        'linear-3': 'var(--linear-space-3)',
        'linear-4': 'var(--linear-space-4)',
        'linear-6': 'var(--linear-space-6)',
        'linear-8': 'var(--linear-space-8)',
      },

      // Border radius - Linear-extracted values
      borderRadius: {
        xs: 'var(--radius-xs)', // 3px — tags, tiny elements
        DEFAULT: 'var(--radius-default)', // 6px — buttons, dropdowns
        xl: 'var(--radius-xl)', // 10px — large cards
        '3xl': 'var(--radius-3xl)', // 14px — large modals
        pill: 'var(--radius-pill)', // 48px — pill buttons
        // Legacy linear-prefixed aliases
        'linear-sm': 'var(--linear-radius-sm)',
        'linear-md': 'var(--linear-radius-md)',
        'linear-lg': 'var(--linear-radius-lg)',
      },

      // Linear max-width for containers
      maxWidth: {
        'linear-container': 'var(--linear-container-max)',
        'linear-content': 'var(--linear-content-max)',
        'linear-hero': 'var(--linear-hero-section-max)',
        'linear-pricing': 'var(--linear-pricing-grid-max)',
      },

      // Tier 1: Design token colors - auto-generates text-*, bg-*, border-* utilities
      colors: {
        // Primary text tokens
        'primary-token': 'var(--color-text-primary-token)',
        'secondary-token': 'var(--color-text-secondary-token)',
        'tertiary-token': 'var(--color-text-tertiary-token)',
        'quaternary-token': 'var(--color-text-quaternary-token)',

        // Accent colors
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'accent-active': 'var(--color-accent-active)',
        'accent-subtle': 'var(--color-accent-subtle)',

        // Semantic status colors (destructive = error alias for shadcn compatibility)
        destructive: 'var(--color-error)',
        error: 'var(--color-error)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        info: 'var(--color-info)',

        // Surface backgrounds (generates bg-surface-0, bg-surface-1, etc.)
        surface: {
          0: 'var(--color-bg-surface-0)',
          1: 'var(--color-bg-surface-1)',
          2: 'var(--color-bg-surface-2)',
          3: 'var(--color-bg-surface-3)',
          page: 'var(--color-bg-page)',
          hover: 'var(--color-bg-hover)',
          elevated: 'var(--color-bg-elevated)',
          input: 'var(--color-bg-input)',
          active: 'var(--color-bg-active)',
          button: 'var(--color-bg-button)',
        },

        // Base colors
        base: 'var(--color-bg-base)',

        // Button colors
        'btn-primary': 'var(--color-btn-primary-bg)',
        'btn-primary-foreground': 'var(--color-btn-primary-fg)',
        'btn-secondary': 'var(--color-btn-secondary-bg)',
        'btn-secondary-foreground': 'var(--color-btn-secondary-fg)',

        // Brand/DSP colors
        'brand-spotify': 'var(--color-brand-spotify)',
        'brand-spotify-hover': 'var(--color-brand-spotify-hover)',
        'brand-spotify-subtle': 'var(--color-brand-spotify-subtle)',
        'brand-apple': 'var(--color-brand-apple)',
        'brand-apple-hover': 'var(--color-brand-apple-hover)',
        'brand-apple-subtle': 'var(--color-brand-apple-subtle)',
        'brand-youtube': 'var(--color-brand-youtube)',
        'brand-youtube-hover': 'var(--color-brand-youtube-hover)',
        'brand-youtube-subtle': 'var(--color-brand-youtube-subtle)',
        'brand-soundcloud': 'var(--color-brand-soundcloud)',
        'brand-soundcloud-hover': 'var(--color-brand-soundcloud-hover)',
        'brand-soundcloud-subtle': 'var(--color-brand-soundcloud-subtle)',
        'brand-tidal': 'var(--color-brand-tidal)',
        'brand-tidal-hover': 'var(--color-brand-tidal-hover)',
        'brand-tidal-subtle': 'var(--color-brand-tidal-subtle)',
        'brand-amazon': 'var(--color-brand-amazon)',
        'brand-amazon-hover': 'var(--color-brand-amazon-hover)',
        'brand-amazon-subtle': 'var(--color-brand-amazon-subtle)',
        'brand-deezer': 'var(--color-brand-deezer)',
        'brand-deezer-hover': 'var(--color-brand-deezer-hover)',
        'brand-deezer-subtle': 'var(--color-brand-deezer-subtle)',
        'brand-pandora': 'var(--color-brand-pandora)',
        'brand-pandora-hover': 'var(--color-brand-pandora-hover)',
        'brand-pandora-subtle': 'var(--color-brand-pandora-subtle)',
        'brand-audiomack': 'var(--color-brand-audiomack)',
        'brand-audiomack-hover': 'var(--color-brand-audiomack-hover)',
        'brand-audiomack-subtle': 'var(--color-brand-audiomack-subtle)',
      },

      // Border colors with better naming (avoids border-border-subtle)
      borderColor: {
        subtle: 'var(--color-border-subtle)',
        default: 'var(--color-border-default)',
        strong: 'var(--color-border-strong)',
        accent: 'var(--color-accent)',
        success: 'var(--color-success)',
        error: 'var(--color-error)',
        warning: 'var(--color-warning)',
        info: 'var(--color-info)',
      },

      // Background colors for semantic states
      backgroundColor: {
        'success-subtle': 'var(--color-success-subtle)',
        'error-subtle': 'var(--color-error-subtle)',
        'warning-subtle': 'var(--color-warning-subtle)',
        'info-subtle': 'var(--color-info-subtle)',
        'interactive-hover': 'var(--color-interactive-hover)',
        'interactive-active': 'var(--color-interactive-active)',
        'cell-hover': 'var(--color-cell-hover)',
      },

      // Box shadows - Linear-extracted tokens
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-elevated': 'var(--shadow-card-elevated)',
        divider: 'var(--shadow-divider)',
        'button-inset': 'var(--shadow-button-inset)',
      },

      // Transition duration - Linear's precise timing
      transitionDuration: {
        instant: 'var(--duration-instant)', // 50ms
        fast: 'var(--duration-fast)', // 100ms
        normal: 'var(--duration-normal)', // 150ms — THE standard
        slow: 'var(--duration-slow)', // 200ms
        slower: 'var(--duration-slower)', // 250ms
        slowest: 'var(--duration-slowest)', // 300ms
      },

      // Ring colors (for focus rings)
      ringColor: {
        accent: 'var(--color-accent)',
        success: 'var(--color-success)',
        error: 'var(--color-error)',
        warning: 'var(--color-warning)',
        info: 'var(--color-info)',
      },
    },
  },
  plugins: [require('./lib/tailwind/utilities-plugin.js')],
};
