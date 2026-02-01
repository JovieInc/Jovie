---
description: Accessibility and UX compliance audit for web interfaces
tags: [accessibility, a11y, wcag, ux]
---

# /a11y-audit - Accessibility Compliance Audit

Review UI code for Web Interface Guidelines compliance covering 100+ rules for accessibility, performance, and UX. Focuses on WCAG 2.1 AA compliance for marketing pages and public profiles.

## Scope

### WCAG 2.1 AA Compliance (Priority: HIGH)
- Keyboard navigation and focus management
- Screen reader support (ARIA attributes)
- Color contrast (4.5:1 for text, 3:1 for UI components)
- Focus indicators (visible and high contrast)
- Alternative text for images and icons
- Semantic HTML structure
- Form labels and error messages
- Heading hierarchy (h1 → h2 → h3, no skips)

### Performance Guidelines (Priority: MEDIUM)
- Core Web Vitals (LCP <2.5s, FID <100ms, CLS <0.1)
- Image optimization (Next.js Image, alt text, priority flag)
- Font loading (preload critical fonts)
- Animation performance (use transform/opacity)
- Reduced motion support (prefers-reduced-motion)

### UX Best Practices (Priority: MEDIUM)
- Form validation patterns (inline errors, field-level feedback)
- Error messages (descriptive, actionable)
- Loading states (skeleton screens, spinners)
- Responsive design (mobile-first)
- Touch targets (44x44px minimum, 48x48px recommended)

## Jovie Stack Adaptations

### 1. Radix UI Components

Jovie uses Radix UI primitives which have built-in accessibility. Verify:

**Rule a11y-01: Proper Radix Primitive Usage (HIGH)**

✅ **Radix Dialog with Accessibility:**
```tsx
import * as Dialog from '@radix-ui/react-dialog';

<Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
  <Dialog.Trigger asChild>
    <button>Open Dialog</button>
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 bg-black/50" />
    <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
      <Dialog.Title>Dialog Title</Dialog.Title> {/* ✅ Required for a11y */}
      <Dialog.Description>Dialog content</Dialog.Description>
      <Dialog.Close asChild>
        <button>Close</button>
      </Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

❌ **Missing Dialog.Title:**
```tsx
<Dialog.Content>
  {/* ❌ No Dialog.Title - screen readers can't announce dialog purpose */}
  <p>Content here</p>
</Dialog.Content>
```

**Rule a11y-02: AsChild Pattern for Composition (MEDIUM)**

Radix uses `asChild` to compose with custom components while maintaining accessibility.

✅ **Proper asChild usage:**
```tsx
<Dialog.Trigger asChild>
  <Button variant="primary">Open</Button> {/* ✅ Button maintains semantics */}
</Dialog.Trigger>
```

❌ **Nested buttons (invalid HTML):**
```tsx
<Dialog.Trigger>
  <Button variant="primary">Open</Button> {/* ❌ Button inside button */}
</Dialog.Trigger>
```

**Common Radix Components:**
- `Dialog` - Requires `Dialog.Title` for screen readers
- `DropdownMenu` - Auto keyboard navigation
- `Select` - Native semantics with custom styling
- `Tabs` - ARIA roles and keyboard navigation
- `Tooltip` - `aria-describedby` link

**Reference:** All Radix usage in `packages/ui/**/*.tsx` and `@jovie/ui`

### 2. Motion Library (Reduced Motion Support)

Jovie uses `motion` library for animations. ALWAYS respect `prefers-reduced-motion`.

**Rule a11y-03: Missing Reduced Motion Support (HIGH)**

❌ **Animation without reduced motion:**
```tsx
import { motion } from 'motion';

<motion.div animate={{ x: 100, opacity: 1 }}>
  Content
</motion.div>
```

✅ **With reduced motion hook:**
```tsx
'use client';
import { motion } from 'motion';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

