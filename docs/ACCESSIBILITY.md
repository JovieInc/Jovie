# Accessibility Guidelines

## Overview

This document outlines our accessibility (a11y) standards, tools, and processes to ensure Jovie meets WCAG 2.1 Level AA compliance.

## Standards

- **WCAG 2.1 Level AA compliance** (minimum target)
- **Semantic HTML first** - use native HTML elements whenever possible
- **Keyboard navigation** for all interactive elements
- **Screen reader compatibility** for critical user flows
- **Color contrast** ratios that meet WCAG AA standards (4.5:1 for normal text, 3:1 for large text)

## Tools

### Automated Linting

**Biome a11y rules** (37 rules enabled as warnings)
- Runs on every file save and commit via lint-staged
- Covers ARIA usage, semantic HTML, keyboard interactions
- Configuration: [`biome.json`](../biome.json)

**Available scripts:**
```bash
# Check a11y violations (warnings only)
pnpm a11y:check:staged

# Auto-fix safe violations
pnpm a11y:fix

# Auto-fix including unsafe changes (review diffs carefully!)
pnpm a11y:fix:unsafe

# Generate JSON report for tracking progress
pnpm a11y:report
```

### Component Testing

**Storybook a11y addon**
- Integrated axe-core scanning on all stories
- Tests WCAG 2A/2AA compliance + color contrast
- Automatically runs in CI on every PR
- Configuration: [`apps/web/.storybook/preview.tsx`](../apps/web/.storybook/preview.tsx)

**Run locally:**
```bash
pnpm --filter=@jovie/web run storybook
# Open http://localhost:6006 and check the "Accessibility" tab
```

### E2E Testing

**axe-core Playwright integration**
- Full WCAG 2.1 Level AA scanning
- Tests critical user flows on real pages
- Configuration: [`apps/web/tests/e2e/axe-audit.spec.ts`](../apps/web/tests/e2e/axe-audit.spec.ts)

**Run locally:**
```bash
pnpm --filter=@jovie/web run a11y:axe
```

**Contrast audit** (custom implementation)
- Validates color contrast across light/dark themes
- Tests both public and authenticated routes
- Configuration: [`apps/web/tests/e2e/accessibility-audit.spec.ts`](../apps/web/tests/e2e/accessibility-audit.spec.ts)

### Browser DevTools

