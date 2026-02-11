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
      // Linear font weights - Inter variable font precise weights
      fontWeight: {
        'linear-normal': 'var(--linear-font-weight-normal)',
        'linear-medium': 'var(--linear-font-weight-medium)',
        'linear-semibold': 'var(--linear-font-weight-semibold)',
        'linear-bold': 'var(--linear-font-weight-bold)',
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

      // Linear border radius
      borderRadius: {
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
