# Design Review Checklist

## Icon Usage Standards ✅

When reviewing PRs or design implementations, ensure the following icon standards are met:

### 1. Icon Library Usage

- [ ] **General UI icons use Heroicons v2**
  - Navigation icons (chevrons, arrows, home, menu)
  - Action icons (plus, edit, delete, share, search, settings)
  - State icons (check, error, warning, info)
  - Content icons (star, heart, bell, document, photo)

- [ ] **Social/Brand icons use SocialIcon component**
  - Social media platforms (Instagram, Twitter/X, TikTok, YouTube, Facebook)
  - Music DSPs (Spotify, Apple Music, SoundCloud, Bandcamp)
  - Other platforms (Discord, Reddit, GitHub, Patreon)

- [ ] **Custom SVGs are approved and necessary**
  - Brand logos (Jovie logo variants)
  - Unique UI elements that don't exist in standard libraries
  - Have proper approval documentation

### 2. Implementation Patterns

- [ ] **No direct SVG imports** (except approved custom SVGs)
  ```tsx
  // ❌ Avoid
  import CustomIcon from './icon.svg';
  
  // ✅ Use instead
  import { ChevronRightIcon } from '@heroicons/react/24/outline';
  ```

- [ ] **No inline SVG elements** (except in approved components)
  ```tsx
  // ❌ Avoid
  <svg className="h-5 w-5">...</svg>
  
  // ✅ Use instead
  <ChevronRightIcon className="h-5 w-5" />
  ```

- [ ] **No direct SimpleIcons usage** (use SocialIcon component)
  ```tsx
  // ❌ Avoid
  import { siSpotify } from 'simple-icons';
  
  // ✅ Use instead
  <SocialIcon platform="spotify" className="h-5 w-5" />
  ```

### 3. Accessibility Standards

- [ ] **Proper ARIA attributes**
  ```tsx
  // For decorative icons
  <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
  
  // For meaningful icons
  <CheckIcon className="h-5 w-5" aria-label="Success" aria-hidden="false" />
  ```

- [ ] **Consistent sizing**
  - Small: `h-4 w-4`
  - Medium: `h-5 w-5` (default)
  - Large: `h-6 w-6`
  - Extra large: `h-8 w-8`

### 4. Component Usage

- [ ] **IconButton component** for icon-only buttons
  ```tsx
  <IconButton ariaLabel="Settings">
    <CogIcon className="h-4 w-4" />
  </IconButton>
  ```

- [ ] **IconBadge component** for icon badges
  ```tsx
  <IconBadge Icon={BoltIcon} colorVar="--color-yellow-500" />
  ```

- [ ] **SocialIcon component** for social/brand icons
  ```tsx
  <SocialIcon platform="spotify" className="h-5 w-5" />
  ```

### 5. Code Quality

- [ ] **ESLint rules pass** (no `@jovie/icon-usage` violations)
- [ ] **TypeScript types are correct**
- [ ] **No console warnings** about missing icons
- [ ] **Performance considerations** (no unnecessary icon imports)

## Custom SVG Approval Process

If a PR introduces new custom SVG usage:

### 1. Justification Required

- [ ] **Explanation provided** for why standard libraries don't meet the need
- [ ] **Design rationale** documented
- [ ] **Alternative solutions considered** and documented

### 2. Technical Review

- [ ] **SVG is optimized** (minimal file size, clean markup)
- [ ] **Accessibility attributes** included
- [ ] **Consistent with design system** (sizing, styling)
- [ ] **Added to approved list** in ESLint configuration

### 3. Design Team Approval

- [ ] **Design team sign-off** obtained
- [ ] **Brand guidelines compliance** verified
- [ ] **Future maintenance plan** considered

## Common Issues and Solutions

### ❌ Direct SVG Import
```tsx
import CustomChevron from './chevron.svg';
<CustomChevron className="h-5 w-5" />
```

### ✅ Use Heroicons
```tsx
import { ChevronRightIcon } from '@heroicons/react/24/outline';
<ChevronRightIcon className="h-5 w-5" />
```

---

### ❌ Inline Social Icon
```tsx
<svg className="h-5 w-5" viewBox="0 0 24 24">
  <path d="spotify-path-data" />
</svg>
```

### ✅ Use SocialIcon Component
```tsx
<SocialIcon platform="spotify" className="h-5 w-5" />
```

---

### ❌ Inconsistent Sizing
```tsx
<ChevronRightIcon className="h-3 w-3" />
<UserIcon className="h-7 w-7" />
<SearchIcon className="w-5 h-4" />
```

### ✅ Standard Sizes
```tsx
<ChevronRightIcon className="h-4 w-4" />
<UserIcon className="h-6 w-6" />
<SearchIcon className="h-5 w-5" />
```

## Resources

- **Icon Standards Documentation**: [docs/ICON_STANDARDS.md](./ICON_STANDARDS.md)
- **Heroicons Browser**: [heroicons.com](https://heroicons.com)
- **SimpleIcons Browser**: [simpleicons.org](https://simpleicons.org)
- **SocialIcon Component**: [components/atoms/SocialIcon.tsx](../components/atoms/SocialIcon.tsx)
- **Icon Audit Script**: `npm run audit:icons`

## Automated Checks

The following automated checks help enforce these standards:

1. **ESLint Rule**: `@jovie/icon-usage` catches violations during development
2. **Pre-commit Hooks**: Prevent commits with icon violations
3. **CI/CD Pipeline**: Blocks PRs with icon standard violations
4. **Icon Audit Script**: `scripts/audit-icons.js` for comprehensive analysis

## Review Workflow

1. **Developer** implements feature following icon standards
2. **ESLint** catches violations during development
3. **Pre-commit hooks** prevent commits with violations
4. **CI/CD** validates compliance in PR
5. **Reviewer** uses this checklist during PR review
6. **Design team** approves any custom SVG requests
7. **Merge** only after all standards are met

---

*This checklist ensures consistent, accessible, and maintainable icon usage across the Jovie application.*

