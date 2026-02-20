# Figma MCP Design System Rules for Jovie

> Comprehensive design system reference for Figma MCP integration.
> Use when translating between Figma designs and Jovie codebase components.

---

## 1. Token Definitions

### Token File Locations

| File | Lines | Purpose |
|------|-------|---------|
| `apps/web/styles/design-system.css` | 903 | Core CSS custom properties — colors, typography, spacing, shadows, transitions |
| `apps/web/styles/linear-tokens.css` | 365 | Linear-extracted marketing page tokens |
| `apps/web/app/globals.css` | 1287 | Tailwind v4 `@theme` registration + component base styles |
| `apps/web/tailwind.config.js` | 213 | Tailwind v4 theme extensions |
| `apps/web/postcss.config.js` | 23 | `@tailwindcss/postcss` + autoprefixer |

### Token Format & Naming

All tokens are CSS custom properties. **OKLCH color space** for perceptual uniformity.

**Naming convention:**
```
--color-{category}-{subcategory}
--linear-{element}-{property}
--{scale}-{level}
```

**Category prefixes:**
- `--color-bg-*` — Background surfaces
- `--color-text-*-token` — Text hierarchy
- `--color-border-*` — Border colors
- `--color-btn-*` — Button colors
- `--color-brand-*` — Platform brands (Spotify, Apple, YouTube, etc.)
- `--color-success/error/warning/info` — Semantic status
- `--color-accent-*` — Primary brand accent
- `--color-interactive-*` — Hover/active states
- `--color-badge-*` — Badge/tag styling
- `--color-skeleton-*` — Loading states

### Token Registration Pipeline

```
design-system.css (:root vars) → globals.css (@theme blocks) → Tailwind utilities
```

**Critical**: A CSS var in `:root` does NOT generate Tailwind utilities unless also added to `@theme` or `@theme inline` in globals.css.

---

## 2. Color System

### Color Spaces Used

- **OKLCH** for perceptual uniformity: `oklch(97% 0.003 260)`
- **LCH** for Linear-extracted values: `lch(47.918% 59.303 288.421)`
- **RGBA** for border/overlay opacity: `rgba(255,255,255,0.08)`
- Dark mode key: very low chroma (~0.003), hue ~260

### Surface Hierarchy

**Dark Mode:**

| Token | Value | Hex | Tailwind | Usage |
|-------|-------|-----|----------|-------|
| `--color-bg-base` | `lch(2.467% 0 272)` | `#090909` | `bg-base` | Page/sidebar bg |
| `--color-bg-surface-0` | `lch(4.8% 0.7 272)` | `#101012` | `bg-surface-0` | Primary surface |
| `--color-bg-surface-1` | `lch(7.133% 1.867 272)` | `#141518` | `bg-surface-1` | Cards |
| `--color-bg-surface-2` | `lch(10.633% 3.033 272)` | `#191B1F` | `bg-surface-2` | Inputs, elevated |
| `--color-bg-surface-3` | `lch(14.133% 4.2 272)` | `#212329` | `bg-surface-3` | Modals, tooltips |

**Light Mode:**

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `--color-bg-base` | `#f5f5f5` | `bg-base` | Sidebar |
| `--color-bg-surface-0` | `lch(99% 0 282.863)` | `bg-surface-0` | Primary |
| `--color-bg-surface-1` | `lch(99% 0 282.863)` | `bg-surface-1` | Content |
| `--color-bg-surface-2` | `lch(93.75% 0 282.863)` | `bg-surface-2` | Cards |
| `--color-bg-surface-3` | `lch(91.417% 0 282.863)` | `bg-surface-3` | Nested |

### Text Hierarchy

**Dark Mode:**

| Token | Tailwind | Value | Hex | Usage |
|-------|----------|-------|-----|-------|
| `--color-text-primary-token` | `text-primary-token` | `lch(100% 0 272)` | `#FFFFFF` | Headings |
| `--color-text-secondary-token` | `text-secondary-token` | `lch(90.65% 1.35 272)` | `#E3E4E6` | Body |
| `--color-text-tertiary-token` | `text-tertiary-token` | `lch(62.6% 1.35 272)` | `#969799` | Labels |
| `--color-text-quaternary-token` | `text-quaternary-token` | `lch(38.29% 1.35 272)` | `#5A5B5D` | Muted |

**Light Mode:**