export function AnimatedCard() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      animate={{
        x: prefersReducedMotion ? 0 : 100,
        opacity: 1,
      }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.3,
      }}
    >
      Content
    </motion.div>
  );
}
```

**Rule a11y-04: Tailwind Motion-Reduce Utilities (MEDIUM)**

Use Tailwind's `motion-reduce:` variant for CSS animations.

❌ **Animation without motion-reduce:**
```tsx
<div className="animate-spin">Loading...</div>
```

✅ **With motion-reduce:**
```tsx
<div className="animate-spin motion-reduce:animate-none">
  Loading...
</div>
```

**Reference:**
- Hook: `apps/web/lib/hooks/useReducedMotion.ts`
- Example: `apps/web/components/ui/CTAButton.tsx`
- Button spinner: `packages/ui/atoms/button.tsx:68` (uses `motion-reduce:animate-none`)

### 3. Next.js Image Component

**Rule a11y-05: Missing or Empty Alt Text (CRITICAL)**

❌ **Empty alt text:**
```tsx
import Image from 'next/image';

<Image src="/hero.jpg" width={800} height={600} alt="" /> {/* ❌ CRITICAL */}
```

✅ **Descriptive alt text:**
```tsx
<Image
  src="/hero.jpg"
  width={800}
  height={600}
  alt="Artist performing live on stage with purple lighting and crowd"
/>
```

✅ **Decorative image (intentionally empty):**
```tsx
<Image
  src="/background-pattern.svg"
  width={200}
  height={200}
  alt="" // ✅ OK for pure decoration
  aria-hidden="true" // ✅ Explicitly hide from screen readers
/>
```

**Rule a11y-06: Missing Priority for LCP Image (MEDIUM)**

❌ **Hero image without priority:**
```tsx
<Image src="/hero.jpg" width={1200} height={600} alt="Hero" />
```

✅ **Priority for above-the-fold:**
```tsx
<Image
  src="/hero.jpg"
  width={1200}
  height={600}
  alt="Hero"
  priority // ✅ Preload LCP image
/>
```

### 4. Forms (React Hook Form + Zod)

**Rule a11y-07: Missing Form Labels (CRITICAL)**

❌ **Input without label:**
```tsx
<input type="email" name="email" />
```

✅ **Proper label association:**
```tsx
<label htmlFor="email">Email Address</label>
<input type="email" id="email" name="email" />
```

**Rule a11y-08: Missing Error Announcements (HIGH)**

❌ **Error without aria attributes:**
```tsx
<input type="email" name="email" />
{error && <span>Invalid email</span>}
```

✅ **Error with aria-describedby:**
```tsx
<label htmlFor="email">Email Address</label>
<input
  type="email"
  id="email"
  name="email"
  aria-invalid={!!error}
  aria-describedby={error ? 'email-error' : undefined}
/>
{error && (
  <span id="email-error" role="alert">
    {error.message}
  </span>
)}
```

**Rule a11y-09: Form-Level Error Summary (MEDIUM)**

For multi-field forms, provide summary of errors.

✅ **Error summary pattern:**
```tsx
{errors.length > 0 && (
  <div role="alert" aria-live="polite">
    <h2>Please fix the following errors:</h2>
    <ul>
      {errors.map((error) => (
        <li key={error.field}>
          <a href={`#${error.field}`}>{error.message}</a>
        </li>
      ))}
    </ul>
  </div>
)}
```

**Reference:** React Hook Form integration in `apps/web/components/forms/**`

### 5. Clerk Authentication

**Rule a11y-10: Clerk Component Accessibility (LOW)**

Clerk's `<SignIn>` and `<SignUp>` components have built-in accessibility. Verify:
- OTP input has keyboard navigation
- Error messages are announced
- Focus management on modal open/close

```tsx
import { SignIn } from '@clerk/nextjs';

<SignIn
  appearance={{
    elements: {
      formButtonPrimary: 'bg-btn-primary hover:bg-btn-primary/90', // Custom styling
    },
  }}
/>
```

### 6. Tailwind v4 Design Tokens

**Rule a11y-11: Color Contrast with Design Tokens (HIGH)**

Use semantic color tokens that maintain contrast ratios.

❌ **Low contrast text:**
```tsx
<p className="text-gray-400">Important notice</p> {/* ❌ 2.1:1 contrast */}
```

✅ **High contrast with tokens:**
```tsx
<p className="text-primary-token">Important notice</p> {/* ✅ 7:1 contrast */}
```

**Jovie Design Tokens (from `apps/web/app/globals.css`):**
- `text-primary-token` - Primary text (high contrast)
- `text-secondary-token` - Secondary text (medium contrast)
- `bg-surface-0`, `bg-surface-1`, `bg-surface-2` - Surface levels
- `border-subtle` - Low emphasis borders

**Rule a11y-12: Focus Ring Visibility (HIGH)**

❌ **No focus indicator:**
```tsx
<button className="bg-primary text-white">Click me</button>
```

✅ **With focus ring:**
```tsx
<button className="bg-primary text-white focus-visible:ring-2 focus-visible:ring-accent">
  Click me
