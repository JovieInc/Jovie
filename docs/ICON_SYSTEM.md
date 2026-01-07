# Jovie Icon System

A comprehensive, standardized icon system that ensures consistency, accessibility, and maintainability across the Jovie application.

## Overview

The Jovie Icon System enforces the use of two primary icon libraries:
- **Lucide React** for general-purpose UI icons
- **SimpleIcons** for social media, DSP, and brand icons

Custom SVGs are only allowed for approved use cases like brand logos and unique UI elements.

## Quick Start

### For General UI Icons
```tsx
import { Icon } from '@/components/atoms/Icon';

<Icon name="ChevronRight" className="h-5 w-5" />
<Icon name="X" className="h-4 w-4" />
<Icon name="Check" className="h-6 w-6" />
```

### For Social/Brand Icons
```tsx
import { SocialIcon } from '@/components/atoms/SocialIcon';

<SocialIcon platform="spotify" className="h-5 w-5" />
<SocialIcon platform="instagram" className="h-4 w-4" />
<SocialIcon platform="twitter" className="h-6 w-6" />
```

### Using the Unified Icon Component
```tsx
import { Icon } from '@/components/atoms/Icon';

<Icon name="chevron-right" className="h-5 w-5" />
<Icon name="check-circle" className="h-6 w-6 text-green-500" />
```

## Architecture

### Core Components

1. **Icon Registry** (`lib/icons/registry.ts`)
   - Centralized registry of all available icons
   - Categorized by purpose (navigation, action, state, etc.)
   - Searchable with keywords and descriptions

2. **Type Definitions** (`lib/icons/types.ts`)
   - TypeScript interfaces for all icon-related types
   - Ensures type safety across the application

3. **Utility Functions** (`lib/icons/index.ts`)
   - Helper functions for icon management
   - Size utilities and icon lookup functions

4. **Icon Components**
   - `Icon` - Unified icon component with registry lookup
   - `SocialIcon` - Enhanced social media icon component
   - `IconButton` - Icon-only button component
   - `IconBadge` - Icon with colored background

### Enforcement Mechanisms

1. **ESLint Rule** (`eslint-rules/icon-usage.js`)
   - Prevents direct SVG imports and inline SVG usage
   - Guides developers to use correct icon libraries
   - Maintains allowlist for approved custom SVGs

2. **Pre-commit Hooks**
   - Runs icon validation before commits
   - Prevents non-compliant code from entering the repository

3. **CI/CD Integration**
   - Validates icon usage in pull requests
   - Blocks merges with icon standard violations

4. **Audit Script** (`scripts/audit-icons.js`)
   - Comprehensive analysis of icon usage across the codebase
   - Identifies violations and provides suggestions

## Icon Categories

### Navigation Icons
- Chevrons, arrows, home, menu
- Used for navigation and directional indicators

### Action Icons
- Plus, edit, delete, share, search, settings
- Used for user actions and interactions

### State Icons
- Check, error, warning, info
- Used to indicate status or state

### Content Icons
- Star, heart, bell, document, photo
- Used for content representation

### Social/Brand Icons
- Platform-specific icons from SimpleIcons
- Spotify, Instagram, Twitter, YouTube, etc.

## Size Standards

| Size | Class | Use Case |
|------|-------|----------|
| Small | `h-4 w-4` | Inline text, compact UI |
| Medium | `h-5 w-5` | Default size, most common |
| Large | `h-6 w-6` | Prominent actions, headers |
| Extra Large | `h-8 w-8` | Hero sections, large buttons |

## Accessibility

### ARIA Attributes
```tsx
// Decorative icons (default)
<Icon name="ChevronRight" className="h-5 w-5" />

// Meaningful icons
<Icon 
  name="Check" 
  className="h-5 w-5" 
  ariaLabel="Success" 
  ariaHidden={false}
/>
```

### Screen Reader Support
- Decorative icons are hidden from screen readers
- Meaningful icons have descriptive labels
- Button icons include proper button labels

## Development Workflow

### 1. Choose the Right Icon
```
Need an icon?
├── Social/Brand? → Use SocialIcon component
├── General UI? → Use Lucide React via Icon component
├── Brand logo? → Use approved custom SVG
└── Unique element? → Request custom SVG approval
```

### 2. Implementation
```tsx
// Step 1: Import the Icon component
import { Icon } from '@/components/atoms/Icon';

// Step 2: Use with standard sizing
<Icon name="ChevronRight" className="h-5 w-5" />

// Step 3: Add accessibility if needed
<Icon 
  name="ChevronRight"
  className="h-5 w-5" 
  ariaLabel="Next page"
  ariaHidden={false}
/>
```

