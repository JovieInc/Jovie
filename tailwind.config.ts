/* eslint-disable import/no-unresolved */

import forms from '@tailwindcss/forms';
import lineClamp from '@tailwindcss/line-clamp';
import typography from '@tailwindcss/typography';
import type { Config } from 'tailwindcss';
import { colors, radii, shadows, spacing } from './packages/ui/theme/tokens';

/* eslint-enable import/no-unresolved */

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './packages/ui/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors,
      borderRadius: radii,
      spacing,
      boxShadow: shadows,
    },
  },
  plugins: [typography, forms, lineClamp],
};

export default config;