| Token | Value |
|-------|-------|
| `--color-text-primary-token` | `oklch(10% 0 0)` |
| `--color-text-secondary-token` | `oklch(40% 0.015 272)` |
| `--color-text-tertiary-token` | `oklch(50% 0.015 272)` |
| `--color-text-quaternary-token` | `oklch(60% 0.015 272)` |

### Accent Color

```css
--color-accent:        lch(47.918% 59.303 288.421)  /* #5e6ad2 — Linear purple-blue */
--color-accent-hover:  lch(55% 59.303 288.421)      /* Dark mode */
--color-accent-active: lch(42% 59.303 288.421)
--color-accent-subtle: lch(20% 30 288.421)           /* Dark mode bg */
```

### Borders

```css
/* Dark Mode */
--color-border-subtle:  rgba(255, 255, 255, 0.05)   /* border-subtle */
--color-border-default: rgba(255, 255, 255, 0.08)   /* border-default */
--color-border-strong:  rgba(255, 255, 255, 0.10)   /* border-strong */

/* Light Mode */
--color-border-subtle:  oklch(0% 0 0 / 6%)
--color-border-default: oklch(0% 0 0 / 10%)
--color-border-strong:  oklch(0% 0 0 / 18%)
```

### Interactive States

```css
/* Dark */
--color-interactive-hover:  rgba(255, 255, 255, 0.05)   /* bg-interactive-hover */
--color-interactive-active: rgba(255, 255, 255, 0.05)   /* bg-interactive-active */

/* Light */
--color-interactive-hover:  oklch(0% 0 0 / 6%)
--color-interactive-active: oklch(0% 0 0 / 12%)
```

### Semantic Status Colors

```css
--color-success: oklch(70% 0.18 145)   /* Green */
--color-warning: oklch(80% 0.15 80)    /* Amber */
--color-error:   oklch(70% 0.2 25)     /* Red */
--color-info:    oklch(70% 0.15 240)   /* Blue */
/* Each has a -subtle variant for backgrounds */
```

### Brand Platform Colors

```css
--color-brand-spotify:    oklch(70% 0.21 145)  /* Green */
--color-brand-apple:      oklch(70% 0.2 10)    /* Red */
--color-brand-youtube:    oklch(70% 0.22 25)   /* Red-orange */
--color-brand-soundcloud: oklch(70% 0.2 45)    /* Orange */
--color-brand-tidal:      oklch(90% 0 0)       /* Monochrome */
--color-brand-amazon:     oklch(80% 0.17 70)   /* Orange-yellow */
--color-brand-deezer:     oklch(82% 0.15 75)   /* Yellow */
--color-brand-pandora:    oklch(60% 0.2 250)   /* Blue-purple */
```

### Feature Accent Colors

```css
--accent-conv:      oklch(55% 0.2 285)   /* Conversion — purple */
--accent-analytics: oklch(65% 0.15 230)  /* Analytics — blue */
--accent-speed:     oklch(65% 0.2 145)   /* Speed — green */
--accent-beauty:    oklch(75% 0.15 70)   /* Beauty — amber */
--accent-seo:       oklch(60% 0.2 25)    /* SEO — red */
```

### Sidebar Tokens (RGB Triplet for opacity modifiers)

```css
/* Dark Mode — enables bg-sidebar/50, text-sidebar-foreground/75 */
--sidebar-background:     8 9 10
--sidebar-foreground:     227 228 229    /* #E3E4E5 */
--sidebar-accent:         255 255 255    /* /0.02 for hover */
--sidebar-muted:          98 102 109
--sidebar-item-foreground: 208 214 224
--sidebar-item-icon:      98 102 109
```

---

## 3. Component Library

### Architecture: Atomic Design

```
packages/ui/atoms/              # 68 shared primitive components (@jovie/ui)
apps/web/components/
├── atoms/                      # 106 app-specific atoms (extend @jovie/ui)
├── molecules/                  # 67 composite components
├── organisms/                  # 78 complex features
├── home/                       # 68 homepage sections
├── dashboard/                  # 21 dashboard subdirs
├── profile/                    # 33 profile subdirs
└── admin/                      # 39 admin subdirs
```

### Variant System: CVA (Class Variance Authority)

All components use `cva()` for variants + `cn()` (clsx + tailwind-merge) for merging:

