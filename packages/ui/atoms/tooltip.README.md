# Tooltip Component

A polished tooltip component with Radix primitives, tokenized design, and comprehensive accessibility. Built with Apple-level attention to detail.

## Features

### 🎯 **Professional Implementation**
- **Radix Integration**: Built on `@radix-ui/react-tooltip` for production-ready accessibility
- **Apple-level Polish**: Smooth animations, refined spacing, elegant visual design
- **SSR Safety**: No hydration mismatches, works perfectly with server-side rendering

### 🎨 **Modern Design System**
- **Tailwind v4 Tokens**: Future-proof color system with semantic tokens
- **Theme-aware Surfaces**: Uses `bg-surface-3` and `text-primary-token` for consistent contrast
- **Consistent Styling**: Integrated with the app's design token system

### ♿ **Comprehensive Accessibility**
- **Screen Reader Support**: Proper ARIA relationships and labeling
- **Keyboard Navigation**: Focus management, escape key handling
- **Motion Reduction**: Respects `prefers-reduced-motion` setting
- **Disabled Elements**: Guidance for proper tooltip usage with disabled controls

### ⚡ **Performance & UX**
- **Sensible Delays**: 1000ms initial delay, 300ms skip delay for smooth experience
- **Pointer Safety**: Prevents accidental triggers when cursor passes over tooltip
- **Collision Detection**: Automatic positioning to stay within viewport
- **Minimal DOM**: Optimized rendering with efficient updates

## Usage

### Basic Tooltip

```tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@jovie/ui/atoms/tooltip';

// Wrap your app with TooltipProvider (usually in layout.tsx)
<TooltipProvider>
  <YourApp />
</TooltipProvider>

// Use tooltip components
<Tooltip>
  <TooltipTrigger>
    <button>Hover me</button>
  </TooltipTrigger>
  <TooltipContent>
    <span>This is a tooltip</span>
  </TooltipContent>
</Tooltip>
```

### Simple API (Recommended for common use cases)

For most tooltips, use `SimpleTooltip` for a cleaner API:

```tsx
import { SimpleTooltip } from '@jovie/ui';

<SimpleTooltip content="Save changes">
  <button>Save</button>
</SimpleTooltip>

<SimpleTooltip content={<span>Custom <strong>content</strong></span>} side="right">
  <IconButton />
</SimpleTooltip>
```

### With Keyboard Shortcut

```tsx
<Tooltip>
  <TooltipTrigger>
    <button>Save Document</button>
  </TooltipTrigger>
  <TooltipContent>
    <div className="flex items-center gap-2">
      <span>Save your changes</span>
      <kbd className="ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide bg-surface-2 text-secondary-token">
        ⌘S
      </kbd>
    </div>
  </TooltipContent>
</Tooltip>
```

### Custom Positioning

```tsx
<Tooltip>
  <TooltipTrigger>
    <button>Custom Position</button>
  </TooltipTrigger>
  <TooltipContent side="top" sideOffset={12}>
    <span>Positioned above with custom offset</span>
  </TooltipContent>
</Tooltip>
```

### Without Arrow

```tsx
<Tooltip>
  <TooltipTrigger>
    <button>No Arrow</button>
  </TooltipTrigger>
  <TooltipContent showArrow={false}>
    <span>Tooltip without pointer arrow</span>
  </TooltipContent>
</Tooltip>
```

### Disabled Elements

For disabled elements, wrap them to ensure tooltips work:

```tsx
<Tooltip>
  <TooltipTrigger>
    <span className="inline-block">
      <button disabled className="pointer-events-none">
        Disabled Action
      </button>
    </span>
  </TooltipTrigger>
  <TooltipContent>
    <span>This action is currently unavailable</span>
  </TooltipContent>
</Tooltip>
```

## API Reference

### TooltipProvider

Global provider for tooltip configuration. Place at app level.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `delayDuration` | `number` | `1000` | Delay before showing tooltip (ms) |
| `skipDelayDuration` | `number` | `300` | Skip delay for subsequent tooltips (ms) |

### TooltipContent

The tooltip content with styling and positioning.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `side` | `'top' \| 'right' \| 'bottom' \| 'left'` | `'top'` | Preferred placement |
| `sideOffset` | `number` | `6` | Distance from trigger (px) |
| `showArrow` | `boolean` | `false` | Whether to show the pointer arrow |
| `className` | `string` | - | Additional CSS classes |

### TooltipTrigger

Wraps the element that triggers the tooltip.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `asChild` | `boolean` | `true` | Render as child component |

### SimpleTooltip

Convenience wrapper for common tooltip use cases. Requires `TooltipProvider` in the tree.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `ReactNode` | - | The tooltip content |
| `side` | `'top' \| 'right' \| 'bottom' \| 'left'` | `'top'` | Preferred placement |
| `sideOffset` | `number` | `6` | Distance from trigger (px) |
| `showArrow` | `boolean` | `false` | Whether to show the pointer arrow |
| `className` | `string` | - | Additional CSS classes |
| `children` | `ReactNode` | - | The trigger element |

## Accessibility Guidelines

### ✅ **Do**
- Use tooltips for supplementary information only
- Keep content brief and scannable
- Provide keyboard shortcuts when applicable  
- Wrap disabled elements to ensure tooltip functionality
- Use semantic HTML and proper ARIA labels

### ❌ **Don't**
- Put interactive content inside tooltips
- Use tooltips for critical information
- Replace proper labels with tooltips
- Use tooltips on mobile-only interfaces
- Rely on tooltips for accessibility compliance

## Design Tokens

The tooltip uses Tailwind classes that adapt to light/dark themes:

- **Background**: `bg-surface-3`
- **Text**: `text-primary-token`
- **Border**: `border-transparent`
- **Shadow**: `shadow-[0_4px_12px_rgba(0,0,0,0.4)]`
- **Arrow**: `fill-surface-3`

## Browser Support

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

## Testing

Comprehensive test suite covers:

- Hover and focus interactions
- Keyboard navigation (Tab, Escape)
- ARIA relationship validation
- Arrow display/hiding
- Custom positioning
- Delay timing
- Reduced motion support
- Complex content rendering

Run tests with:
```bash
pnpm test tests/unit/tooltip.test.tsx
```

## Storybook

Interactive examples available in Storybook:

```bash
pnpm run storybook
```

Navigate to "UI/Atoms/Tooltip" to see all variants and examples.