</button>
```

**Reference:** `apps/web/app/globals.css` defines `@utility focus-ring` for consistent focus styles.

## Keyboard Navigation

**Rule a11y-13: Keyboard Trap (CRITICAL)**

Ensure users can navigate in/out with keyboard only.

❌ **Modal without escape:**
```tsx
<div role="dialog">
  <div>Content</div>
  {/* ❌ No way to close with keyboard */}
</div>
```

✅ **Modal with keyboard support:**
```tsx
<Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
  <Dialog.Content>
    Content
    <Dialog.Close>Close</Dialog.Close> {/* ✅ Esc key handled by Radix */}
  </Dialog.Content>
</Dialog.Root>
```

**Rule a11y-14: Interactive Element Not Focusable (HIGH)**

❌ **Div with onClick:**
```tsx
<div onClick={handleClick}>Click me</div> {/* ❌ Not focusable */}
```

✅ **Button or focusable element:**
```tsx
<button onClick={handleClick}>Click me</button> {/* ✅ Focusable */}
```

**Rule a11y-15: Skip Links for Navigation (MEDIUM)**

Provide skip link for keyboard users to bypass navigation.

✅ **Skip to main content:**
```tsx
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0">
  Skip to main content
</a>

<main id="main-content">
  {/* Main content */}
</main>
```

## Semantic HTML

**Rule a11y-16: Improper Heading Hierarchy (HIGH)**

❌ **Skipping heading levels:**
```tsx
<h1>Page Title</h1>
<h3>Subsection</h3> {/* ❌ Skipped h2 */}
```

✅ **Proper hierarchy:**
```tsx
<h1>Page Title</h1>
<h2>Section</h2>
<h3>Subsection</h3>
```

**Rule a11y-17: Missing Landmark Regions (MEDIUM)**

❌ **Div soup:**
```tsx
<div>
  <div>Navigation</div>
  <div>Content</div>
  <div>Footer</div>
</div>
```

✅ **Semantic landmarks:**
```tsx
<header>
  <nav aria-label="Main navigation">Navigation</nav>
