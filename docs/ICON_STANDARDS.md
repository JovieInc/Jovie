# Icon System Standards

## Overview

This document defines the standardized approach to icon usage in the Jovie project. Following these standards ensures consistency, maintainability, and optimal bundle size across the application.

## Icon Libraries

### 1. Heroicons v2 - General Purpose Icons

**Use for:** All general-purpose UI icons (navigation, actions, states, etc.)

```tsx
import { ChevronRightIcon, XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';
import { HeartIcon, StarIcon } from '@heroicons/react/24/solid';

// ✅ Correct usage
<ChevronRightIcon className="h-5 w-5" />
<XMarkIcon className="h-4 w-4" />
```

**Common categories:**
- Navigation: `ChevronRightIcon`, `ArrowLeftIcon`, `HomeIcon`
- Actions: `PlusIcon`, `TrashIcon`, `PencilIcon`, `ShareIcon`
- States: `CheckIcon`, `XMarkIcon`, `ExclamationTriangleIcon`
- UI Elements: `Bars3Icon`, `MagnifyingGlassIcon`, `CogIcon`

### 2. SimpleIcons - Social Media, DSP, and Brand Icons

**Use for:** All social media platforms, digital service providers (DSPs), and brand-specific icons

```tsx
import { siSpotify, siInstagram, siApplemusic } from 'simple-icons';

// ✅ Correct usage - use the existing SocialIcon component
<SocialIcon platform="spotify" className="h-5 w-5" />
<SocialIcon platform="instagram" className="h-4 w-4" />
```

**Supported platforms:** (see `components/atoms/SocialIcon.tsx` for full list)
- Music DSPs: `spotify`, `applemusic`, `soundcloud`, `bandcamp`
- Social Media: `instagram`, `twitter`, `tiktok`, `youtube`, `facebook`
- Other: `discord`, `reddit`, `pinterest`, `github`, `patreon`

### 3. Custom SVGs - Only When Necessary

**Use for:** Brand logos, unique UI elements that don't exist in the above libraries

```tsx
// ✅ Acceptable custom SVG usage
<img src="/brand/jovie-logo.svg" alt="Jovie" />

// ✅ Inline SVG for unique UI elements (with proper justification)
<svg className="h-6 w-6" viewBox="0 0 24 24">
  {/* Custom path for unique Jovie-specific icon */}
</svg>
```

**Approval required for:**
- New custom SVG icons
- Inline SVG elements
- Icons that could potentially be replaced with Heroicons or SimpleIcons

## Decision Tree

```
Need an icon?
├── Is it a social media/DSP/brand icon?
│   ├── Yes → Use SimpleIcons via SocialIcon component
│   └── No → Continue
├── Is it a general UI icon (navigation, actions, states)?
│   ├── Yes → Use Heroicons v2
│   └── No → Continue
├── Is it the Jovie brand logo or unique brand element?
│   ├── Yes → Use custom SVG (approved)
│   └── No → Continue
└── Does an equivalent exist in Heroicons?
    ├── Yes → Use Heroicons v2
    ├── No → Request approval for custom SVG
    └── Unsure → Ask in #design channel
```

## Component Usage Patterns

### IconButton Component

```tsx
import { CogIcon } from '@heroicons/react/24/outline';

<IconButton ariaLabel="Settings">
  <CogIcon className="h-4 w-4" />
</IconButton>
```

### IconBadge Component

```tsx
import { BoltIcon } from '@heroicons/react/24/outline';

<IconBadge Icon={BoltIcon} colorVar="--color-yellow-500" />
```

### SocialIcon Component

```tsx
// For social media, DSP, and brand icons
<SocialIcon platform="spotify" className="h-5 w-5" />
<SocialIcon platform="instagram" size={20} />
```

## Enforcement

### ESLint Rules

The following ESLint rule enforces these standards:

- `@jovie/icon-usage`: Prevents direct SVG imports and inline SVG usage without approval
- Provides helpful error messages guiding to correct icon libraries
- Maintains allowlist for approved custom SVGs

### Pre-commit Hooks

Icon usage validation runs automatically on:
- Pre-commit (via native Git hooks)
- CI/CD pipeline
- Pre-push workflow

## Exceptions and Approval Process

### Approved Custom SVGs

Current approved custom SVGs:
- `/brand/jovie-logo.svg` - Main brand logo
- `/brand/Jovie-Logo-Icon.svg` - Icon version of logo
- Unique UI elements in specific components (documented inline)

### Requesting New Custom SVGs

1. Check if equivalent exists in Heroicons or SimpleIcons
2. Create GitHub issue with `icon-request` label
3. Include:
   - Use case and context
   - Why existing libraries don't meet the need
   - Proposed SVG or design mockup
4. Get approval from design team
5. Add to approved list in ESLint configuration

## Migration Guide

### From Custom SVGs to Standard Libraries

```tsx
// ❌ Before - custom SVG
<svg className="h-5 w-5" viewBox="0 0 24 24">
  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
</svg>

// ✅ After - Heroicons
import { StarIcon } from '@heroicons/react/24/solid';
<StarIcon className="h-5 w-5" />
```

### From Direct SimpleIcons to SocialIcon Component

```tsx
// ❌ Before - direct SimpleIcons usage
import { siSpotify } from 'simple-icons';
<svg className="h-5 w-5" viewBox="0 0 24 24">
  <path d={siSpotify.path} fill="currentColor" />
</svg>

// ✅ After - SocialIcon component
<SocialIcon platform="spotify" className="h-5 w-5" />
```

## Best Practices

1. **Consistency**: Always use the same icon for the same concept across the app
2. **Size Standards**: Use consistent sizing (`h-4 w-4`, `h-5 w-5`, `h-6 w-6`)
3. **Accessibility**: Always include proper `aria-label` or `aria-hidden` attributes
4. **Performance**: Prefer the established components over direct imports
5. **Documentation**: Document any new custom SVG usage with justification

## Troubleshooting

### Common ESLint Errors

**Error**: `Direct SVG import detected. Use Heroicons for general UI icons.`
**Solution**: Replace with appropriate Heroicon import

**Error**: `Inline SVG detected. Use SocialIcon component for social media icons.`
**Solution**: Use `<SocialIcon platform="..." />` instead

**Error**: `Custom SVG usage requires approval. See docs/ICON_STANDARDS.md`
**Solution**: Follow the approval process or use standard library alternative

### Finding the Right Icon

1. **Heroicons**: Browse at [heroicons.com](https://heroicons.com)
2. **SimpleIcons**: Browse at [simpleicons.org](https://simpleicons.org)
3. **Existing Usage**: Search codebase for similar use cases
4. **Ask for Help**: Use #design channel for guidance

## Resources

- [Heroicons Documentation](https://heroicons.com)
- [SimpleIcons Documentation](https://simpleicons.org)
- [Existing SocialIcon Component](../components/atoms/SocialIcon.tsx)
- [IconButton Component](../components/atoms/IconButton.tsx)
- [IconBadge Component](../components/atoms/IconBadge.tsx)