```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-[8px] text-[13px] transition-colors',
  {
    variants: {
      variant: {
        primary: 'bg-btn-primary text-btn-primary-foreground shadow-button-inset hover:bg-btn-primary/90',
        ghost: 'hover:bg-interactive-hover',
        secondary: 'bg-surface-1 text-primary-token hover:bg-surface-2',
      },
      size: {
        default: 'h-[32px] px-3',
        sm: 'h-7 px-2 text-xs',
        lg: 'h-10 px-4',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  }
);
```

### Component Props Pattern

```tsx
interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;      // Radix Slot for render flexibility
  loading?: boolean;      // Loading spinner state
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  }
);
```

### Key Component Specs (Linear-Matched)

| Component | Height | Radius | Font Size | Font Weight | Padding |
|-----------|--------|--------|-----------|-------------|---------|
| Button (default) | 32px | 8px | 13px | 400 | 12px |
| Button (sm) | 28px | 8px | 12px | 400 | 8px |
| Button (lg) | 40px | 8px | 14px | 400 | 16px |
| Input | auto | 6px | 13px | 400 | 12px 14px |
| Badge | auto | 2px | 10px | 510 | 2px 6px |
| Card | auto | 8px | — | — | 16px |
| Large Card | auto | 12px | — | — | 24px |
| Dropdown | auto | 8px | 13px | 400 | 4px |
| Sidebar item | 28px | 6px | 13px | 510 | 6px |

### Export Patterns

```tsx
// Barrel import from @jovie/ui
import { Button, Badge, Input, Card } from '@jovie/ui';

// Per-file import (for tree-shaking)
import { Button } from '@jovie/ui/atoms/button';

// App-level wrapper
import { CTAButton } from '@/components/atoms/CTAButton';

// Type-only export
import type { ButtonProps, BadgeProps } from '@jovie/ui';
```

### Storybook

- **Location:** `apps/web/.storybook/`
- **Framework:** `@storybook/nextjs-vite`
- **Stories glob:** `apps/web/components/**/*.stories.tsx`
- **Addons:** a11y, docs, vitest, Chromatic

---

## 4. Frameworks & Libraries

| Category | Technology | Version |
|----------|-----------|---------|
| **Framework** | Next.js (App Router) | 16.1.5 |
| **React** | React 19 (Server Components + Compiler) | 19.2.4 |
| **Language** | TypeScript (strict mode) | ^5.x |
| **Styling** | Tailwind CSS v4 + PostCSS | ^4.1.18 |
| **Variants** | class-variance-authority | ^0.7.1 |
| **Class Merge** | clsx + tailwind-merge | 2.1.1 / 3.4.1 |
| **Primitives** | Radix UI (20+ packages) | latest |
| **Animation** | Motion (Framer Motion fork) | ^12.23.26 |
| **Data** | TanStack Query v5 | ^5.90.20 |
| **Tables** | TanStack Table v8 | ^8.21.3 |
| **Charts** | Recharts | 3.6.0 |
| **Forms** | react-hook-form + zod v4 | 7.71.1 / ^4.3.5 |
| **Auth** | Clerk | 6.36.7 |
| **Build** | Turbo + Turbopack (dev) / Webpack (prod) | 2.8.8 |
| **Monorepo** | pnpm workspaces | 9.15.4 |
| **Node** | v24.x (required) | 24.x |
| **Testing** | Vitest + Playwright + Storybook | latest |
| **Linting** | Biome + ESLint | ^2.3.11 / ^10.x |

---

## 5. Asset Management

### Image Optimization (next.config.js)

```javascript
{
  formats: ['image/avif', 'image/webp'],
  qualities: [25, 50, 75, 85, 100],
  deviceSizes: [640, 750, 828, 1080, 1200],
  imageSizes: [64, 96, 128, 256, 384, 400],
  minimumCacheTTL: 31536000,  // 1 year
  dangerouslyAllowSVG: true,
}
```

### Remote Image Domains

| Source | Domain | Usage |
|--------|--------|-------|
| Spotify | `i.scdn.co` | Album art |
| Cloudinary | `res.cloudinary.com` | User uploads |
| Clerk | `images.clerk.dev`, `img.clerk.com` | User avatars |
| Vercel Blob | `*.blob.vercel-storage.com` | File storage |
| Apple Music | `*.mzstatic.com` | Album metadata |

### Static Assets

