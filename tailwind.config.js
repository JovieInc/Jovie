/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './packages/ui/**/*.{ts,tsx}',
  ],
  darkMode: ['class'],
  theme: {
    extend: {},
  },
  plugins: [],
};
