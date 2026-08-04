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
      "blue": "#2563ff",
      "blue-subtle": "#edf3ff",
      "purple": "#8b1eff",
      "purple-subtle": "#f3ebff",
      "pink": "#d61a7f",
      "pink-subtle": "#fde9f4",
      "red": "#f3122d",
      "red-subtle": "#ffeaee",
      "orange": "#ff9800",
      "orange-subtle": "#fff3e6",
      "green": "#2f9e44",
      "green-subtle": "#ecf8ee",
      "teal": "#0f9b8e",
      "teal-subtle": "#e8f7f5"
    },
    "dark": {
      "gray": "#8d8d93",
      "gray-subtle": "rgb(127 127 133 / 0.18)",
      "blue": "#11afff",
      "blue-subtle": "rgba(17, 175, 255, 0.12)",
      "purple": "#a982ff",
      "purple-subtle": "rgba(169, 130, 255, 0.12)",
      "pink": "#ff48d2",
      "pink-subtle": "rgba(255, 72, 210, 0.12)",
      "red": "#ff677d",
      "red-subtle": "rgba(255, 103, 125, 0.12)",
      "orange": "#ffc857",
      "orange-subtle": "rgba(255, 200, 87, 0.12)",
      "green": "#39e58c",
      "green-subtle": "rgba(57, 229, 140, 0.12)",
      "teal": "#24f6d2",
      "teal-subtle": "rgba(36, 246, 210, 0.1)"
    }
  },
  "interactive": {
    "$description": "Interactive accent (focus, links, active). Dark mode uses Noir Ion electric blue (#11AFFF). Light mode retains System B #7170ff until a light-mode Noir Ion pass.",
    "accent": "#7170ff",
    "accent-hover-light": "#9a46ff",
    "accent-active-light": "#7612df",
    "accent-dark": "#11afff",
    "accent-hover-dark": "#3bc0ff",
    "accent-active-dark": "#0088ff"
  },
  "radius": {
    "$description": "System B radius scale (styles/design-system.css).",
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
      "canonical-dark": "#11afff",
      "linear-marketing": "#2563ff",
      "note": "--color-accent-blue dark is Noir Ion electric blue (JOV-4635). --linear-accent-blue remains marketing System A until namespace-collapse."
    }
  }
} as const;

export type DesignTokens = typeof DESIGN_TOKENS;