**Recommended extensions:**
- [axe DevTools](https://www.deque.com/axe/devtools/) - comprehensive WCAG scanning
- [Lighthouse](https://developers.google.com/web/tools/lighthouse) - built into Chrome DevTools
- [WAVE](https://wave.webaim.org/extension/) - visual feedback overlay

## CI/CD Integration

### Pre-commit Validation

All JavaScript/TypeScript files run through Biome a11y checks on commit:

```json
// package.json (root)
"lint-staged": {
  "*.{js,jsx,ts,tsx}": ["biome check --write --no-errors-on-unmatched"],
  "apps/web/components/**/*.{tsx,ts}": ["pnpm --filter=@jovie/web run a11y:check:staged"]
}
```

**Behavior:**
- Warnings are shown but don't block commits
- Auto-fixes are applied where safe
- Fast feedback loop (<5s)

### CI Pipeline

**1. Storybook A11y Tests** (runs on all PRs)
- Builds Storybook and runs test runner with axe-core
- Tests all component stories for WCAG violations
- Fails CI if critical violations found

**2. E2E A11y Audit** (optional, runs on 'a11y' label or main)
- Full axe-core scan of critical routes
- Only runs when PR has `a11y` label or on push to `main`
- Add label to PRs with significant a11y changes

**Add the label:**
```bash
gh pr edit <pr-number> --add-label a11y
```

## Common Patterns

### Keyboard Navigation

**All interactive elements must be keyboard accessible:**

```tsx
// ✅ Good: Native button is keyboard accessible
<button onClick={handleClick}>Click me</button>

// ❌ Bad: div with onClick is not keyboard accessible
<div onClick={handleClick}>Click me</div>

// ✅ Good: div with proper ARIA and keyboard handlers
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
>
  Click me
</div>
```

### ARIA Labels

**Provide accessible names for all interactive elements:**

```tsx
// ✅ Good: Icon button with aria-label
<button aria-label="Close dialog">
  <X className="h-4 w-4" />
</button>

// ✅ Good: Form input with associated label
<label htmlFor="email">Email address</label>
<input id="email" type="email" />

// ✅ Good: Visually hidden label
<button>
  <span className="sr-only">Search</span>
  <SearchIcon />
</button>
```

### Focus Management

**Manage focus for modals, dropdowns, and dynamic content:**

```tsx
import { useRef, useEffect } from 'react';

function Dialog({ isOpen, onClose }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus the close button when dialog opens
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <div role="dialog" aria-modal="true">
      <button ref={closeButtonRef} onClick={onClose}>
        Close
      </button>
      {/* Dialog content */}
    </div>
  );
}
```

### Alt Text

**Provide meaningful alt text for images:**

```tsx
// ✅ Good: Descriptive alt text
<img src="/artist.jpg" alt="Taylor Swift performing on stage" />

// ✅ Good: Empty alt for decorative images
<img src="/decorative-pattern.svg" alt="" />

// ❌ Bad: Missing alt attribute
<img src="/photo.jpg" />

// ❌ Bad: Redundant alt text
<img src="/photo.jpg" alt="Photo of photo" />
```

### Color Contrast

**Ensure sufficient contrast for all text:**

- **Normal text**: 4.5:1 minimum
- **Large text** (18pt+): 3:1 minimum
- **Interactive elements**: 3:1 minimum for focus indicators

**Test locally:**
```bash
pnpm --filter=@jovie/web run test:e2e tests/e2e/accessibility-audit.spec.ts
```

### Semantic HTML

**Use appropriate HTML elements:**

```tsx
// ✅ Good: Semantic heading hierarchy
<h1>Page Title</h1>
<h2>Section Heading</h2>
<h3>Subsection Heading</h3>

// ❌ Bad: Skipping heading levels
<h1>Page Title</h1>
<h3>Subsection Heading</h3>

// ✅ Good: Semantic list
<ul>
  <li>Item 1</li>
  <li>Item 2</li>
</ul>

// ❌ Bad: Divs with custom styling
<div>• Item 1</div>
<div>• Item 2</div>
```

## Component Library Standards

### For New Components

All new components must:

1. **Pass Storybook a11y tests** - no critical violations
2. **Include a11y test cases** - see [`UniversalLinkInput.a11y.test.tsx`](../apps/web/tests/components/dashboard/UniversalLinkInput.a11y.test.tsx)
3. **Document keyboard interactions** in Storybook stories
4. **Include focus management examples** where applicable

### Component Checklist

- [ ] All interactive elements are keyboard accessible
- [ ] Focus indicators are visible (not removed with `outline: none`)
- [ ] ARIA labels provided for icon-only buttons
- [ ] Color is not the only means of conveying information
- [ ] Form inputs have associated labels
- [ ] Error messages are announced to screen readers
- [ ] Loading states are announced to screen readers

## Progressive Enforcement Strategy

### Current State (Phase 1)

**All a11y rules enabled as warnings**
- Biome reports violations but doesn't block commits/builds
- Allows gradual adoption without disrupting development
- Baseline established for tracking improvements

### Upcoming Phases

**Month 2: Upgrade critical rules to errors**
- `useAltText` - All images need alt attributes
- `useAriaPropsForRole` - Correct ARIA attributes for roles
- `useValidAriaProps` - Valid ARIA property names
- `useValidAriaRole` - Valid ARIA roles
- `useHtmlLang` - HTML element needs lang attribute
- `useIframeTitle` - Iframes need title attributes

**Month 3+: Progressive upgrade of remaining rules**
- Track violation trends weekly with `pnpm a11y:report`
- Prioritize high-impact rules first
- Aim for zero violations by Q2

## Monitoring & Metrics

### Weekly Reports

Generate violation report:
```bash
pnpm --filter=@jovie/web run a11y:report
cat apps/web/a11y-report.json
```

### Track Improvements

**Metrics to monitor:**
- Total violation count (trend should decrease)
- Violations by severity (critical, serious, moderate, minor)
- Component-level a11y score in Storybook
- E2E test pass rate for axe-core scans

### Dashboards (future)

Consider integrating with:
- Datadog for a11y metrics tracking
- Sentry for production a11y error monitoring
- Storybook Chromatic for visual regression + a11y

## Resources

### Official Guidelines

- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [MDN Accessibility Guide](https://developer.mozilla.org/en-US/docs/Web/Accessibility)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)

### Testing Tools

- [axe-core Documentation](https://www.deque.com/axe/core-documentation/)
- [Lighthouse Accessibility Audit](https://developers.google.com/web/tools/lighthouse)
- [WAVE Browser Extension](https://wave.webaim.org/extension/)

### Internal Documentation

- [Biome a11y rules](https://biomejs.dev/linter/rules/#a11y)
- [Storybook a11y addon](https://storybook.js.org/addons/@storybook/addon-a11y)
- [Playwright axe integration](https://playwright.dev/docs/accessibility-testing)

## Getting Help

### Questions or Issues?

- **Slack:** #engineering channel
- **GitHub:** Open an issue with the `accessibility` label
- **PR Reviews:** Tag `@a11y-champions` for accessibility review

### Training Resources

- [Web Accessibility by Google (free course)](https://www.udacity.com/course/web-accessibility--ud891)
- [Deque University](https://dequeuniversity.com/)
- Internal lunch & learn sessions (quarterly)

## Contributing

Found an a11y issue? Here's how to fix it:

1. **Identify the violation** (Biome, Storybook, or E2E test)
2. **Check the documentation** for the specific rule
3. **Fix the violation** following patterns in this guide
4. **Test locally** with Storybook or E2E tests
5. **Create a PR** and request a11y review
6. **Update this guide** if you discover new patterns

---

**Last updated:** 2024-12-26
**Maintained by:** Engineering Team