```
apps/web/public/
├── brand/          # Logo variants (Icon, Wordmark, Black, White, Alt)
├── images/
│   ├── avatars/    # Artist profiles (SVG)
│   └── tipping/    # Monetization assets
├── og/             # Open Graph images
└── favicon.*       # SVG, ICO, PNG (16-512px)
```

---

## 6. Icon System

### Primary: lucide-react v0.562.0

900+ SVG icons, tree-shakeable, TypeScript-typed.

```tsx
// Direct import (most common)
import { BadgeCheck, Link2, Search, ArrowLeft, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Via Icon wrapper component (registry-based)
import { Icon } from '@/components/atoms/Icon';
<Icon name="chevron-right" className="h-4 w-4" />
```

**Standard sizes:** `h-4 w-4` (16px default), `h-3.5 w-3.5` (14px small), `h-5 w-5` (20px medium)

### Platform Logos: SocialIcon

```tsx
import { SocialIcon } from '@/components/atoms/SocialIcon';
<SocialIcon platform="spotify" className="h-4 w-4" />
// 25+ platforms: Spotify, Apple Music, Instagram, TikTok, YouTube, etc.
```

### Bundle Optimization

- Dedicated `icons` webpack chunk (max 180KB)
- Tree-shaking via `optimizePackageImports` in next.config.js

---

## 7. Typography

### Font Stack

```css
--font-sans: "Inter Variable", "Inter", "SF Pro Display", -apple-system,
  BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

### OpenType Features

```css
font-feature-settings: "cv01", "ss03", "rlig" 1, "calt" 1;
```

### Type Scale

| Token | Size | Tailwind | Usage |
|-------|------|----------|-------|
| `text-2xs` | 11px | `text-2xs` | Tiny labels, badges |
| `text-xs` | 12px | `text-xs` | Small text, labels |
| `text-app` | 13px | `text-app` | **Default app UI size** |
| `text-sm` | 14px | `text-sm` | Body small |
| `text-base` | 15-16px | `text-base` | Body |
| `text-lg` | 18px | `text-lg` | H4 |
| `text-xl` | 20px | `text-xl` | H3 |
| `text-2xl` | 24px | `text-2xl` | Body large |
| `text-3xl` | 30px | `text-3xl` | — |
| `text-4xl` | 48px | `text-4xl` | H2 marketing |
| `text-5xl` | 64px | `text-5xl` | H1 marketing |

### Marketing Typography (Linear-Extracted)

| Scale | Size | Weight | Line Height | Letter Spacing |
|-------|------|--------|-------------|----------------|
| H1 | 64px | 510 | 64px | -0.022em |
| H2 | 48px | 510 | 48px | -0.022em |
| H3 | 20px | 590 | 26.6px | -0.24px |
| Body-lg | 24px | 400 | 31.92px | -0.288px |
| Body | 15px | 400 | 24px | -0.011em |
| Body-sm | 14px | 400 | 21px | -0.013em |
| Caption | 13px | 510 | 19.5px | -0.01em |
| Section label | 13px | 510 | — | 0.08em (uppercase) |

### Font Weights

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| normal / book | 450 | `font-normal` | Body text (**NOT 400**) |
| medium | 500 | `font-medium` | Emphasis |
| semibold | 600 | `font-semibold` | Headings |
| bold / heavy | 700 | `font-bold` | Strong emphasis |

### Line Heights & Letter Spacing

```css
--leading-none: 1   --leading-tight: 1.25   --leading-snug: 1.375
--leading-normal: 1.5   --leading-relaxed: 1.625   --leading-loose: 2

