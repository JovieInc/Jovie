# Linear Demo Parity

Run an autonomous UI parity workflow to match Jovie's local `/demo` experience to `https://linear.app/demo` with token-first implementation and iterative visual verification.

Use when asked to compare, align, or pixel-match Linear demo UI in the Jovie codebase, including component/state mapping, design-token adjustments, interaction parity checks, and regression validation.

## Environment and Tooling

Work from repo root: `/Users/timwhite/Documents/GitHub/TBF/Jovie`.

Run first:

```bash
node --version
pnpm --version
```

Required:

- Node `>=22.13.0 <23`
- pnpm `9.15.4`

If needed:

```bash
nvm use 22 || (nvm install 22 && nvm use 22)
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

Install dependencies with `pnpm install` only.

## Startup

Prefer:

```bash
pnpm dev:web
```

Fallback when Doppler is unavailable:

```bash
pnpm --filter @jovie/web dev:local
```

If env is missing, run:

```bash
./scripts/codex-setup.sh
```

Wait for the local URL and keep the server running. Use `http://localhost:<port>/demo`.

## Guardrails

- Use `pnpm`, never `npm` or `yarn`.
- Never edit `drizzle/migrations/*`.
- Never create `middleware.ts`.
- Never add `// biome-ignore`.
- Keep `/demo` static (`apps/web/app/demo/page.tsx` uses `revalidate = false`).
- Prefer updating existing design tokens over local overrides.
- Do not hardcode routes; rely on `apps/web/constants/routes.ts`.
- Do not use emoji in UI strings/markup; use icons.

## Primary File Targets

- `apps/web/app/demo/page.tsx`
- `apps/web/components/demo/*`
- `apps/web/components/ui/*`
- `apps/web/styles/design-system.css`
- `apps/web/styles/linear-tokens.css`
- `apps/web/app/globals.css` (do not break import order)
- `apps/web/tailwind.config.js` (treat as locked config)

## Workflow

### 1. Inspect Linear Demo

Open `https://linear.app/demo` and inventory visible components.

Capture:

- DOM structure
- layout and spacing
- typography
- radius and shadows
- colors and token usage
- transition timing/easing
- state behavior

### 2. Inspect Local Demo

Open local `/demo` from the running server and map rendered regions to source files and component boundaries.

### 3. Build Component Mapping

Create `Linear component -> Jovie component/file` mappings.

Prefer existing Jovie components and variants; create new components only when unavoidable.

### 4. Rank by Impact

Prioritize by:

1. frequency
2. layout impact
3. interaction importance
4. visual hierarchy
5. reuse

### 5. Deep State Analysis (Top 5)

For the top five components, compare and align:

- default
- hover
- active
- focus
- keyboard focus
- disabled
- loading
- selected
- error
- success
- empty

For each state verify:

- background
- border
- shadow
- text color
- spacing
- typography
- cursor/opacity
- transition duration/easing

### 6. Implement Token-First

**Linear tokens are the single source of truth.** All Linear design tokens (`--linear-*` in `linear-tokens.css`) must exist in Jovie's design system. The token hierarchy is:

1. **Use `--linear-*` tokens directly** when the value matches a Linear token exactly (font weights, colors, shadows, radii, spacing)
2. **Map Jovie semantic tokens to Linear values** — e.g., `--font-weight-medium` should equal `--linear-font-weight-medium` (510), `--color-border-subtle` should match `--linear-border-subtle`
3. **Never hardcode values** that exist as tokens — use `[font-weight:var(--font-weight-medium)]` not `[font-weight:510]`, use `bg-interactive-hover` not `bg-white/[0.05]`
4. **Add new Jovie tokens only** when Linear has no equivalent and the value is used 2+ times
5. **Jovie-specific tokens** (e.g., brand accent, music-specific UI) layer on top of Linear foundations — they never override Linear primitives

Apply changes in this order:

1. extract/update Linear tokens in `linear-tokens.css`
2. map Jovie semantic tokens to Linear values in `design-system.css`
3. register any new tokens in `globals.css` `@theme inline` block
4. update components to use semantic tokens, never hardcoded values

Avoid one-off per-component overrides that bypass the design system.

### 7. Visual Diff Loop

After each edit:

1. let hot reload apply
2. refresh if needed
3. recapture screenshots
4. diff vs Linear
5. fix mismatches

Targets:

- layout delta `<= 1px`
- color variance `<= 1%`

Repeat until within tolerance.

### 8. Interaction Parity

Verify parity for:

- hover transitions
- focus rings
- press states
- tab switching
- dropdown open/close timing
- list hover behavior
- keyboard navigation

### 9. Regression Validation

Run before concluding:

```bash
pnpm turbo typecheck
pnpm --filter @jovie/web exec tsc --noEmit
pnpm biome check apps/web
pnpm vitest --run --changed
pnpm --filter @jovie/web lint:server-boundaries
```

Fix failures before completion.

## Completion Criteria

Finish only when all pass:

- local `/demo` visually matches `https://linear.app/demo`
- diff thresholds are met
- interaction parity is verified
- validations are green
- design system remains coherent

## Required Final Report Format

Return:

### Component Mapping

`Linear -> Jovie (file path)`

### Token Updates

`token | old value | new value | reason`

### Modified Components

`component | files changed | states implemented`

### Pixel/Visual Diff Results

`component or region | diff % | status`

### Validation Results

`command | pass/fail | notes`
