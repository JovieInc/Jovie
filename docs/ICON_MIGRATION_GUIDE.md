# Icon Migration Guide

This guide explains how to migrate from custom SVG imports and legacy icon systems to the standardized Jovie Icon System using Lucide React and SimpleIcons.

## Overview

The Jovie Icon System uses:
- **Lucide React** for general-purpose UI icons via the `Icon` component
- **SimpleIcons** for social/brand icons via the `SocialIcon` component

## Migration Steps

### 1. Identify Icon Type

Determine what type of icon you're migrating:

```tsx
// Social/brand icon? → Use SocialIcon
if (['spotify', 'instagram', 'twitter', 'youtube', 'facebook'].includes(iconType)) {
  // Use SocialIcon component
}

// General UI icon? → Use Lucide React via Icon
else {
  // Use Icon component with Lucide
}
```

### 2. Replace Custom SVG Imports

**Before:**
```tsx
import CustomIcon from './icons/custom-icon.svg';

<CustomIcon className="h-5 w-5" />
```

**After:**
```tsx
import { Icon } from '@/components/atoms/Icon';

<Icon name="ChevronRight" className="h-5 w-5" />
```

### 3. Replace Direct Heroicons (if any)

**Before:**
```tsx
import { ChevronRightIcon } from '@heroicons/react/24/outline';

<ChevronRightIcon className="h-5 w-5" />
```

**After:**
```tsx
import { Icon } from '@/components/atoms/Icon';

<Icon name="ChevronRight" className="h-5 w-5" />
```

### 4. Replace Direct SimpleIcons Usage

**Before:**
```tsx
import { siSpotify } from 'simple-icons';

<svg className="h-5 w-5" viewBox="0 0 24 24">
  <path d={siSpotify.path} fill="currentColor" />
</svg>
```

**After:**
```tsx
import { SocialIcon } from '@/components/atoms/SocialIcon';

<SocialIcon platform="spotify" className="h-5 w-5" />
```

## Common Icon Mappings

| Custom/Legacy Icon | Lucide React Equivalent |
|-------------------|-------------------------|
| `chevron-right` | `ChevronRight` |
| `x` or `close` | `X` |
| `check` | `Check` |
| `plus` | `Plus` |
| `minus` | `Minus` |
| `trash` | `Trash` |
| `edit` | `Pencil` |
| `search` | `Search` |
| `menu` | `Menu` |
| `home` | `Home` |
| `settings` | `Settings` |
| `bell` | `Bell` |
| `star` | `Star` |
| `heart` | `Heart` |

## Social Platform Mappings

| Platform | SocialIcon Platform Name |
|----------|-------------------------|
| Spotify | `spotify` |
| Instagram | `instagram` |
| Twitter/X | `twitter` or `x` |
| YouTube | `youtube` |
| Facebook | `facebook` |
| Apple Music | `applemusic` |
| SoundCloud | `soundcloud` |
| Bandcamp | `bandcamp` |
| Discord | `discord` |
| Reddit | `reddit` |
| TikTok | `tiktok` |

## Accessibility Updates

When migrating, ensure proper accessibility:

```tsx
// Decorative icon (default)
<Icon name="ChevronRight" className="h-5 w-5" />

// Meaningful icon
<Icon 
  name="Check" 
  className="h-5 w-5" 
  ariaLabel="Success" 
  ariaHidden={false}
/>
```

## Validation

After migration, validate your changes:

```bash
# Run ESLint to check for violations
pnpm lint

# Run icon audit
pnpm audit:icons

# Run tests
pnpm test
```

## Troubleshooting

### Icon Not Found
1. Check [lucide.dev](https://lucide.dev) for available icons
2. Use the correct PascalCase name
3. Check `components/atoms/Icon.tsx` for name resolution logic

### Social Platform Not Supported
1. Check [simpleicons.org](https://simpleicons.org) for platform availability
2. Add the platform to `components/atoms/SocialIcon.tsx` if needed
3. Update the platform mapping

### ESLint Violations
- Fix automatically: `pnpm lint:fix`
- Check specific files: `pnpm exec eslint path/to/file.tsx`

## Resources

- [Lucide React Icons](https://lucide.dev)
- [SimpleIcons](https://simpleicons.org)
- [Icon Standards](./ICON_STANDARDS.md)
- [Icon System](./ICON_SYSTEM.md)

---

*This guide helps migrate to the standardized Jovie Icon System for consistency and maintainability.*
