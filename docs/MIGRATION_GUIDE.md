# Icon System Migration Guide

This guide helps you migrate existing code to follow the new icon standardization system.

## Quick Reference

| Old Pattern | New Pattern | Library |
|-------------|-------------|---------|
| Custom SVG imports | Heroicons import | `@heroicons/react` |
| Inline SVG elements | Heroicons component | `@heroicons/react` |
| Direct SimpleIcons | SocialIcon component | `components/atoms/SocialIcon` |
| Inconsistent sizing | Standard size classes | `h-4 w-4`, `h-5 w-5`, etc. |

## Migration Patterns

### 1. Replace Custom SVG Imports with Heroicons

#### ❌ Before
```tsx
import ChevronIcon from './icons/chevron.svg';
import CloseIcon from './icons/close.svg';
import SearchIcon from './icons/search.svg';

function MyComponent() {
  return (
    <div>
      <ChevronIcon className="h-5 w-5" />
      <CloseIcon className="h-4 w-4" />
      <SearchIcon className="h-5 w-5" />
    </div>
  );
}
```

#### ✅ After
```tsx
import { 
  ChevronRightIcon, 
  XMarkIcon, 
  MagnifyingGlassIcon 
} from '@heroicons/react/24/outline';

function MyComponent() {
  return (
    <div>
      <ChevronRightIcon className="h-5 w-5" />
      <XMarkIcon className="h-4 w-4" />
      <MagnifyingGlassIcon className="h-5 w-5" />
    </div>
  );
}
```

### 2. Replace Inline SVG with Heroicons

#### ❌ Before
```tsx
function MyComponent() {
  return (
    <button>
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
      Close
    </button>
  );
}
```

#### ✅ After
```tsx
import { XMarkIcon } from '@heroicons/react/24/outline';

function MyComponent() {
  return (
    <button>
      <XMarkIcon className="h-5 w-5" />
      Close
    </button>
  );
}
```

### 3. Replace Direct SimpleIcons with SocialIcon Component

#### ❌ Before
```tsx
import { siSpotify, siInstagram, siTwitter } from 'simple-icons';

function SocialLinks() {
  return (
    <div>
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path d={siSpotify.path} fill="currentColor" />
      </svg>
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path d={siInstagram.path} fill="currentColor" />
      </svg>
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path d={siTwitter.path} fill="currentColor" />
      </svg>
    </div>
  );
}
```

#### ✅ After
```tsx
import { SocialIcon } from '@/components/atoms/SocialIcon';

function SocialLinks() {
  return (
    <div>
      <SocialIcon platform="spotify" className="h-5 w-5" />
      <SocialIcon platform="instagram" className="h-5 w-5" />
      <SocialIcon platform="twitter" className="h-5 w-5" />
    </div>
  );
}
```

### 4. Standardize Icon Sizing

#### ❌ Before
```tsx
function MyComponent() {
  return (
    <div>
      <ChevronRightIcon className="h-3 w-3" />
      <UserIcon className="h-7 w-7" />
      <SearchIcon className="w-5 h-4" />
      <CloseIcon style={{ width: 18, height: 18 }} />
    </div>
  );
}
```

#### ✅ After
```tsx
function MyComponent() {
  return (
    <div>
      <ChevronRightIcon className="h-4 w-4" />  {/* Small */}
      <UserIcon className="h-6 w-6" />          {/* Large */}
      <SearchIcon className="h-5 w-5" />        {/* Medium (default) */}
      <XMarkIcon className="h-4 w-4" />         {/* Small */}
    </div>
  );
}
```

### 5. Add Proper Accessibility Attributes

#### ❌ Before
```tsx
function MyComponent() {
  return (
    <button>
      <ChevronRightIcon className="h-5 w-5" />
    </button>
  );
}
```

