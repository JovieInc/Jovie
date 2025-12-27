# Accessibility Guidelines

## Overview

This project follows WCAG 2.1 Level AA compliance standards and implements comprehensive accessibility testing across three layers:

1. **Pre-commit validation** - Fast feedback via lint-staged
2. **Storybook component testing** - Visual regression and a11y checks
3. **E2E testing** - Full page WCAG audits with axe-core

## Standards

- **WCAG 2.1 Level AA compliance** (minimum target)
- **Semantic HTML first approach** - Use native elements before ARIA
- **Keyboard navigation** for all interactive elements
- **Screen reader testing** for critical user flows
- **Color contrast ratios** meeting AA standards (4.5:1 for normal text, 3:1 for large text)

## Tools & Infrastructure

### Biome Linting
- **37 accessibility rules** enabled (all as warnings initially)
- Covers ARIA usage, semantic HTML, keyboard navigation, alt text
- Runs on every commit via lint-staged
- Auto-fix available for many violations

### Storybook A11y Addon
- Component-level accessibility testing
- WCAG 2A/2AA compliance checking
- Color contrast validation
- Runs in CI on every PR

### axe-core E2E Testing
- Comprehensive WCAG 2.1 AA page scans
- Tests critical public and authenticated routes
- Generates detailed violation reports
- Optional CI job (runs on `a11y` label or main branch)

## Scripts

All scripts run from `/apps/web`:

```bash
# Run axe-core E2E accessibility audit
pnpm a11y:axe

# Check staged component files for a11y issues
pnpm a11y:check:staged

# Auto-fix safe a11y violations
pnpm a11y:fix

# Auto-fix including unsafe fixes (review diffs!)
pnpm a11y:fix:unsafe

# Generate JSON report of all a11y issues
pnpm a11y:report

# Run all E2E a11y tests (contrast + axe)
pnpm a11y:ci
```

## CI/CD Integration

### Pre-commit Hooks
- Biome a11y rules run on staged `*.{ts,tsx}` files
- Component-specific checks run on `apps/web/components/**/*.{tsx,ts}`
- Violations shown as warnings (don't block commits)

### CI Jobs
1. **Storybook A11y Tests** - Runs on every PR, tests all stories
2. **E2E A11y Audit** - Optional, runs on main or PRs with `a11y` label

## Common Patterns

### Keyboard Navigation
```tsx
// ✅ Good - Interactive elements are keyboard accessible
<button onClick={handleClick} type="button">
  Click me
</button>

// ❌ Bad - Div with click handler is not keyboard accessible
<div onClick={handleClick}>Click me</div>
```

### ARIA Usage
```tsx
// ✅ Good - Use native elements when possible
<button disabled>Submit</button>

// ⚠️ Acceptable - Only use ARIA when native HTML isn't sufficient
<div role="button" aria-disabled="true" tabIndex={0}>
  Submit
</div>
```

### Focus Management
```tsx
// ✅ Good - Manage focus for modals and drawers
useEffect(() => {
  if (isOpen) {
    dialogRef.current?.focus();
  }
}, [isOpen]);
```

### Alt Text
```tsx
// ✅ Good - Descriptive alt text
<img src="artist.jpg" alt="Taylor Swift performing on stage" />

// ❌ Bad - Generic or redundant alt text
<img src="image.jpg" alt="image" />
<img src="photo.jpg" alt="photo of" />
```

### Color Contrast
```tsx
// ✅ Good - High contrast text
<p className="text-gray-900 dark:text-gray-100">
  Readable content
</p>

// ❌ Bad - Low contrast text
<p className="text-gray-400">
  Hard to read
</p>
```

### Semantic HTML
```tsx
// ✅ Good - Use semantic elements
<nav aria-label="Main navigation">
  <ul>
    <li><a href="/home">Home</a></li>
  </ul>
</nav>

// ❌ Bad - Div soup
<div>
  <div onClick={goHome}>Home</div>
</div>
```

## Component Library Standards

### Requirements for New Components
- ✅ Must pass Storybook a11y tests
- ✅ Include a11y test cases (see `UniversalLinkInput.a11y.test.tsx`)
- ✅ Document keyboard interactions in stories
- ✅ Provide focus management examples

### Testing Template
```typescript
// components/__tests__/MyComponent.a11y.test.tsx
import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import { MyComponent } from '../MyComponent';

test('MyComponent meets accessibility standards', () => {
  const { container } = render(<MyComponent />);
  
  // Check for proper ARIA attributes
  expect(container.querySelector('[role="button"]')).toHaveAttribute('aria-label');
  
  // Check keyboard navigation
  expect(container.querySelector('button')).toHaveAttribute('type');
});
```

## Progressive Enforcement Strategy

### Phase 1: Baseline (Weeks 1-2)
- All 37 a11y rules enabled as warnings
- Generate baseline report: `pnpm a11y:report`
- No CI failures, maximum visibility

### Phase 2: Auto-fix (Weeks 3-4)
- Apply safe auto-fixes: `pnpm a11y:fix`
- Review and commit changes
- Track improvement metrics

### Phase 3: Critical Rules to Errors (Month 2)
Upgrade these rules from warnings to errors:
- `useAltText` - Images must have alt text
- `useAriaPropsForRole` - Required ARIA props for roles
- `useValidAriaProps` - Valid ARIA properties only
- `useValidAriaRole` - Valid ARIA roles only
- `useHtmlLang` - HTML element must have lang attribute
- `useIframeTitle` - Iframes must have titles

### Phase 4: Full Enforcement (Month 3+)
- Progressively upgrade remaining rules to errors
- Aim for zero warnings in production
- All new code must pass a11y checks

## Monitoring & Metrics

### Weekly Reports
```bash
# Generate JSON report
pnpm a11y:report

# Track trends:
# - Total violation count
# - Critical violations
# - Warnings by category
```

### CI Metrics
- Storybook a11y test results
- E2E axe-core scan results
- Pre-commit violation counts

### Success Metrics
- **Code coverage**: 100% of components checked
- **Automation**: 3 testing layers active
- **Standards**: WCAG 2.1 AA compliance
- **Developer experience**: <5s pre-commit, <2min CI
- **Quality**: Zero critical violations in production

## Resources

### Documentation
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Biome A11y Rules](https://biomejs.dev/linter/rules/#a11y)
- [axe-core Documentation](https://www.deque.com/axe/core-documentation/)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)

### Tools
- [axe DevTools Browser Extension](https://www.deque.com/axe/devtools/)
- [WAVE Browser Extension](https://wave.webaim.org/extension/)
- [Screen Reader Testing Guide](https://webaim.org/articles/screenreader_testing/)

### Training
- [Web Accessibility by Google](https://www.udacity.com/course/web-accessibility--ud891)
- [Egghead.io A11y Course](https://egghead.io/courses/start-building-accessible-web-applications-today)
