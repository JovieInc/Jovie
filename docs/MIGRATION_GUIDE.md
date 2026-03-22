# Icon System Migration Guide

This guide helps you migrate existing code to follow the new icon standardization system.

## Quick Reference

| Old Pattern | New Pattern | Library |
|-------------|-------------|---------|
| Custom SVG imports | Lucide React import | `lucide-react` |
| Inline SVG elements | Lucide React component | `lucide-react` |
| Direct SimpleIcons | SocialIcon component | `components/atoms/SocialIcon` |
| Inconsistent sizing | Standard size classes | `h-4 w-4`, `h-5 w-5`, etc. |

## Migration Patterns

### 1. Replace Custom SVG Imports with Lucide React

#### Before
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

#### After
```tsx
import { ChevronRight, X, Search } from 'lucide-react';

function MyComponent() {
  return (
    <div>
      <ChevronRight className="h-5 w-5" />
      <X className="h-4 w-4" />
      <Search className="h-5 w-5" />
    </div>
  );
}
```

### 2. Replace Inline SVG with Lucide React

#### Before
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

#### After
```tsx
import { X } from 'lucide-react';

function MyComponent() {
  return (
    <button>
      <X className="h-5 w-5" />
      Close
    </button>
  );
}
```

### 3. Replace Direct SimpleIcons with SocialIcon Component

#### Before
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

#### After
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

#### Before
```tsx
function MyComponent() {
  return (
    <div>
      <ChevronRight className="h-3 w-3" />
      <User className="h-7 w-7" />
      <Search className="w-5 h-4" />
      <X style={{ width: 18, height: 18 }} />
    </div>
  );
}
```

#### After
```tsx
function MyComponent() {
  return (
    <div>
      <ChevronRight className="h-4 w-4" />  {/* Small */}
      <User className="h-6 w-6" />           {/* Large */}
      <Search className="h-5 w-5" />         {/* Medium (default) */}
      <X className="h-4 w-4" />              {/* Small */}
    </div>
  );
}
```

### 5. Add Proper Accessibility Attributes

#### Before
```tsx
function MyComponent() {
  return (
    <button>
      <ChevronRight className="h-5 w-5" />
    </button>
  );
}
```

#### After
```tsx
function MyComponent() {
  return (
    <button>
      <ChevronRight
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
    <CheckCircle
      className="h-5 w-5 text-green-500"
      aria-label="Success"
      aria-hidden="false"
    />
  ) : (
    <XCircle
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
// Before
<button className="p-2 rounded-md border">
  <CustomCloseIcon className="h-4 w-4" />
</button>

// After
import { X } from 'lucide-react';
import { IconButton } from '@/components/atoms/IconButton';

<IconButton ariaLabel="Close dialog">
  <X className="h-4 w-4" />
</IconButton>
```

#### IconBadge Component
```tsx
// Before
<div className="rounded-full bg-yellow-100 p-2">
  <CustomBoltIcon className="h-4 w-4 text-yellow-600" />
</div>

// After
import { Bolt } from 'lucide-react';
import { IconBadge } from '@/components/atoms/IconBadge';

<IconBadge Icon={Bolt} colorVar="--color-yellow-500" />
```

## Common Icon Mappings

Use this table to find the correct Lucide React icon for common use cases:

| Use Case | Old Name/Description | Lucide Icon | Import |
|----------|---------------------|-------------|---------|
| Close/Cancel | `close`, `x`, `cancel` | `X` | `lucide-react` |
| Next/Forward | `next`, `forward`, `right` | `ChevronRight` | `lucide-react` |
| Back/Previous | `back`, `previous`, `left` | `ChevronLeft` | `lucide-react` |
| Add/Create | `add`, `create`, `new` | `Plus` | `lucide-react` |
| Delete/Remove | `delete`, `remove`, `trash` | `Trash2` | `lucide-react` |
| Edit/Modify | `edit`, `modify`, `pencil` | `Pencil` | `lucide-react` |
| Search/Find | `search`, `find`, `magnify` | `Search` | `lucide-react` |
| Settings/Config | `settings`, `config`, `gear` | `Settings` | `lucide-react` |
| Success/Check | `success`, `check`, `done` | `Check` | `lucide-react` |
| Error/Failed | `error`, `failed`, `wrong` | `XCircle` | `lucide-react` |
| Warning/Alert | `warning`, `alert`, `caution` | `AlertTriangle` | `lucide-react` |
| Info/Help | `info`, `help`, `question` | `Info` | `lucide-react` |
| User/Profile | `user`, `profile`, `account` | `User` | `lucide-react` |
| Home/Dashboard | `home`, `dashboard`, `house` | `Home` | `lucide-react` |
| Menu/Navigation | `menu`, `hamburger`, `bars` | `Menu` | `lucide-react` |
| Share/Export | `share`, `export`, `send` | `Share` | `lucide-react` |
| Download/Save | `download`, `save`, `arrow-down` | `Download` | `lucide-react` |
| Upload/Import | `upload`, `import`, `arrow-up` | `Upload` | `lucide-react` |

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
Replace custom SVG imports with Lucide React:
- Browse [lucide.dev](https://lucide.dev) for available icons
- Use the mapping table above for common patterns
- Import from `lucide-react`

### 4. Replace Inline SVGs
- Identify the purpose of each inline SVG
- Find the equivalent Lucide React icon
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

### Icon Not Found in Lucide React
1. Browse [lucide.dev](https://lucide.dev) for alternatives
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
- **Lucide React**: [lucide.dev](https://lucide.dev)
- **SimpleIcons**: [simpleicons.org](https://simpleicons.org)
- **Issues**: Create a GitHub issue with the `icon-request` label

---

*This migration guide ensures a smooth transition to the standardized icon system while maintaining code quality and accessibility standards.*