--tracking-tighter: -0.02em   --tracking-tight: -0.01em
--tracking-normal: 0   --tracking-wide: 0.01em   --tracking-wider: 0.02em
```

---

## 8. Spacing

### 8px Base Grid

| Token | Pixels | Tailwind |
|-------|--------|----------|
| `space-0` | 0 | `p-0` |
| `space-px` | 1px | `p-px` |
| `space-0.5` | 2px | `p-0.5` |
| `space-1` | 4px | `p-1` |
| `space-1.5` | 6px | `p-1.5` |
| `space-2` | 8px | `p-2` |
| `space-3` | 12px | `p-3` |
| `space-4` | 16px | `p-4` |
| `space-5` | 20px | `p-5` |
| `space-6` | 24px | `p-6` |
| `space-8` | 32px | `p-8` |
| `space-10` | 40px | `p-10` |
| `space-12` | 48px | `p-12` |
| `space-16` | 64px | `p-16` |
| `space-20` | 80px | `p-20` |
| `space-24` | 96px | `p-24` |

### Marketing Section Spacing (Asymmetric)

| Breakpoint | Top | Bottom | Content Gap |
|-----------|-----|--------|-------------|
| Mobile | 64px | 80px | 48px |
| Tablet | 80px | 96px | 64px |
| Desktop | 96px | 128px | 80px |

---

## 9. Border Radius

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `radius-xs` | 2px | `rounded-xs` | Tags, badges |
| `radius-sm` | 4px | `rounded-sm` | Sidebar items |
| `radius-md` | 6px | `rounded-md` | Inputs |
| `radius-default` | 8px | `rounded` | Buttons, dropdowns |
| `radius-lg` | 8px | `rounded-lg` | Cards |
| `radius-xl` | 12px | `rounded-xl` | Large cards, panels |
| `radius-2xl` | 16px | `rounded-2xl` | Modals, sheets |
| `radius-3xl` | 22px | `rounded-3xl` | Hero sections |
| `radius-pill` | 48px | `rounded-[48px]` | Pill buttons |
| `radius-full` | 9999px | `rounded-full` | Circles |

---

## 10. Shadows

### Dark Mode

```css
--shadow-sm:  0px 4px 4px -1px #0000000f, 0px 1px 1px 0px #0000001e
--shadow-md:  0 3px 8px #0000002f, 0 2px 5px #0000002f, 0 1px 1px #0000002f
--shadow-lg:  0 4px 40px #00000026, 0 3px 20px #00000036, 0 2px 6px #0000001f
--shadow-xl:  0 5px 50px #0000004d, 0 4px 30px #0000004d, 0 3px 10px #0000002f

--shadow-card:
  rgba(0,0,0,0.2) 0px 0px 0px 1px,
  rgba(0,0,0,0.4) 0px 2px 4px 0px

--shadow-card-elevated:
  rgba(0,0,0,0.2) 0px 0px 12px 0px inset,
  rgba(0,0,0,0.2) 0px 4px 24px 0px

--shadow-divider: rgba(255,255,255,0.05) 0px -0.5px 0px 0px inset
```

### Light Mode

```css
--shadow-card:
  oklch(80% 0 283) 0px 0px 0px 1px,
  oklch(0% 0 0 / 2.2%) 0px 3px 6px -2px,
  oklch(0% 0 0 / 4.4%) 0px 1px 1px 0px

--shadow-button-inset:
  0px 4px 4px -1px oklch(0% 0 0 / 6%),
  0px 1px 1px 0px oklch(0% 0 0 / 12%)
```

### Linear Marketing Shadows

```css
--linear-shadow-button:
  rgba(0,0,0,0) 0px 8px 2px, rgba(0,0,0,0.01) 0px 5px 2px,
  rgba(0,0,0,0.04) 0px 3px 2px, rgba(0,0,0,0.07) 0px 1px 1px,
  rgba(0,0,0,0.08) 0px 0px 1px

/* Popup/overlay shadow */
rgba(8,9,10,0.6) 0px 4px 32px
```

---

## 11. Animation & Transitions

### Duration Tokens

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `duration-instant` | 50ms | `duration-instant` | Micro-interactions |
| `duration-fast` | 100ms | `duration-fast` | Color/bg changes |
| `duration-normal` | 160ms | `duration-normal` | **Standard — most UI** |
| `duration-slow` | 250ms | `duration-slow` | Panel transitions |
| `duration-slower` | 350ms | `duration-slower` | Complex animations |

### Easing Functions

```css
--ease-out:         cubic-bezier(0.16, 1, 0.3, 1)        /* Spring-like */
--ease-in-out:      cubic-bezier(0.65, 0, 0.35, 1)
--ease-spring:      cubic-bezier(0.34, 1.56, 0.64, 1)    /* Bouncy */
--ease-interactive: cubic-bezier(0.25, 0.46, 0.45, 0.94) /* Primary ease */
```

### Pre-Composed Transitions

```css
--transition-colors: border, background-color, color, opacity (160ms)
--transition-bg: background-color (160ms)
--transition-transform: transform (160ms)
--transition-shadow: box-shadow, background-color (160ms)
--transition-collapse: height, min-height (250ms ease-interactive)
```

### Reduced Motion

All durations → 0ms via `@media (prefers-reduced-motion: reduce)`.

### Accessibility: Contrast Scaling

```css
/* High contrast mode */
@media (prefers-contrast: more) {
  /* Stronger borders: 15%, 25%, 40% (vs 6%, 10%, 18%) */
  /* Increased text contrast */
}