</header>
<main>Content</main>
<footer>Footer</footer>
```

**Rule a11y-18: Button vs Link Semantics (MEDIUM)**

❌ **Link that acts like button:**
```tsx
<a href="#" onClick={handleSubmit}>Submit</a> {/* ❌ Wrong semantics */}
```

✅ **Use button for actions:**
```tsx
<button onClick={handleSubmit}>Submit</button> {/* ✅ Correct */}
```

## Touch Targets

**Rule a11y-19: Touch Target Too Small (HIGH)**

❌ **Small touch target:**
```tsx
<button className="w-8 h-8 p-1">×</button> {/* ❌ 32x32px, too small */}
```

✅ **Minimum 44x44px:**
```tsx
<button className="w-11 h-11 p-2">×</button> {/* ✅ 44x44px */}
```

**WCAG Recommendation:** 44x44px minimum, 48x48px recommended

**Reference:** `packages/ui/atoms/button.tsx` size variants:
- `size="default"` - `h-10` (40px, acceptable)
- `size="icon"` - `h-10 w-10` (40px, acceptable)
- `size="lg"` - `h-11` (44px, preferred)

## ARIA Attributes

**Rule a11y-20: Redundant ARIA (LOW)**

❌ **ARIA on semantic element:**
```tsx
<button role="button">Click</button> {/* ❌ Redundant */}
```

✅ **Use semantic HTML:**
```tsx
<button>Click</button> {/* ✅ Implicit role */}
```

**Rule a11y-21: Missing ARIA Label for Icon-Only Buttons (HIGH)**

❌ **Icon button without label:**
```tsx
import { XIcon } from 'lucide-react';
<button><XIcon /></button> {/* ❌ No accessible name */}
```

✅ **With aria-label:**
```tsx
<button aria-label="Close dialog">
  <XIcon />
</button>
```

**Rule a11y-22: Dynamic Content Not Announced (MEDIUM)**

❌ **Status update without announcement:**
```tsx
{loading && <div>Loading...</div>}
```

✅ **With aria-live:**
```tsx
<div aria-live="polite" aria-atomic="true">
  {loading ? 'Loading...' : 'Content loaded'}
</div>
```

## Loading States

**Rule a11y-23: Missing Loading State (MEDIUM)**

❌ **No loading indicator:**
```tsx
<button onClick={handleSubmit}>Submit</button>
```

✅ **With loading state:**
```tsx
<Button loading={isSubmitting} disabled={isSubmitting}>
  Submit
</Button>
```

**Reference:** `packages/ui/atoms/button.tsx` has built-in loading state with `aria-busy` and spinner.

## TanStack Virtual Accessibility

**Rule a11y-24: Virtualized List Keyboard Navigation (MEDIUM)**

When using TanStack Virtual for long lists, ensure keyboard navigation works.

✅ **Virtual list with keyboard support:**
```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 50,
});

<div
  ref={parentRef}
  role="list"
  tabIndex={0} // ✅ Make scrollable region focusable
>
  {virtualizer.getVirtualItems().map((virtualItem) => (
    <div key={virtualItem.key} role="listitem">
      {items[virtualItem.index]}
    </div>
  ))}