#### ✅ After
```tsx
function MyComponent() {
  return (
    <button>
      <ChevronRightIcon 
        className="h-5 w-5" 
        aria-hidden="true" 
      />
      <span className="sr-only">Next page</span>
    </button>
  );
}

// Or for meaningful icons:
function StatusIcon({ status }: { status: 'success' | 'error' }) {
  return status === 'success' ? (
    <CheckCircleIcon 
      className="h-5 w-5 text-green-500" 
      aria-label="Success"
      aria-hidden="false"
    />
  ) : (
    <XCircleIcon 
      className="h-5 w-5 text-red-500" 
      aria-label="Error"
      aria-hidden="false"
    />
  );
}
```

### 6. Use Icon Components with Existing Patterns

#### IconButton Component
```tsx
// ❌ Before
<button className="p-2 rounded-md border">
  <CustomCloseIcon className="h-4 w-4" />
</button>

// ✅ After
import { XMarkIcon } from '@heroicons/react/24/outline';
import { IconButton } from '@/components/atoms/IconButton';

<IconButton ariaLabel="Close dialog">
  <XMarkIcon className="h-4 w-4" />
</IconButton>
```

#### IconBadge Component
```tsx
// ❌ Before
<div className="rounded-full bg-yellow-100 p-2">
  <CustomBoltIcon className="h-4 w-4 text-yellow-600" />
</div>

// ✅ After
import { BoltIcon } from '@heroicons/react/24/outline';
import { IconBadge } from '@/components/atoms/IconBadge';

<IconBadge Icon={BoltIcon} colorVar="--color-yellow-500" />
```

## Common Icon Mappings

Use this table to find the correct Heroicon for common use cases:

| Use Case | Old Name/Description | Heroicon | Import |
|----------|---------------------|----------|---------|
| Close/Cancel | `close`, `x`, `cancel` | `XMarkIcon` | `@heroicons/react/24/outline` |
| Next/Forward | `next`, `forward`, `right` | `ChevronRightIcon` | `@heroicons/react/24/outline` |
| Back/Previous | `back`, `previous`, `left` | `ChevronLeftIcon` | `@heroicons/react/24/outline` |
| Add/Create | `add`, `create`, `new` | `PlusIcon` | `@heroicons/react/24/outline` |
| Delete/Remove | `delete`, `remove`, `trash` | `TrashIcon` | `@heroicons/react/24/outline` |
| Edit/Modify | `edit`, `modify`, `pencil` | `PencilIcon` | `@heroicons/react/24/outline` |
| Search/Find | `search`, `find`, `magnify` | `MagnifyingGlassIcon` | `@heroicons/react/24/outline` |
| Settings/Config | `settings`, `config`, `gear` | `CogIcon` | `@heroicons/react/24/outline` |
| Success/Check | `success`, `check`, `done` | `CheckIcon` | `@heroicons/react/24/outline` |
| Error/Failed | `error`, `failed`, `wrong` | `XCircleIcon` | `@heroicons/react/24/outline` |
| Warning/Alert | `warning`, `alert`, `caution` | `ExclamationTriangleIcon` | `@heroicons/react/24/outline` |
| Info/Help | `info`, `help`, `question` | `InformationCircleIcon` | `@heroicons/react/24/outline` |
| User/Profile | `user`, `profile`, `account` | `UserIcon` | `@heroicons/react/24/outline` |
| Home/Dashboard | `home`, `dashboard`, `house` | `HomeIcon` | `@heroicons/react/24/outline` |
| Menu/Navigation | `menu`, `hamburger`, `bars` | `Bars3Icon` | `@heroicons/react/24/outline` |
| Share/Export | `share`, `export`, `send` | `ShareIcon` | `@heroicons/react/24/outline` |
| Download/Save | `download`, `save`, `arrow-down` | `ArrowDownTrayIcon` | `@heroicons/react/24/outline` |
| Upload/Import | `upload`, `import`, `arrow-up` | `ArrowUpTrayIcon` | `@heroicons/react/24/outline` |

## Social Platform Mappings

