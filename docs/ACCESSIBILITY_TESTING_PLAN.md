# Accessibility Testing Plan for Jovie

This document outlines a comprehensive strategy for integrating accessibility (a11y) testing into the Jovie codebase, ensuring we never ship inaccessible UI components.

## Executive Summary

**Goal:** Catch accessibility issues at every stage of development—from authoring code to CI—so contrast violations, missing labels, and other WCAG failures never reach production.

**Current State:**
- ✅ Storybook 10 with `@storybook/addon-a11y` installed
- ✅ Radix UI primitives (accessible by default)
- ✅ Custom E2E contrast testing in `accessibility-audit.spec.ts`
- ✅ One component-level a11y test (`UniversalLinkInput.a11y.test.tsx`)
- ❌ No static linting (no `eslint-plugin-jsx-a11y`)
- ❌ Storybook a11y tests not integrated into CI
- ❌ No automated axe-core in E2E tests

---

## Testing Pyramid for Accessibility

```
                    ┌─────────────────────┐
                    │   E2E (Playwright)  │  ← Full page audits, real rendering
                    │   axe-core + custom │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Storybook Vitest   │  ← Component isolation, all variants
                    │  a11y addon + tests │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Component Unit     │  ← ARIA attributes, keyboard nav
                    │  Testing Library    │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Static Analysis   │  ← Catch obvious issues at author time
                    │   eslint-plugin-    │
                    │   jsx-a11y          │
                    └─────────────────────┘
```

---

## Phase 1: Static Analysis (Week 1)

### 1.1 Add eslint-plugin-jsx-a11y

Install and configure static a11y linting to catch issues as developers write code.

```bash
pnpm add -D eslint-plugin-jsx-a11y --filter web
```

**Update `apps/web/eslint.config.js`:**

```javascript
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  // ... existing config
  {
    plugins: {
      'jsx-a11y': jsxA11y,
    },
    rules: {
      // Recommended rules from jsx-a11y
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/aria-activedescendant-has-tabindex': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/html-has-lang': 'error',
      'jsx-a11y/img-redundant-alt': 'warn',
      'jsx-a11y/interactive-supports-focus': 'warn',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/mouse-events-have-key-events': 'warn',
      'jsx-a11y/no-access-key': 'error',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/no-distracting-elements': 'error',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-tabindex': 'warn',
      'jsx-a11y/no-redundant-roles': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/scope': 'error',
      'jsx-a11y/tabindex-no-positive': 'warn',
    },
  },
];
```

### 1.2 IDE Integration

Add VS Code settings for real-time feedback:

```json
// .vscode/settings.json
{
  "eslint.validate": ["javascript", "javascriptreact", "typescript", "typescriptreact"]
}
```

---

## Phase 2: Storybook 10 + Vitest Integration (Week 2)

### 2.1 Enable Storybook Vitest A11y Testing

Storybook 10 integrates natively with Vitest. Configure a11y testing to run automatically.

**Update `.storybook/vitest.setup.ts`:**

```typescript
import { setProjectAnnotations } from '@storybook/react';
import { beforeAll } from 'vitest';
import * as projectAnnotations from './preview';

// Apply Storybook annotations (including a11y config)
const project = setProjectAnnotations([projectAnnotations]);

beforeAll(project.beforeAll);
```

**Create `apps/web/.storybook/a11y.test.ts`:**

```typescript
import { composeStories } from '@storybook/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

expect.extend(toHaveNoViolations);

// This pattern runs axe on every story automatically
export async function testA11y(Story: React.ComponentType) {
  const { container } = render(<Story />);
  const results = await axe(container, {
    rules: {
      // WCAG 2.1 AA compliance
      'color-contrast': { enabled: true },
      'valid-lang': { enabled: true },
    },
  });
  expect(results).toHaveNoViolations();
}
```

### 2.2 Add jest-axe for Vitest

```bash
pnpm add -D jest-axe @types/jest-axe --filter web
```

### 2.3 Update Storybook Preview for Better A11y Testing