</div>
```

## Execution Workflow

1. **Identify target files**
   - Marketing pages: `apps/web/app/(marketing)/**`
   - Public profiles: `apps/web/app/[username]/**`
   - UI components: `packages/ui/**`, `apps/web/components/ui/**`
   - If no path specified, scan recently modified UI files

2. **Run CRITICAL checks first**
   - Missing alt text (a11y-05)
   - Missing form labels (a11y-07)
   - Keyboard traps (a11y-13)
   - Touch targets <44px (a11y-19)
   - Icon buttons without labels (a11y-21)

3. **Run HIGH priority checks**
   - Proper Radix usage (a11y-01)
   - Reduced motion support (a11y-03)
   - Error announcements (a11y-08)
   - Color contrast (a11y-11)
   - Focus ring visibility (a11y-12)
   - Heading hierarchy (a11y-16)

4. **Run MEDIUM priority checks**
   - AsChild pattern (a11y-02)
   - Motion-reduce utilities (a11y-04)
   - Priority images (a11y-06)
   - Form error summaries (a11y-09)
   - Landmark regions (a11y-17)
   - Dynamic content announcements (a11y-22)

5. **Report findings**
   - Format: `file:line - [SEVERITY] rule-id: Description`
   - Group by severity (CRITICAL → HIGH → MEDIUM → LOW)
   - Include fix suggestions with code examples

## Integration Points

- Complements `/perf-check` (reduced motion patterns)
- Integrates with Playwright axe tests: `apps/web/tests/e2e/accessibility.spec.ts`
- References Storybook a11y addon: `pnpm test:a11y`
- Cross-reference with `/clean` for console error detection

## Output Format

```markdown
## Accessibility Audit Results

### CRITICAL Issues (fix immediately)
- `apps/web/app/(marketing)/page.tsx:45` - [CRITICAL] a11y-05: Missing alt text on hero image
- `apps/web/components/forms/ContactForm.tsx:67` - [CRITICAL] a11y-07: Input without label

### HIGH Priority (fix before release)
- `apps/web/components/ui/Modal.tsx:23` - [HIGH] a11y-01: Missing Dialog.Title for screen readers
- `apps/web/components/AnimatedCard.tsx:12` - [HIGH] a11y-03: Animation without reduced motion support
- `apps/web/app/[username]/page.tsx:89` - [HIGH] a11y-11: Low contrast text (2.3:1, needs 4.5:1)

### MEDIUM Priority (improve UX)
- `apps/web/components/Navigation.tsx:34` - [MEDIUM] a11y-04: Missing motion-reduce on animation
- `apps/web/app/(marketing)/blog/page.tsx:56` - [MEDIUM] a11y-17: Missing landmark regions

### LOW Priority (enhancement)
- `apps/web/components/ui/Card.tsx:12` - [LOW] a11y-20: Redundant role="button" on button

### Summary
- Total issues: 8
- CRITICAL: 2 (fix immediately)
- HIGH: 3 (fix before release)
- MEDIUM: 2 (improve UX)
- LOW: 1 (enhancement)

### Recommended Fixes
[Include before/after code examples for top 3 issues]

### WCAG 2.1 AA Compliance
- Keyboard Navigation: ⚠️ 1 issue (keyboard trap in modal)
- Screen Readers: ⚠️ 2 issues (missing labels)
- Color Contrast: ⚠️ 1 issue (low contrast text)
- Focus Indicators: ✅ Pass
- Alternative Text: ⚠️ 1 issue (missing alt)
- Semantic HTML: ✅ Pass
- Overall: 5/8 categories pass
```

## Automated Validation

Run these checks before manual audit:

```bash
# Playwright accessibility tests
pnpm --filter web test:e2e tests/e2e/accessibility.spec.ts

# Storybook a11y addon
pnpm test:a11y

# Find images without alt text
grep -rn "<Image" apps/web --include="*.tsx" | grep -v "alt="

# Find inputs without labels
grep -rn "<input" apps/web --include="*.tsx" | grep -v "id="

# Find buttons without accessible names
grep -rn "<button" apps/web --include="*.tsx" | grep -E ">\s*<[A-Z]" | grep -v "aria-label"
```

## Critical Files Reference

- `packages/ui/atoms/button.tsx` - Accessible button with loading states (lines 93-150)
- `apps/web/components/ui/CTAButton.tsx` - Reduced motion integration
- `apps/web/lib/hooks/useReducedMotion.ts` - Motion preference hook
- `apps/web/app/globals.css` - Focus ring utility definition
- `apps/web/tests/e2e/accessibility.spec.ts` - Playwright axe tests

## WCAG 2.1 AA Requirements (Reference)

### Text Contrast
- Normal text (< 18pt): 4.5:1 minimum
- Large text (≥ 18pt or 14pt bold): 3:1 minimum
- UI components and graphics: 3:1 minimum

### Focus Indicators
- Visible: Must be visible (minimum 2px border or equivalent)
- High contrast: 3:1 against adjacent colors

### Touch Targets
- Minimum: 44x44 CSS pixels
- Exceptions: Inline links, default browser controls

### Keyboard Navigation
- All functionality available via keyboard
- No keyboard traps
- Visible focus indicators
- Logical tab order

---

**CRITICAL:** Focus on CRITICAL and HIGH severity issues first. These block WCAG 2.1 AA compliance and can result in legal liability.
