// GENERATED FILE — do not edit. Source: apps/web/design/tokens.json. Rebuild: pnpm --filter @jovie/web run tokens:build
export const DESIGN_TOKENS = {
  "brand": {
    "$description": "Canonical monochrome colors for generated Jovie marks, wordmarks, lockups, and app icons. Product and marketing UI continue to use semantic color tokens.",
    "ink": "#08090a",
    "cream": "#F5F4F0"
  },
  "gray": {
    "1": "hsl(0, 0%, 99%)",
    "2": "hsl(0, 0%, 97.3%)",
    "3": "hsl(0, 0%, 95.1%)",
    "4": "hsl(0, 0%, 93%)",
    "5": "hsl(0, 0%, 90.9%)",
    "6": "hsl(0, 0%, 88.7%)",
    "7": "hsl(0, 0%, 85.8%)",
    "8": "hsl(0, 0%, 78%)",
    "9": "hsl(0, 0%, 56.1%)",
    "10": "hsl(0, 0%, 52.3%)",
    "11": "hsl(0, 0%, 43.5%)",
    "12": "hsl(0, 0%, 9%)",
    "$description": "Canonical 12-step gray scale documented in DESIGN.md. Previously defined only in public/pitch/colors_and_type.css, so var(--grayN) did not resolve in the app — the generated CSS fixes that."
  },
  "accent": {
    "$description": "System B accent palette rotation. Light values from :root, dark values from .dark in styles/design-system.css. These entries are the canonical statement for divergence checks; design-system.css remains the live emitter until the namespace-collapse wave.",
    "light": {
      "gray": "#7f7f85",
      "gray-subtle": "#efeff2",
      "blue": "#1f7bf5",
      "blue-subtle": "rgba(31, 123, 245, 0.12)",
      "purple": "#8e56f5",
      "purple-subtle": "rgba(142, 86, 245, 0.12)",
      "pink": "#f52bb5",
      "pink-subtle": "rgba(245, 43, 181, 0.12)",
      "red": "#f72a36",
      "red-subtle": "rgba(247, 42, 54, 0.12)",
      "orange": "#ff7800",
      "orange-subtle": "rgba(255, 120, 0, 0.12)",
      "green": "#3ffa8b",
      "green-subtle": "rgba(63, 250, 139, 0.12)",
      "teal": "#3ffa8b",
      "teal-subtle": "rgba(63, 250, 139, 0.12)"
    },
    "dark": {
      "gray": "#8d8d93",
      "gray-subtle": "rgb(127 127 133 / 0.18)",
      "blue": "#1f7bf5",
      "blue-subtle": "rgba(31, 123, 245, 0.12)",
      "purple": "#8e56f5",
      "purple-subtle": "rgba(142, 86, 245, 0.12)",
      "pink": "#f52bb5",
      "pink-subtle": "rgba(245, 43, 181, 0.12)",
      "red": "#f72a36",
      "red-subtle": "rgba(247, 42, 54, 0.12)",
      "orange": "#ff7800",
      "orange-subtle": "rgba(255, 120, 0, 0.12)",
      "green": "#3ffa8b",
      "green-subtle": "rgba(63, 250, 139, 0.12)",
      "teal": "#3ffa8b",
      "teal-subtle": "rgba(63, 250, 139, 0.12)"
    }
  },
  "interactive": {
    "$description": "Interactive accent (focus, links, active). Product ion is #1F7BF5 in both modes (noir-ion-ziawi 2026-09-09–10). Marketing --linear-accent-blue stays #2563ff until namespace-collapse.",
    "accent": "#1f7bf5",
    "accent-hover-light": "#1f7bf5",
    "accent-active-light": "#1f7bf5",
    "accent-dark": "#1f7bf5",
    "accent-hover-dark": "#1f7bf5",
    "accent-active-dark": "#1f7bf5"
  },
  "radius": {
    "$description": "System B radius scale emitted by styles/generated/design-tokens.css.",
    "none": "0",
    "xs": "2px",
    "default": "4px",
    "sm": "8px",
    "md": "10px",
    "lg": "12px",
    "xl": "16px",
    "2xl": "20px",
    "3xl": "24px",
    "pill": "9999px",
    "full": "9999px"
  },
  "duration": {
    "$description": "Motion durations (styles/linear-tokens.css --linear-duration-*). Recorded here as the canonical values; the --linear-* aliases are deprecated and shrink-only ratcheted.",
    "fast": "100ms",
    "normal": "160ms",
    "slow": "300ms"
  },
  "divergences": {
    "$description": "Known same-concept/different-value pairs across legacy namespaces, tracked for the namespace-collapse wave. Do NOT silently unify these — each is a visual change requiring its own migration slice.",
    "accent-blue": {
      "canonical-dark": "#1f7bf5",
      "linear-marketing": "#2563ff",
      "note": "--color-accent-blue is product ion #1F7BF5 (noir-ion-ziawi 2026-09-09–10). --linear-accent-blue remains marketing System A until namespace-collapse."
    }
  }
} as const;

export type DesignTokens = typeof DESIGN_TOKENS;