**Enhance `.storybook/preview.tsx`:**

```typescript
a11y: {
  config: {
    rules: [
      { id: 'color-contrast', enabled: true },
      { id: 'valid-lang', enabled: true },
      { id: 'landmark-one-main', enabled: true },
      { id: 'page-has-heading-one', enabled: false }, // Stories may not have h1
      { id: 'region', enabled: false }, // Stories are fragments
    ],
  },
  options: {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21aa'],
    },
  },
  // Manual mode for development, automatic for CI
  manual: process.env.STORYBOOK_A11Y_MANUAL === 'true',
},
```

### 2.4 Create A11y Test Pattern for Stories

**Example: `components/atoms/Button.a11y.test.tsx`:**

```typescript
import { composeStories } from '@storybook/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as stories from './Button.stories';

expect.extend(toHaveNoViolations);

const composedStories = composeStories(stories);

describe('Button Accessibility', () => {
  Object.entries(composedStories).forEach(([name, Story]) => {
    it(`${name} has no a11y violations`, async () => {
      const { container } = render(<Story />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
```

---

## Phase 3: Component-Level A11y Testing (Week 3)

### 3.1 Create A11y Testing Utilities

**Create `tests/helpers/a11y.ts`:**

```typescript
import { axe, toHaveNoViolations, JestAxeConfigureOptions } from 'jest-axe';
import { render, RenderResult } from '@testing-library/react';
import { expect } from 'vitest';

expect.extend(toHaveNoViolations);

export const a11yConfig: JestAxeConfigureOptions = {
  rules: {
    // WCAG 2.1 Level AA
    'color-contrast': { enabled: true },
    'link-name': { enabled: true },
    'button-name': { enabled: true },
    'image-alt': { enabled: true },
    'label': { enabled: true },
    'input-button-name': { enabled: true },
    'aria-valid-attr': { enabled: true },
    'aria-valid-attr-value': { enabled: true },
    'aria-required-attr': { enabled: true },
    'role-img-alt': { enabled: true },
    // Disable rules that don't apply to isolated components
    'region': { enabled: false },
    'landmark-one-main': { enabled: false },
  },
};

export async function expectNoA11yViolations(
  renderResult: RenderResult,
  config: JestAxeConfigureOptions = a11yConfig
) {
  const results = await axe(renderResult.container, config);
  expect(results).toHaveNoViolations();
}

// Keyboard navigation helper
export async function expectKeyboardAccessible(
  element: HTMLElement,
  options: { expectFocus?: boolean; expectActivation?: boolean } = {}
) {
  const { expectFocus = true, expectActivation = false } = options;

  if (expectFocus) {
    element.focus();
    expect(document.activeElement).toBe(element);
  }

  if (expectActivation) {
    // Test Enter key activation
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    // Test Space key activation
    element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
  }
}
```

### 3.2 Add A11y Tests for Critical Components

Priority list for component a11y tests:

1. **Form components** - Input, Select, Checkbox, Radio, Switch
2. **Interactive components** - Button, Link, Dialog, Menu, Tabs
3. **Navigation components** - Header, Footer, Sidebar, Breadcrumb
4. **Content components** - Card, Alert, Toast, Tooltip

**Example: `tests/components/atoms/Input.a11y.test.tsx`:**

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Input } from '@/components/atoms/Input';
import { expectNoA11yViolations } from '@/tests/helpers/a11y';

