/**
 * Tailwind v4 Utilities Plugin
 *
 * Contains ONLY mechanical utilities that cannot be expressed via theme.extend:
 * - Safe area inset utilities (iOS device support)
 * - Scrollbar hiding (cross-browser)
 * - Grid backgrounds (complex patterns)
 *
 * All color/spacing tokens are in tailwind.config.js theme.extend.
 * All component styles are in globals.css @layer components or React components.
 */

const plugin = require('tailwindcss/plugin');

module.exports = plugin(function ({ addUtilities, matchUtilities, theme }) {
  // ============================================
  // SAFE AREA INSET UTILITIES (iOS devices)
  // ============================================

  const safeAreaMappings = {
    pt: { property: 'paddingTop', inset: 'top' },
    pr: { property: 'paddingRight', inset: 'right' },
    pb: { property: 'paddingBottom', inset: 'bottom' },
    pl: { property: 'paddingLeft', inset: 'left' },
    top: { property: 'top', inset: 'top' },
    right: { property: 'right', inset: 'right' },
    bottom: { property: 'bottom', inset: 'bottom' },
    left: { property: 'left', inset: 'left' },
  };

  // Base safe-area utilities (pt-safe, pb-safe, etc.)
  Object.entries(safeAreaMappings).forEach(([key, { property, inset }]) => {
    addUtilities({
      [`.${key}-safe`]: {
        [property]: `env(safe-area-inset-${inset})`,
      },
    });
  });

  // Spacing variants (pt-4-safe, etc.) using matchUtilities
  // Generate from safeAreaMappings to reduce duplication
  const spacingVariants = Object.entries(safeAreaMappings).reduce(
    (acc, [key, { property, inset }]) => {
      acc[`${key}-safe`] = value => ({
        [property]: `calc(env(safe-area-inset-${inset}) + ${value})`,
      });
      return acc;
    },
    {}
  );

  matchUtilities(spacingVariants, { values: theme('spacing') });

  // ============================================
  // SCROLLBAR HIDING (cross-browser)
  // ============================================

  addUtilities({
    '.scrollbar-hide': {
      '-ms-overflow-style': 'none',
      'scrollbar-width': 'none',
      '&::-webkit-scrollbar': {
        display: 'none',
      },
    },
  });

  // ============================================
  // GRID BACKGROUNDS (complex patterns)
  // ============================================

  addUtilities({
    '.grid-bg': {
      backgroundImage:
        'linear-gradient(rgba(0, 0, 0, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.02) 1px, transparent 1px)',
      backgroundSize: '50px 50px',
    },
    '.grid-bg-dark': {
      backgroundImage:
        'linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)',
      backgroundSize: '50px 50px',
    },
  });
});
