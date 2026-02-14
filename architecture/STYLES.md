# Styles Architecture Guide

## Tailwind CSS v4 + Design Tokens

Jovie uses Tailwind CSS v4 with a custom design token system for consistent styling across the application.

## 🚫 CRITICAL: Tailwind Configuration Protection

**Never modify the working Tailwind configuration. Changes can break styling entirely.**

### Protected Files (DO NOT MODIFY):
- `postcss.config.mjs` - PostCSS configuration
- `tailwind.config.ts` - Tailwind configuration
- `app/globals.css` - Global styles and tokens (first section)

### Verification
Run `pnpm tailwind:check` to verify configuration integrity.

## Design Token System

### Core Principles
- **Color-agnostic brand**: Logo and system adapt to any surface
- **Apple-inspired**: Clean, minimal, high-contrast design
- **Light/Dark mode**: Seamless theme switching
- **Semantic tokens**: Use meaning-based names, not color names

### Token Hierarchy

```css
/* Surface tokens (backgrounds) */
--color-bg-base: #ffffff;          /* app background */
--color-bg-surface-0: #fafbfc;     /* elevated backgrounds */
--color-bg-surface-1: #f6f7f8;     /* cards/panels */
--color-bg-surface-2: #eef0f2;     /* interactive/hover */
--color-bg-surface-3: #e5e7eb;     /* pressed/active */

/* Text tokens */
--color-text-primary-token: #0c0c0c;    /* primary text */
--color-text-secondary-token: #3f3f46;  /* 7.0:1 vs #fff */
--color-text-tertiary-token: #52525b;   /* 4.5:1 vs #fff */

/* Button tokens */
--color-btn-primary-bg: #000;      /* primary button background */
--color-btn-primary-fg: #fff;      /* primary button text */
```

## Utility Classes

### Surface Utilities
```css
@utility bg-surface-0 { background-color: var(--color-bg-surface-0); }
@utility bg-surface-1 { background-color: var(--color-bg-surface-1); }
@utility bg-surface-2 { background-color: var(--color-bg-surface-2); }
@utility bg-surface-3 { background-color: var(--color-bg-surface-3); }
```