describe('Input Accessibility', () => {
  it('has no axe violations with label', async () => {
    const result = render(
      <div>
        <label htmlFor="test-input">Email</label>
        <Input id="test-input" type="email" />
      </div>
    );
    await expectNoA11yViolations(result);
  });

  it('has no axe violations with aria-label', async () => {
    const result = render(<Input aria-label="Search" type="search" />);
    await expectNoA11yViolations(result);
  });

  it('communicates error state accessibly', async () => {
    const result = render(
      <div>
        <label htmlFor="error-input">Email</label>
        <Input
          id="error-input"
          aria-invalid="true"
          aria-describedby="error-message"
        />
        <span id="error-message">Please enter a valid email</span>
      </div>
    );
    await expectNoA11yViolations(result);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('is keyboard accessible', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Test input" />);

    await user.tab();
    expect(screen.getByRole('textbox')).toHaveFocus();
  });
});
```

---

## Phase 4: E2E Accessibility Testing (Week 4)

### 4.1 Integrate axe-core with Playwright

**Install @axe-core/playwright:**

```bash
pnpm add -D @axe-core/playwright --filter web
```

**Create `tests/e2e/a11y/axe-audit.spec.ts`:**

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const routes = [
  { path: '/', name: 'Homepage' },
  { path: '/signin', name: 'Sign In' },
  { path: '/signup', name: 'Sign Up' },
  { path: '/pricing', name: 'Pricing' },
];

test.describe('Axe Accessibility Audit', () => {
  for (const route of routes) {
    test(`${route.name} (${route.path}) passes axe audit`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .exclude('.third-party-widget') // Exclude third-party content if needed
        .analyze();

      // Log violations for debugging
      if (results.violations.length > 0) {
        console.log('Violations:', JSON.stringify(results.violations, null, 2));
      }

      expect(results.violations).toEqual([]);
    });

    test(`${route.name} (${route.path}) passes axe audit in dark mode`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');

      // Enable dark mode
      await page.evaluate(() => {
        document.documentElement.classList.add('dark');
      });
      await page.waitForTimeout(300);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  }
});
```

### 4.2 Add Authenticated Route Testing

**Create `tests/e2e/a11y/authenticated-audit.spec.ts`:**

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signInUser } from '../helpers/clerk-auth';

const authRoutes = [
  { path: '/app/dashboard', name: 'Dashboard' },
  { path: '/app/settings', name: 'Settings' },
  { path: '/app/dashboard/links', name: 'Links' },
  { path: '/app/dashboard/analytics', name: 'Analytics' },
];

test.describe('Authenticated Pages Axe Audit', () => {
  test.beforeEach(async ({ page }) => {
    await signInUser(page);
  });

  for (const route of authRoutes) {
    test(`${route.name} passes axe audit`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  }
});
```

### 4.3 Keep Custom Contrast Testing

Your existing `accessibility-audit.spec.ts` provides valuable custom contrast checking. Keep it as a complementary test since it includes specific severity categorization and detailed reporting.

---

## Phase 5: CI Integration (Week 5)

### 5.1 Add A11y CI Workflow

**Create `.github/workflows/a11y.yml`:**

```yaml
name: Accessibility

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  lint-a11y:
    name: ESLint jsx-a11y
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint --filter web

  storybook-a11y:
    name: Storybook A11y Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - name: Build Storybook
        run: pnpm storybook:build --filter web
      - name: Run Storybook Test Runner
        run: pnpm storybook:test --filter web
        env:
          STORYBOOK_A11Y_MANUAL: 'false'

  e2e-a11y:
    name: E2E Axe Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - name: Install Playwright
        run: pnpm exec playwright install --with-deps chromium
      - name: Start server and run a11y tests
        run: pnpm a11y:ci --filter web
```

### 5.2 Add Package.json Scripts

**Update `apps/web/package.json`:**

```json
{
  "scripts": {
    "a11y:lint": "eslint --ext .tsx,.ts components/ --rule 'jsx-a11y/*: error'",
    "a11y:storybook": "test-storybook --url http://localhost:6006",
    "a11y:e2e": "playwright test tests/e2e/a11y/",
    "a11y:ci": "start-server-and-test 'pnpm dev' http://localhost:3000 'pnpm a11y:e2e'",
    "a11y:all": "pnpm a11y:lint && pnpm a11y:storybook && pnpm a11y:e2e"
  }
}
```

---

## Phase 6: Developer Experience (Ongoing)

### 6.1 Pre-commit Hook

**Update `.husky/pre-commit`:**

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run a11y linting on staged files
pnpm lint-staged
```

**Update `package.json` lint-staged config:**

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "eslint --quiet"
    ]
  }
}
```

### 6.2 VS Code Extension Recommendations

**Update `.vscode/extensions.json`:**

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "deque-systems.vscode-axe-linter",
    "webhint.vscode-webhint"
  ]
}
```