| Platform | SocialIcon Platform Value |
|----------|---------------------------|
| Spotify | `spotify` |
| Apple Music | `applemusic` or `apple_music` |
| Instagram | `instagram` |
| Twitter/X | `twitter` or `x` |
| TikTok | `tiktok` |
| YouTube | `youtube` |
| Facebook | `facebook` |
| SoundCloud | `soundcloud` |
| Bandcamp | `bandcamp` |
| Discord | `discord` |
| Reddit | `reddit` |
| GitHub | `github` |
| Patreon | `patreon` |

## Migration Tools

### 1. ESLint Rule
The `@jovie/icon-usage` ESLint rule will catch violations:

```bash
pnpm lint
```

### 2. Icon Audit Script
Run the audit script to find all icon usage issues:

```bash
pnpm audit:icons
```

### 3. Search and Replace Patterns

Use these regex patterns in your IDE for bulk replacements:

#### Find Custom SVG Imports
```regex
import\s+\w+\s+from\s+['"][^'"]*\.svg['"];?
```

#### Find Inline SVG Elements
```regex
<svg[\s\S]*?</svg>
```

#### Find Direct SimpleIcons Usage
```regex
import\s+.*?\s+from\s+['"]simple-icons['"];?
```

## Step-by-Step Migration Process

### 1. Run the Audit
```bash
pnpm audit:icons
```

### 2. Fix ESLint Violations
```bash
pnpm lint
```

### 3. Update Imports
Replace custom SVG imports with Heroicons:
- Check the [Heroicons website](https://heroicons.com) for available icons
- Use the mapping table above for common patterns
- Import from `@heroicons/react/24/outline` or `@heroicons/react/24/solid`

### 4. Replace Inline SVGs
- Identify the purpose of each inline SVG
- Find the equivalent Heroicon
- Replace with the appropriate import and component

### 5. Update Social Icons
- Replace direct SimpleIcons usage with `SocialIcon` component
- Use the platform mapping table above

### 6. Standardize Sizing
- Use standard size classes: `h-4 w-4`, `h-5 w-5`, `h-6 w-6`, `h-8 w-8`
- Remove inline styles for sizing

### 7. Add Accessibility
- Add `aria-hidden="true"` for decorative icons
- Add `aria-label` for meaningful icons
- Use `aria-hidden="false"` when providing labels

### 8. Test Changes
```bash
pnpm test
pnpm lint
pnpm audit:icons
```

## Troubleshooting

### Icon Not Found in Heroicons
1. Check the [Heroicons website](https://heroicons.com) for alternatives
2. Search the icon registry: `searchIcons('keyword')`
3. Consider if it should be a social icon using `SocialIcon`
4. If truly unique, follow the custom SVG approval process

### ESLint Rule False Positives
If the ESLint rule incorrectly flags legitimate usage:
1. Check if the file should be in the allowed list
2. Add the file to `ALLOWED_DIRECT_SVG_FILES` in `eslint-rules/icon-usage.js`
3. Document the exception in the PR

### SocialIcon Platform Not Supported
If you need a social platform that's not supported:
1. Check if it exists in SimpleIcons
2. Add it to the `platformMap` in `components/atoms/SocialIcon.tsx`
3. Update the TypeScript types in `lib/icons/types.ts`

### Performance Concerns
The new system is optimized for performance:
- Tree-shaking eliminates unused icons
- Consistent imports improve bundling
- No duplicate icon definitions

## Getting Help

- **Documentation**: [docs/ICON_STANDARDS.md](./ICON_STANDARDS.md)
- **Design Review**: [docs/DESIGN_REVIEW_CHECKLIST.md](./DESIGN_REVIEW_CHECKLIST.md)
- **Heroicons**: [heroicons.com](https://heroicons.com)
- **SimpleIcons**: [simpleicons.org](https://simpleicons.org)
- **Issues**: Create a GitHub issue with the `icon-request` label

---

*This migration guide ensures a smooth transition to the standardized icon system while maintaining code quality and accessibility standards.*