> Dark mode text tokens mirror those ratios: `#d4d4d8` (~8:1 on #0f0f12) for secondary text and `#a1a1aa` (~4.6:1) for tertiary text.

### Text Utilities
```css
@utility text-primary-token { color: var(--color-text-primary-token); }
@utility text-secondary-token { color: var(--color-text-secondary-token); }
@utility text-tertiary-token { color: var(--color-text-tertiary-token); }
```

### Button Utilities
```css
@utility btn {
  @apply inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-ring disabled:opacity-50 disabled:pointer-events-none;
}

@utility btn-primary {
  background-color: var(--color-btn-primary-bg);
  color: var(--color-btn-primary-fg);
}
```

### Focus Ring Utility
```css
@utility focus-ring {
  @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-500/50 dark:focus-visible:ring-white/40 dark:focus-visible:ring-offset-gray-900;
}
```

## Component Styling Patterns

### Basic Component Structure
```typescript
import { cn } from '@/lib/utils'

export function Button({ className, variant = 'primary', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'btn btn-md',                    // base styles
        variant === 'primary' && 'btn-primary',
        variant === 'secondary' && 'btn-secondary',
        className                        // allow overrides
      )}
      {...props}
    />
  )
}
```

### Responsive Design
```typescript
// Use responsive utilities
className="text-sm md:text-base lg:text-lg"

// Mobile-first approach
className="p-4 md:p-6 lg:p-8"
```

### Dark Mode
```typescript
// Use semantic tokens (automatically switch)
className="bg-surface-1 text-primary-token"

// Manual dark mode when needed
className="bg-white dark:bg-gray-900 text-black dark:text-white"
```

## Color System

### Brand Colors
- **Logo**: Always black or white, never a specific color
- **Primary Action**: Black (light mode) / White (dark mode)
- **Accent**: `--color-accent` (#7c3aed) for highlights

### Surface Colors (Light Mode)
```
░░ bg-base      #ffffff  ← app background
▒▒ bg-surface-0 #fafbfc  ← elevated (sidebars)
▓▓ bg-surface-1 #f6f7f8  ← cards/panels
██ bg-surface-2 #eef0f2  ← hover states
██ bg-surface-3 #e5e7eb  ← pressed states
```

### Surface Colors (Dark Mode)
```
██ bg-base      #0a0a0a  ← app background
▓▓ bg-surface-0 #111111  ← elevated (sidebars)
▒▒ bg-surface-1 #171717  ← cards/panels
░░ bg-surface-2 #1f1f1f  ← hover states
   bg-surface-3 #262626  ← pressed states
```

## Animation & Transitions

### Standard Transitions
```css
/* Buttons — color change only on hover */
transition-colors duration-150 ease-out

/* Interactive cards — color change only on hover */
transition-colors duration-200 ease-out

/* Active/press feedback — opacity only (no scale, no translate) */
active:opacity-90
```

### Hover Patterns
```css
/* Buttons */
hover:bg-btn-primary/90        /* primary buttons */
hover:bg-surface-2             /* secondary/ghost buttons */

/* Interactive cards */
hover:bg-surface-2             /* background elevation */
hover:border-default           /* border color upgrade */
```

### What NOT to use on buttons or cards
```css
hover:scale-*          /* causes layout bounce */
hover:-translate-y-*   /* causes layout bounce */
active:scale-*         /* causes layout bounce */
will-change-transform  /* unnecessary without transforms */
hover:shadow-* jumps   /* large shadow changes feel bouncy */
```

### Exception: Popout menus
Radix popover/dropdown open/close animations may use scale:
```css
data-[state=open]:animate-in
data-[state=closed]:animate-out
```

Buttons may still animate to success/error states (e.g. loading spinners, checkmarks).

### Micro-animations
```css
@utility card-hover {
  @apply transition-colors duration-200 ease-out hover:bg-surface-2;
}

@utility btn-press {
  @apply transition-opacity duration-100 ease-out active:opacity-90;
}
```

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  .transition-all,
  .transform,
  [data-state] {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

## Layout Patterns

### Flexbox Utilities
```typescript
// Common flex patterns
className="flex items-center justify-between"
className="flex flex-col space-y-4"
className="flex items-center space-x-2"
```

### Grid Layouts
```typescript
// Responsive grid
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"

// Auto-fit grid
className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4"
```

### Container Sizing
```typescript
// Standard container
className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"

// Content container
className="max-w-4xl mx-auto"
```

## Typography

### Font Hierarchy
```css
h1 { @apply text-4xl lg:text-5xl font-semibold tracking-tight; }
h2 { @apply text-3xl lg:text-4xl font-semibold tracking-tight; }
h3 { @apply text-2xl lg:text-3xl font-semibold tracking-tight; }
h4 { @apply text-xl lg:text-2xl font-semibold tracking-tight; }
h5 { @apply text-lg lg:text-xl font-semibold tracking-tight; }
h6 { @apply text-base lg:text-lg font-semibold tracking-tight; }
```

### Text Utilities
```typescript
// Semantic text colors
className="text-primary-token"    // primary text
className="text-secondary-token"  // secondary text
className="text-tertiary-token"   // tertiary text
className="text-destructive"      // error text
```

## Component-Specific Patterns

### Buttons
```typescript
// Button variants
className="btn btn-primary btn-md"     // primary button
className="btn btn-secondary btn-md"   // secondary button
className="btn btn-ghost btn-sm"       // ghost button
```

### Cards
```typescript
// Standard card
className="bg-surface-1 border border-default rounded-lg p-6 card-hover"

// Elevated card
className="bg-surface-0 border border-subtle rounded-lg p-6 shadow-sm"
```

### Form Elements
```typescript
// Input styling
className="
  w-full px-3 py-2 
  bg-surface-1 border border-default rounded-md
  text-primary-token placeholder:text-tertiary-token
  focus-ring focus:border-accent
  disabled:opacity-50 disabled:cursor-not-allowed
"
```

## Spacing System

### Standard Spacing Scale
```
space-1   4px
space-2   8px
space-3   12px
space-4   16px
space-6   24px
space-8   32px
space-12  48px
space-16  64px
space-20  80px
space-24  96px
```

### Component Spacing
```typescript
// Section spacing
className="py-16 md:py-24 lg:py-32"

// Component spacing
className="space-y-6"              // vertical spacing
className="space-x-4"              // horizontal spacing
className="gap-4"                  // grid/flex gap
```

## Best Practices

### ✅ Do
- Use semantic tokens (`bg-surface-1`, `text-primary-token`)
- Include `focus-ring` on interactive elements
- Use responsive utilities (`text-sm md:text-base`)
- Prefer utility classes over custom CSS
- Test in both light and dark modes
- Use `cn()` utility for conditional classes

### ❌ Don't
- Hardcode colors (`bg-blue-500` → use `bg-accent`)
- Skip focus states on interactive elements
- Use fixed pixel values for responsive design
- Modify protected Tailwind configuration files
- Create custom CSS without checking for existing utilities
- Use `!important` unless absolutely necessary

## Debugging Styles

### Tailwind DevTools
```bash
# Check if styles are being applied
pnpm tailwind:check

# Build and inspect generated CSS
pnpm build
```

### Common Issues
1. **Styles not applying**: Check Tailwind content paths in config
2. **Dark mode not working**: Verify semantic tokens are used
3. **Focus ring missing**: Add `focus-ring` utility class
4. **Responsive breakpoints**: Check mobile-first approach

## Performance Considerations

### Bundle Size
- Tailwind purges unused styles automatically
- Use specific utilities instead of broad classes
- Avoid deep nesting in custom CSS

### Runtime Performance
- Prefer CSS utilities over JavaScript styling
- Use `transform` and `opacity` for animations
- Minimize DOM manipulation for style changes

---

**Remember**: Always run `pnpm tailwind:check` before committing style changes to ensure configuration stability.