# UI reference: interaction contract and component architecture

On-demand detail for [.claude/rules/ui.md](../../.claude/rules/ui.md), which governs. Moved verbatim on 2026-10-29 to cut the rule loaded on every web `.tsx` edit.

## Interaction Quality Contract (detail)

### Feature Definition Gate

Before implementation, write the following in the feature plan, issue, or PR
description for every user-facing behavior change:

1. **Primary task and direct action:** what the user is trying to finish, the
   visible control that starts it, and the observable outcome. A frequent action
   normally completes end-to-end within two deliberate activations, and in one
   when the input is already complete. Starting and finishing a capture may use
   the two-activation budget. Three or more requires one named exception:
   review, safety, ambiguity, irreversible impact, or recovery. The exception
   reason must be visible or documented and covered by an executable interaction
   contract or focused behavior test when the surface has a test substrate.
2. **Context contract:** what focus, selection, text/caret, scroll position,
   and open context remain stable, and the explicit user action that may change
   each one.
3. **State contract:** idle, pending, empty, success, error, and offline or
   recovery states when the feature can reach them. Name the user-visible
   status and the next recovery action for each failure state.
4. **Input matrix:** the pointer/touch path, keyboard path where the platform
   has a hardware keyboard, and screen-reader/text-scaling/reduced-motion
   behavior. iOS uses native input and accessibility conventions; web and Mac
   may add power-user shortcuts. Semantic and behavioral parity matter, not
   identical pixels or bindings.

Do not hide a primary action behind hover, a gesture, a magic shortcut, or a
second surface when a direct visible control fits. Touch and pointer controls
remain available even when a keyboard accelerator is useful.