### 6.3 A11y Checklist for PRs

**Create `.github/PULL_REQUEST_TEMPLATE/feature.md`:**

```markdown
## Accessibility Checklist

- [ ] All interactive elements are keyboard accessible
- [ ] Color contrast meets WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text)
- [ ] Form inputs have associated labels
- [ ] Images have appropriate alt text
- [ ] Focus states are visible
- [ ] Screen reader testing completed (optional but encouraged)
- [ ] Storybook a11y panel shows no violations
```

---

## Recommended Tools Summary

| Layer | Tool | Purpose |
|-------|------|---------|
| Static Analysis | `eslint-plugin-jsx-a11y` | Catch issues at author time |
| IDE | Axe Linter VS Code extension | Real-time feedback |
| Component Testing | `jest-axe` + Vitest | Test isolated components |
| Storybook | `@storybook/addon-a11y` | Visual a11y panel + tests |
| E2E | `@axe-core/playwright` | Full page audits |
| E2E | Custom contrast script | Detailed contrast analysis |
| CI | GitHub Actions | Enforce on every PR |

---

## WCAG Compliance Target

**Target: WCAG 2.1 Level AA**

Key requirements:
- **1.1.1 Non-text Content** - All images have alt text
- **1.3.1 Info and Relationships** - Proper semantic HTML
- **1.4.3 Contrast (Minimum)** - 4.5:1 for normal text, 3:1 for large text
- **1.4.11 Non-text Contrast** - 3:1 for UI components and graphics
- **2.1.1 Keyboard** - All functionality available via keyboard
- **2.4.4 Link Purpose** - Link text describes destination
- **2.4.7 Focus Visible** - Visible focus indicator
- **4.1.2 Name, Role, Value** - Proper ARIA attributes

---

## Success Metrics

1. **Zero major a11y violations** in CI (axe-core critical/serious)
2. **100% of atoms and molecules** have a11y tests
3. **All PRs pass** jsx-a11y linting
4. **Storybook a11y panel** shows no violations for all stories
5. **Contrast ratio** ≥ 4.5:1 for all text (verified in both themes)

---

## Rollout Timeline

| Week | Phase | Deliverables |
|------|-------|--------------|
| 1 | Static Analysis | eslint-plugin-jsx-a11y installed and configured |
| 2 | Storybook Integration | Vitest a11y tests running for all stories |
| 3 | Component Tests | A11y tests for all atoms and critical molecules |
| 4 | E2E Tests | axe-core Playwright tests for all routes |
| 5 | CI Integration | A11y checks blocking PRs |
| Ongoing | Developer Experience | Pre-commit hooks, VS Code setup, PR templates |

---

## Additional Recommendations

### Color System Review

Since you're using Tailwind with dark mode, consider:

1. **Document accessible color pairs** - Create a color pairing guide
2. **Use CSS custom properties** - Ensure light/dark mode colors are tested together
3. **Avoid color-only indicators** - Always pair with icons or text

### Component Library Audit

Given your Radix UI usage, most components are accessible by default. Focus testing on:

1. **Custom components** that don't use Radix
2. **Composed components** that combine multiple primitives
3. **Form patterns** - complex forms with validation

### Screen Reader Testing

While automated testing catches ~30% of issues, consider:

1. **Manual testing** with VoiceOver (macOS) or NVDA (Windows)
2. **Focus order** testing for complex layouts
3. **Announcement** testing for dynamic content

---

## References

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [axe-core Rules](https://dequeuniversity.com/rules/axe/)
- [Storybook A11y Addon](https://storybook.js.org/addons/@storybook/addon-a11y)
- [Testing Library A11y](https://testing-library.com/docs/dom-testing-library/api-accessibility/)
- [Radix UI Accessibility](https://www.radix-ui.com/docs/primitives/overview/accessibility)
