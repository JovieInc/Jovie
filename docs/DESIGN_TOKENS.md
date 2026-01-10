# Design Tokens

> **Single Source of Truth**: All design tokens are defined in `apps/web/styles/design-system.css`

## Overview

This document describes the design token architecture for the Jovie dashboard. We use a unified token system to ensure consistent styling across light and dark modes.

## Token Architecture

### Import Order (CRITICAL)

In `apps/web/app/globals.css`, the import order MUST be:

```css
@import "tailwindcss";
@import "../styles/design-system.css";  /* Single source of truth */
@import "../styles/theme.css";          /* Feature accents & animations only */
```

**Why this matters:**
- `design-system.css` contains all base design tokens (colors, spacing, shadows, etc.)
- `theme.css` contains only feature-specific accents and animation keyframes
- Later imports can override earlier ones, so order is critical

### File Responsibilities

#### `design-system.css` - Base Token System
**Purpose**: Single source of truth for all design tokens

**Contains:**
- Color palette (OKLCH-based for perceptual uniformity)
- Background surfaces (base, surface-0 through surface-3)
- Text hierarchy (primary, secondary, tertiary, quaternary, disabled)
- Border system (subtle, default, strong)
- Button tokens (primary, secondary, danger, ghost)
- Sidebar tokens (RGB triplets for Tailwind opacity modifiers)
- Shadow system (sm, md, lg, xl)
- Focus ring tokens
- Animation durations (fast, normal, slow)

**Color Format**: OKLCH (oklch(L% C H / alpha))
- Provides perceptually uniform colors
- Better interpolation than RGB/HSL
- Supports theme customization via `--theme-base-hue`, `--theme-base-chroma`, `--theme-accent-hue`

**Example:**
```css
:root {
  /* Theme customization */
  --theme-base-hue: 240;
  --theme-base-chroma: 0.015;
  --theme-accent-hue: 271;

  /* Background surfaces */
  --color-bg-base: oklch(96% var(--theme-base-chroma) var(--theme-base-hue));
  --color-bg-surface-1: oklch(99% var(--theme-base-chroma) var(--theme-base-hue));

  /* Sidebar tokens (RGB format for Tailwind) */
  --sidebar-background: 246 247 248;
  --sidebar-foreground: 12 12 12;
}

:root.dark {
  --color-bg-base: oklch(3.5% 0 0); /* #090909 */
  --sidebar-background: 9 9 9;
}
```

#### `theme.css` - Feature Accents & Animations
**Purpose**: Extends design-system.css with feature-specific colors and animations

**Contains:**
- Feature accent colors (analytics, conversion, speed, beauty, SEO, links, pro)
- Animation keyframes (fadeIn, slideInFromBottom, shimmer)
- Auth transition animations

**Color Format**: OKLCH (same as design-system.css)

**Example:**
```css
/* Feature-specific accent colors */
:root {
  --accent-conv: oklch(55% 0.2 285);      /* Conversion purple */
  --accent-analytics: oklch(65% 0.15 230); /* Analytics blue */
  --accent-speed: oklch(65% 0.2 145);      /* Speed green */
}
```

#### `globals.css` - Base HTML Styling
**Purpose**: Imports token files and applies base HTML styling

**Contains:**
- Import statements (see Import Order above)
- Base HTML element styling (body, headings, links)
- Utility classes
- Marketing-mono scoped tokens (for marketing site)

**Does NOT contain**: Design token definitions (removed to avoid conflicts)

## Token Categories

### Background Tokens

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--color-bg-base` | #f6f7f8 | #090909 | App background, sidebar |
| `--color-bg-surface-0` | #f6f7f8 | #0c0c0c | Elevated backgrounds |
| `--color-bg-surface-1` | #ffffff | #101011 | Cards, panels, main content |
| `--color-bg-surface-2` | #eeeff1 | #141416 | Contact sidebar, hover states |
| `--color-bg-surface-3` | #e4e5e8 | #1a1a1e | Modals, pressed states |

### Text Tokens

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--color-text-primary-token` | #0c0c0c | #f4f4f5 | Headings, body text |
| `--color-text-secondary-token` | oklch(40%) | oklch(75%) | Secondary text |
| `--color-text-tertiary-token` | oklch(50%) | oklch(65%) | Muted text |
| `--color-text-disabled-token` | oklch(70%) | oklch(45%) | Disabled text |

### Border Tokens

| Token | Light/Dark | Usage |
|-------|-----------|-------|
| `--color-border-subtle` | oklch(0% 0 0 / 6%) | Subtle dividers |
| `--color-border-default` | oklch(0% 0 0 / 10%) | Default borders |
| `--color-border-strong` | oklch(0% 0 0 / 18%) | Emphasized borders |

### Sidebar Tokens (RGB Triplets)