Follow [tooltip eligibility and input](../../DESIGN.md#tooltip-eligibility-and-input):
measure title clipping, preserve mouse/keyboard hints on hybrids, let touch
activate immediately, and retain rail-owned interactive portals until dismissal.

### Input, Shortcuts, and Discoverability

- Prefer semantic native controls. Use ARIA composite roles only when the
  interaction actually implements that pattern. For example, a filter toolbar
  uses pressed buttons and toolbar navigation, while tabs require tab/panel
  semantics and conventional arrow-key behavior.
- Every interactive control has an accessible name, visible focus treatment,
  and native keyboard activation. Custom keyboard handling must not steal
  Enter, Space, Escape, arrows, typing, or assistive-technology behavior from
  a focused child control or editable field.
- Add a keyboard accelerator only when it removes repeated work. Use a stable
  platform convention where one exists, scope it to its surface, preserve
  browser/OS shortcuts and text editing, and provide a visible or documented
  discovery path. Global web/Mac shortcuts belong in the canonical keyboard
  registry and shortcuts sheet, with a tested handler and collision check.
- Gesture input accelerates a direct action; it never becomes the only way to
  perform it. Keep an equivalent touch-safe visible control.

### Focus, Selection, and Stability

- A user-triggered update keeps focus on the initiating control when it still
  exists. If it is removed, move focus to the next logical actionable item,
  the updated result, or the originating control group, never silently to
  `body`.
- Preserve selection, caret, scroll position, filters, and surrounding context
  through refreshes, optimistic updates, and recoverable errors unless a named
  navigation or disclosure action intentionally changes them.
- Use roving focus only for a true composite control and test its arrow/Home/End
  behavior. Do not turn ordinary link or button collections into custom
  keyboard widgets without a user benefit.
- Follow the mandatory layout-shift contract below. Pending, success, error,
  and recovery feedback must not shift unrelated content or move a target away
  from the user's pointer or focus.

### Feedback, Recovery, and Performance

- A direct action gets immediate local acknowledgement: a controlled pending
  state, stable status slot, or canonical toast as appropriate. Do not leave a
  user guessing whether an action registered.
- Errors explain what failed in user terms and leave the failed work, input,
  and recovery path available whenever it is safe to retry. Offline/degraded
  states say what remains available and how to recover; never silently discard
  user input.
- Reuse canonical loading, empty, error, toast, dialog, and motion primitives.
  Feedback may change semantic content but must preserve stable geometry unless
  the user explicitly opened, closed, navigated, or disclosed it.
- Treat interaction latency as a product behavior. Do not invent a generic
  millisecond target; use the route's existing performance budget or record a
  same-method before/after measurement. Preserve the equivalent non-motion
  outcome under reduced motion.

### Inclusion and Component Ownership

- Web targets WCAG 2.2 AA. Test semantic names/roles, keyboard operation,
  focus order, contrast, non-color state cues, text zoom, and touch targets.
  Test native accessibility, Dynamic Type, and input conventions on iOS.
  A 44px touch target is the **hit container**, not a larger visible control:
  keep the visual size (`h-7` / `h-8` / `h-9` / icon) and expand the
  invisible target (`before:absolute before:h-11 before:min-w-11`, see
  `packages/ui/atoms/button.tsx`). Do not bump the control to `h-11` to
  satisfy the lint.
- Respect user text scaling and reduced-motion preferences. Never encode status
  in color alone, rely on hover alone, or require precise pointer movement.
- Reuse the canonical component family before composing a new control. A
  shared correction belongs in its owner; a feature-specific interaction stays
  local only when its behavior cannot be expressed by that owner.

### Evidence and Enforcement Matrix

Use the real check that can prove the rule. A green static check is not a claim
that unautomatable behavior was manually verified.

| Rule | Automated evidence when applicable | Manual/device or design-review evidence |
|---|---|---|
| Component ownership and changed interaction behavior | `pnpm component-ship-gate` requires a changed shared component's real test and story plus fail-closed rendered certification receipts; focused Vitest asserts the user-visible transition for shared and feature components | Confirm the component belongs to the existing family, not a fork |
| Semantic controls, names, and keyboard behavior | Focused Testing Library/Playwright behavior tests, `apps/web/tests/utils/a11y.ts`, and `pnpm --filter @jovie/web run a11y:ci` for affected routes | Screen-reader reading/order and hardware-keyboard pass |
| Contrast and touch alternatives | `pnpm --filter @jovie/web run lint:contrast-ratchet` and `pnpm --filter @jovie/web run lint:touch-target` | Touch target usability at device scale and non-color cue review |
| UI-feel properties (tabular numerals, heading balance, 40px hit-area floor, concentric radii) | `pnpm --filter @jovie/web run lint:ui-feel` — repo-wide ratchet of the `@jovie/ui-feel` ESLint checks against `apps/web/ui-feel-ratchet.baseline.json`; fix violations then rerun with `-- --update` and commit the lower baseline | Judgment calls the heuristics cannot see (whether a numeral actually changes, whether a small visible control has an adequate invisible hit container) |
| Focus, selection, layout, and state retention | Focus assertions plus the applicable Playwright bounding-box, visual, or layout-stability test | Real browser checks for scroll/caret/selection and unexpected movement |
| Loading, error, offline, recovery, and reduced motion | Focused tests for every changed deterministic state; existing visual/performance route checks where configured | Failure/retry, offline/degraded, text scaling, and reduced-motion pass on the target platform |
| Interaction responsiveness | Existing route performance budget or `pnpm --filter @jovie/web run perf:interactions` when the surface is in scope | Same-method before/after receipt when no route budget exists |

Every UI or interaction PR records the exact focused commands and the manual
evidence still required in the PR template. Do not claim comprehensive
accessibility, device, performance, or release proof from an import test, a
single screenshot, or CI alone.

## Component Architecture

Components follow atomic design with feature-based grouping:

```
packages/ui/atoms/          → Pure design system (Radix + CVA, NO Next.js/app imports)
apps/web/components/
├── atoms/                  → App-level atoms (may use Next.js, hooks)
├── molecules/              → Composed atoms
├── organisms/              → Complex shared widgets (includes table/ subsystem)
├── features/               → Feature modules (dashboard, admin, home, auth, etc.)
│   └── {feature}/          → May have internal atoms/molecules/organisms
├── providers/              → Context providers
├── hooks/                  → Shared hooks
├── site/                   → Site chrome
├── seo/                    → SEO components
└── effects/                → Visual effects
```

**Dependency direction (strictly enforced via eslint-plugin-boundaries):**

| Layer | Can import from |
|-------|----------------|
| `@jovie/ui` | React, Radix, CVA, Tailwind only |
| `atoms/` | `@jovie/ui` |
| `molecules/` | `atoms/`, `@jovie/ui` |
| `organisms/` | `molecules/`, `atoms/`, `@jovie/ui` |
| `features/{x}/` | `organisms/`, `molecules/`, `atoms/`, `@jovie/ui`, own internals |

**Forbidden imports:**
- `atoms/` must NOT import from `molecules/` or `organisms/`
- `molecules/` must NOT import from `organisms/`
- `features/{x}/` must NOT import from `features/{y}/` — if a component is needed by 2+ features, **promote it** to the shared `atoms/`, `molecules/`, or `organisms/` layer

**Token reference style:** Use Tailwind-named utilities (`text-primary-token`, `bg-surface-1`, `border-subtle`), NOT CSS variable arbitrary values (`text-(--linear-text-primary)`). Arbitrary Tailwind values (`w-[327px]`, `text-[#fff]`) are tracked by shrink-only ratchets — the count may only go DOWN. Shared UI foundation: `packages/ui` via `pnpm design:shared-ui-visual-arbitrary:check`. Broader web surfaces: `apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts`. Converge to tokens; never add new arbitrary values.

**Server-import isolation:** `apps/web/components/{atoms,molecules,organisms}` are shared presentation layers that must bundle for the browser. Files in these layers must not import server-only specifiers (`server-only`, `@/lib/auth/better-auth`, `drizzle-orm`, `@/lib/db/*`, `next/headers`, `/actions` modules, etc.) or contain `'use server'`. Violations are tracked by a drift ratchet (`apps/web/tests/unit/design-system/server-imports-ratchet.test.ts`) — the count may only go DOWN. Move server dependencies to a feature wrapper or API route.

## New Component Pattern

| Type | Location | When to use |
|------|----------|-------------|
| Design system atom | `packages/ui/atoms/MyComponent.tsx` | Pure UI, no Next.js/app imports |
| App atom | `apps/web/components/atoms/MyComponent.tsx` | Small, reusable, may use Next.js hooks |
| Molecule | `apps/web/components/molecules/MyComponent.tsx` | Composes 2+ atoms |
| Organism | `apps/web/components/organisms/{feature}/MyComponent.tsx` | Complex shared widget |
| Feature component | `apps/web/components/features/{feature}/MyComponent.tsx` | Feature-specific, can have internal atoms/molecules |

```typescript
'use client'; // ONLY if using hooks (useState, useEffect, etc.) — omit for server components

import type { ReactNode } from 'react';

interface MyComponentProps {
  readonly title: string;        // Every prop MUST be readonly
  readonly children?: ReactNode;
  readonly onAction?: () => void;
}

export function MyComponent({ title, children, onAction }: MyComponentProps) {
  return <div>{title}{children}</div>;
}
```
