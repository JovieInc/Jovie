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
    extend: {},
  },
  plugins: [],
};