Sidebar tokens use RGB triplet format (e.g., `246 247 248`) to enable Tailwind opacity modifiers like `bg-sidebar/50`.

| Token | Light Mode | Dark Mode |
|-------|-----------|-----------|
| `--sidebar-background` | 246 247 248 | 9 9 9 |
| `--sidebar-foreground` | 12 12 12 | 244 244 245 |
| `--sidebar-primary` | 12 12 12 | 244 244 245 |
| `--sidebar-accent` | 245 246 248 | 32 33 37 |
| `--sidebar-border` | 229 231 235 | 255 255 255 / 0.08 |

**Usage in components:**
```tsx
<aside className="bg-sidebar text-sidebar-foreground">
  <div className="border-sidebar-border">
    <button className="bg-sidebar-accent hover:bg-sidebar-accent/80">
      Button
    </button>
  </div>
</aside>
```

### Feature Accent Tokens

| Token | Color | Usage |
|-------|-------|-------|
| `--accent-conv` | Purple | Conversion metrics |
| `--accent-analytics` | Blue | Analytics features |
| `--accent-speed` | Green | Performance metrics |
| `--accent-beauty` | Amber | Design features |
| `--accent-seo` | Red | SEO metrics |
| `--accent-links` | Purple | Link management |
| `--accent-pro` | Teal | Pro features |

**Usage in components:**
```tsx
<div className="text-[color:var(--accent-analytics)]">
  Analytics Icon
</div>
```

## Adding New Tokens

### Step 1: Determine Token Category

- **Base design token** (color, spacing, shadow) → Add to `design-system.css`
- **Feature accent** → Add to `design-system.css` feature accent section
- **Animation** → Add to `theme.css`

### Step 2: Use OKLCH Format

Always use OKLCH for colors (unless RGB triplet needed for Tailwind opacity):

```css
/* Good */
--color-new-surface: oklch(95% 0.015 240);

/* Avoid */
--color-new-surface: #f2f3f5;
```

### Step 3: Add Light and Dark Variants

```css
:root {
  --color-new-token: oklch(90% 0.01 240);
}

:root.dark {
  --color-new-token: oklch(20% 0.01 240);
}
```

### Step 4: Test in Both Modes

- Verify token renders correctly in light mode
- Verify token renders correctly in dark mode
- Check contrast ratios meet WCAG AA (4.5:1 minimum)

## Token Naming Conventions

| Pattern | Example | Usage |
|---------|---------|-------|
| `--color-bg-*` | `--color-bg-base` | Background colors |
| `--color-text-*` | `--color-text-primary-token` | Text colors |
| `--color-border-*` | `--color-border-subtle` | Border colors |
| `--color-btn-*` | `--color-btn-primary-bg` | Button colors |
| `--sidebar-*` | `--sidebar-background` | Sidebar tokens (RGB) |
| `--accent-*` | `--accent-analytics` | Feature accents |
| `--shadow-*` | `--shadow-md` | Shadow elevations |
| `--duration-*` | `--duration-normal` | Animation durations |

## Common Pitfalls

### ❌ DON'T: Define tokens in multiple files
```css
/* design-system.css */
--color-bg-base: oklch(96% 0.015 240);

/* globals.css */
--color-bg-base: #f6f7f8; /* CONFLICT! */
```

### ✅ DO: Use design-system.css as single source
```css
/* design-system.css */
--color-bg-base: oklch(96% 0.015 240);

/* globals.css */
/* No token definitions - imports design-system.css */
```

### ❌ DON'T: Use hex colors for new tokens
```css
--color-new-accent: #7c3aed; /* Hard to maintain */
```

### ✅ DO: Use OKLCH with theme variables
```css
--color-new-accent: oklch(55% var(--theme-accent-chroma) var(--theme-accent-hue));
```

### ❌ DON'T: Forget dark mode variant
```css
:root {
  --color-new-token: oklch(90% 0.01 240);
}
/* Missing :root.dark definition! */
```

### ✅ DO: Always define both variants
```css
:root {
  --color-new-token: oklch(90% 0.01 240);
}

:root.dark {
  --color-new-token: oklch(20% 0.01 240);
}
```

## Migration Notes

As of January 2026, the following changes have been made:

1. **Removed duplicate sidebar tokens** from `theme.css` (lines 26-101)
2. **Removed duplicate accent tokens** from `theme.css` (lines 11-24)
3. **Removed unused semantic shortcuts** from `theme.css` (`--bg`, `--fg`, `--muted`, etc.)
4. **Added design-system.css import** to `globals.css`
5. **Removed inline token definitions** from `globals.css` (lines 614-698)

These changes establish `design-system.css` as the single source of truth for all design tokens.

## Resources

- [OKLCH Color Picker](https://oklch.com/)
- [Tailwind CSS v4 Docs](https://tailwindcss.com/docs)
- [WCAG Contrast Checker](https://webaim.org/resources/contrastchecker/)