/* Reduced contrast mode */
@media (prefers-contrast: less) {
  /* Softer text and borders for eye comfort */
}
```

---

## 12. Styling Approach

### Methodology: Tailwind CSS v4, utility-first

- **No CSS Modules, no Styled Components**
- Mobile-first responsive: default → `sm:` → `md:` → `lg:` → `xl:` → `2xl:`
- Dark mode: `class` strategy via `next-themes` (`.dark` on `<html>`)
- Class merging: `cn()` from `@/lib/utils` (clsx + tailwind-merge)

### Breakpoints

| Prefix | Min Width |
|--------|-----------|
| (none) | 0px |
| `sm:` | 640px |
| `md:` | 768px |
| `lg:` | 1024px |
| `xl:` | 1280px |
| `2xl:` | 1536px |

### Responsive Pattern

```tsx
<section className="px-5 sm:px-6 lg:px-[77px]">
  <div className="grid-cols-1 md:grid-cols-[1fr_auto] md:gap-16 lg:gap-20">
    <div>Content</div>
    <div className="hidden md:flex">Desktop sidebar</div>
  </div>
</section>
```

---

## 13. Project Structure

```
/ (monorepo root)
├── apps/
│   ├── web/                   # Main Next.js 16 app
│   │   ├── app/               # App Router pages + layouts
│   │   ├── components/        # Atomic design hierarchy
│   │   ├── styles/            # Design tokens CSS
│   │   ├── lib/               # Utilities, queries, hooks
│   │   ├── public/            # Static assets
│   │   └── .storybook/        # Component docs
│   └── should-i-make/         # Secondary app
├── packages/
│   └── ui/                    # @jovie/ui shared components
│       ├── atoms/             # 68 primitive components
│       ├── lib/               # cn(), dropdown-styles, overlay-styles
│       └── theme/             # Theme configuration
├── CLAUDE.md                  # AI agent instructions
├── agents.md                  # Full engineering guidelines
├── turbo.json                 # Turbo task config
└── pnpm-workspace.yaml        # Workspace config
```

---

## 14. Figma-to-Code Translation Guide

### Mapping Rules

| Figma Property | Codebase Equivalent |
|----------------|-------------------|
| Fill color | `bg-{surface-token}` or `bg-{semantic-token}` |
| Text color | `text-{primary/secondary/tertiary/quaternary}-token` |
| Stroke | `border-{subtle/default/strong}` |
| Drop shadow | `shadow-{sm/md/lg/xl/card/card-elevated}` |
| Corner radius | `rounded-{xs/sm/md/DEFAULT/lg/xl/2xl/3xl}` |
| Font size | `text-{2xs/xs/app/sm/base/lg/xl/2xl/3xl/4xl/5xl}` |
| Font weight | `font-{normal/medium/semibold/bold}` |
| Spacing | `p-{1-24}`, `gap-{1-24}`, `m-{1-24}` |
| Icon | `import { IconName } from 'lucide-react'` |
| Opacity fill | `bg-white/[0.05]` or `bg-black/[0.08]` |

### Implementation Checklist

1. **Check existing components first** — `@jovie/ui` atoms, then app-level atoms
2. **Map to design tokens** — never hardcode colors, always use CSS vars
3. **Use CVA for variants** — extend existing variant definitions when possible
4. **Mobile-first responsive** — start with mobile, add breakpoint prefixes
5. **Accessibility** — `aria-*` attrs, reduced motion, contrast scaling
6. **Use `cn()`** for conditional class merging
7. **13px is the base UI font size** — not 14px or 16px

### Component Reuse Reference

```
@jovie/ui atoms:  button, badge, input, card, dialog, dropdown-menu, select,
                  tabs, tooltip, checkbox, switch, separator, avatar,
                  skeleton, progress, slider, toggle, popover, sheet,
                  scroll-area, radio-group, textarea, label, alert

App atoms:        CTAButton, Icon, SocialIcon, FormField, SearchInput,
                  Badge (wrapper), SwipeToReveal

Molecules:        DataCard, FormField, StatsRow, ActionMenu, Avatar,
                  BaseSidebar, SidebarLinkRow, DrawerSection
```
