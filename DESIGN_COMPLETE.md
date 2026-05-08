# Design — Carbon Palette Sync Complete

App pages now match `/exp/shell-v1` at the source level via `linear-tokens.css :root.dark` and supporting design tokens.

## Source of truth

`apps/web/app/exp/shell-v1/page.tsx` lines 242-249:

```ts
const CARBON_PALETTE = {
  page:           '#06070a',
  surface0:       '#0a0b0e',
  surface1:       '#101216',
  surface2:       '#161a20',
  contentSurface: '#0a0c0f',
  border:         '#171a20',
};
```

Shell-v1 applies these as inline overrides on six CSS vars (lines 2027-2032):

- `--linear-bg-page`
- `--linear-bg-surface-0`
- `--linear-bg-surface-1`
- `--linear-bg-surface-2`
- `--linear-app-content-surface`
- `--linear-app-shell-border`

App routes don't get those inline overrides, so `:root.dark` in `linear-tokens.css` was updated to bake the same values in for global app dark-mode rendering.

## Files changed

### 1. `apps/web/styles/linear-tokens.css` (`:root.dark` block)

| Token | Before | After |
|---|---|---|
| `--linear-bg-page` | `#08090a` | `#06070a` |
| `--linear-bg-surface-0` | `#0f1011` | `#0a0b0e` |
| `--linear-bg-surface-1` | `#17171a` | `#101216` |
| `--linear-bg-surface-2` | `#1c1c1f` | `#161a20` |
| `--linear-panel-bg` | `#0f1011` | `#0a0b0e` |
| `--linear-bg-footer` | `#08090a` | `#06070a` |
| `--linear-btn-primary-fg` | `#08090a` | `#06070a` |
| `--linear-app-content-surface` | `var(--linear-bg-surface-0)` | `#0a0c0f` |
| `--linear-app-shell-border` | `rgba(255, 255, 255, 0.06)` | `#171a20` |
| `--linear-app-sidebar-background-rgb` | `8 9 10` | `6 7 10` |

### 2. `apps/web/lib/utils/color.ts`

Brand-icon contrast utility — surface assumption updated to new surface-1.

```diff
- const surfaceColor = isDarkTheme ? '#17171a' : '#fcfcfc';
+ const surfaceColor = isDarkTheme ? '#101216' : '#fcfcfc';

- const bgHex = isDarkTheme ? '#17171a' : '#fcfcfc';
+ const bgHex = isDarkTheme ? '#101216' : '#fcfcfc';
```

### 3. `apps/web/components/features/dashboard/organisms/socials-form/SocialsForm.tsx`

Chip-icon contrast utility — surface assumption updated.

```diff
- const surfaceHex = isDark ? '#17171a' : '#fcfcfc';
+ const surfaceHex = isDark ? '#101216' : '#fcfcfc';
```

### 4. `apps/web/components/tokens/linear-surface.ts`

Doc comment updated to reflect new hex values.

```diff
- * In dark mode, surface-1 (#17171a) IS distinct from the content surface (#0f1011).
+ * In dark mode, surface-1 (#101216) IS distinct from the content surface (#0a0c0f).
```

### 5. `apps/web/tests/unit/icon-contrast.test.ts`

Test fixtures updated to new dark surface values so reference contrast checks hit the correct surfaces.

```diff
  dark: {
-   base: '#08090a',
-   'surface-0': '#0f1011',
-   'surface-1': '#17171a',
-   'surface-2': '#23252a',
+   base: '#06070a',
+   'surface-0': '#0a0b0e',
+   'surface-1': '#101216',
+   'surface-2': '#161a20',
    'surface-3': '#2a2c32',
  },
```

Hover and DSP icon contrast helpers also updated to use `#101216` for the assumed surface-1.

### 6. `apps/web/tests/unit/app/surface-elevation-guardrails.test.ts`

Guardrail expectations updated to match the new tokens (Carbon palette is the new source of truth for the dark shell canvas).

```diff
  expect(linearTokens).toMatch(
-   /:root\.dark[\s\S]*--linear-app-content-surface:\s*var\(--linear-bg-surface-0\);/
+   /:root\.dark[\s\S]*--linear-app-content-surface:\s*#0a0c0f;/
  );
  expect(linearTokens).toMatch(
-   /:root\.dark[\s\S]*--linear-app-sidebar-background-rgb:\s*8 9 10;/
+   /:root\.dark[\s\S]*--linear-app-sidebar-background-rgb:\s*6 7 10;/
  );
```

### 7. `apps/web/styles/design-system.css`

Tiny non-functional poke (HMR comment) added near the `@import "./linear-tokens.css"` line to attempt to force CSS recompilation in the running dev server. Sidebar token block (`:root.dark`) already references the linear-tokens vars by `var(...)`, so no token-value changes were needed in design-system.css itself.

### 8. `apps/web/scripts/verify-design.mjs` (new)

Playwright-based verification harness that:
- Visits `/exp/shell-v1` and authenticated app routes
- Reads computed values of the six CARBON_PALETTE CSS vars from the active `<main>` element
- Captures full-viewport PNGs to `/tmp/design-verify/`
- Compares each computed token to the expected hex and prints a parity report

## Verification

| Check | Result |
|---|---|
| `pnpm --filter web exec tsc --noEmit` | exit 0, no errors |
| `vitest run tests/unit/app/surface-elevation-guardrails.test.ts` | 13/13 pass |
| `vitest run tests/unit/icon-contrast.test.ts` | 328/328 pass |
| `verify-design.mjs` source-token parity (6 vars × shell-v1) | 6/6 ✓ |

### Screenshots

Captured at `1440x900` in dark mode with `colorScheme: 'dark'` and `html.classList.add('dark')`:

- `/tmp/design-verify/shell-v1.png` — `/exp/shell-v1`
- `/tmp/design-verify/app-dashboard.png` — `/app` after `creator-ready` test-auth bootstrap
- `/tmp/design-verify/app-releases.png` — `/app/dashboard/releases`

## Note on dev-server stale cache

The running dev server at `localhost:3100` started with `Preserved Turbopack cache` (per session-start hook). After my edits, only some CSS-var changes propagated through HMR — the served CSS chunk continues to expose pre-edit values for several variables (e.g. `--linear-app-content-surface` still serves `var(--linear-bg-surface-0)` instead of `#0a0c0f`). The chunk hash also did not roll despite touching `linear-tokens.css` and `design-system.css`.

Source files on disk are correct (verified by `git diff`) and unit tests confirm the source-level contract. A production build (or a dev server restart with `JOVIE_DEV_RESET_NEXT_CACHE=1`) will pick up all updated values. I did not restart the dev server per the task constraints.

## Files modified (summary)

```
apps/web/styles/linear-tokens.css
apps/web/styles/design-system.css       (HMR poke comment only)
apps/web/lib/utils/color.ts
apps/web/components/features/dashboard/organisms/socials-form/SocialsForm.tsx
apps/web/components/tokens/linear-surface.ts
apps/web/tests/unit/icon-contrast.test.ts
apps/web/tests/unit/app/surface-elevation-guardrails.test.ts
apps/web/scripts/verify-design.mjs      (new)
```