### 3. Validation
```bash
# Check for violations
pnpm lint

# Run comprehensive audit
pnpm audit:icons

# Run tests
pnpm test
```

## Custom SVG Approval Process

### When Custom SVGs Are Allowed
1. **Brand logos** (Jovie logo variants)
2. **Unique UI elements** not available in standard libraries
3. **Specialized graphics** that serve specific business needs

### Approval Requirements
1. **Justification** - Why standard libraries don't meet the need
2. **Design review** - Approval from design team
3. **Technical review** - SVG optimization and accessibility
4. **Documentation** - Added to approved list and documented

### Implementation
```tsx
// Approved custom SVG usage
<img src="/brand/jovie-logo.svg" alt="Jovie" className="h-8 w-8" />
```

## Performance Considerations

### Tree Shaking
- Only imported icons are included in the bundle
- Unused icons are automatically removed

### Bundle Size
- Lucide React: ~1KB per icon (optimized)
- SimpleIcons: ~500B per icon (optimized)
- Custom SVGs: Varies (should be optimized)

### Caching
- Icon components are cached by React
- SVG assets are cached by the browser

## Testing

### Unit Tests
```tsx
import { render, screen } from '@testing-library/react';
import { Icon } from '@/components/atoms/Icon';

test('renders icon correctly', () => {
  render(<Icon name="chevron-right" />);
  expect(screen.getByTestId('chevron-right-icon')).toBeInTheDocument();
});
```

### Visual Regression Tests
- Storybook stories for all icon components
- Visual testing with Chromatic (if configured)

### Accessibility Tests
- Screen reader compatibility
- Keyboard navigation
- Color contrast validation

## Monitoring and Maintenance

### Metrics
- Bundle size impact of icon usage
- Performance metrics for icon-heavy pages
- Accessibility compliance scores

### Regular Audits
```bash
# Monthly icon usage audit
pnpm audit:icons

# Check for new violations
pnpm lint

# Update dependencies
pnpm update lucide-react simple-icons
```

### Version Updates
1. **Lucide React Updates**
   - Check for new icons and deprecations
   - Update icon registry if needed
   - Test for breaking changes

2. **SimpleIcons Updates**
   - Check for new platforms and brand updates
   - Update SocialIcon component mapping
   - Verify existing icons still work

## Troubleshooting

### Common Issues

#### ESLint Violations
```bash
# Fix automatically where possible
pnpm lint:fix

# Check specific files
pnpm exec eslint path/to/file.tsx
```

#### Icon Not Found
1. Check Lucide React website for alternatives
2. Search components for similar usage
3. Consider SocialIcon for social/brand icons
4. Request custom SVG if truly unique

#### Performance Issues
1. Check bundle analyzer for icon usage
2. Ensure tree shaking is working
3. Consider lazy loading for large icon sets

#### Accessibility Issues
1. Add proper ARIA attributes
2. Test with screen readers
3. Ensure sufficient color contrast

### Getting Help

- **Documentation**: Complete guides in `docs/` folder
- **Code Examples**: Storybook stories and tests
- **Design System**: Figma components (if available)
- **Support**: GitHub issues with `icon-request` label

## Migration from Legacy System

See [ICON_MIGRATION_GUIDE.md](./ICON_MIGRATION_GUIDE.md) for detailed migration instructions.

## Contributing

### Adding New Icons to Registry
1. Verify icon exists in Lucide React
2. Add to `components/atoms/Icon.tsx` if needed
3. Include proper categorization and keywords
4. Add tests for new icons
5. Update documentation

### Requesting New Social Platforms
1. Verify platform exists in SimpleIcons
2. Add to `components/atoms/SocialIcon.tsx`
3. Update TypeScript types
4. Add tests and documentation

### Proposing Changes
1. Create GitHub issue with proposal
2. Include use cases and justification
3. Get design team approval if needed
4. Implement with tests and documentation

## Resources

- **Standards**: [ICON_STANDARDS.md](./ICON_STANDARDS.md)
- **Migration**: [ICON_MIGRATION_GUIDE.md](./ICON_MIGRATION_GUIDE.md)
- **Review Checklist**: [DESIGN_REVIEW_CHECKLIST.md](./DESIGN_REVIEW_CHECKLIST.md)
- **Lucide React**: [lucide.dev](https://lucide.dev)
- **SimpleIcons**: [simpleicons.org](https://simpleicons.org)
- **Accessibility**: [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

*The Jovie Icon System ensures consistent, accessible, and maintainable icon usage across the entire application while providing excellent developer experience and performance.*

