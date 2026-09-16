# @shadcn/lint overlap and compatibility (JOV-6280)

Integration of `@shadcn/lint` into the existing `@jovie/web` ESLint setup.
Not a formatter, Ultracite, Oxlint, or Biome replacement.

## Compatibility (this checkout)

| Item | Value |
| --- | --- |
| Repo SHA at integration | recorded in the landing PR |
| `@shadcn/lint` | `0.1.0` (MIT) |
| Peer ESLint | `>=9.30.0` (Jovie: ESLint `^10.10.0`) |
| Tailwind | v4 (Jovie: Tailwind `^4.3`) |
| Node | `>=20.19` (Jovie: Node `>=22.23.2`) |
| License | MIT |
| Config | `apps/web/eslint.config.js` (`settings.shadcn`, `shadcn/no-restyle`) |
| Recognition | `ui: '@jovie/ui'`, `componentImports: ['^@jovie/ui(/|$)']` |
| Canonical sources | `packages/ui/**` — `shadcn/no-restyle` off |
| Local command | `pnpm --filter @jovie/web lint:eslint` |
| lint-staged | root `package.json` `apps/web/**/*.{ts,tsx}` ESLint |
| Required hosted path | `ci-fast` remaining lane `shadcn-lint-contracts` |

## Enabled rule

`shadcn/no-restyle` at **error** for call sites. Layout/placement is allowed.
Appearance (padding, typography, radius, color, height) is owned by the
canonical component.

## Extra upstream rules: stay off

These were assessed on 2026-09-14 (`engineering/jovie-shadcn-lint-assessment-2026-09-14`)
and were not proven safe to retire Jovie checks. No incremental-protection
fixture has reversed that:

| Upstream rule | Why it stays off |
| --- | --- |
| `no-raw-colors` | Accepts bare black/white; Jovie `@jovie/no-hardcoded-theme-colors` requires theme-safe treatment. Enabling would weaken or contradict that guard. |
| `no-arbitrary-values` | Rejects approved token and transition-list syntax that Jovie already allows. |
| `no-unknown-classes` | Can miss route-local CSS declarations. |
| `require-static-classes` | Not shown to add coverage beyond existing tests. |
| `no-inline-styles` | Not shown to add coverage; would collide with legitimate inline cases. |

Jovie rules that stay on: theme colors, motion, focus rings, imports, button
canonicalization, rendered certification.

## Upstream limitations (do not claim complete)

- Default `no-restyle` treats height as allowed. This config **denies** `h-*`,
  `min-h-*`, and `max-h-*`.
- Button `cva` variants/sizes are spread from `BUTTON_VARIANT_CLASSES` /
  `BUTTON_SIZE_CLASSES`, so upstream `{{variants}}` / `{{sizes}}` placeholders
  are often empty for Button. Diagnostics still name `Button` and the custom
  message lists canonical sizes. Card/Input inline `cva` variants are reported.
- Agents cannot clear a violation with unapproved tokens, new variants,
  duplicate components, new ignores, or an enlarged baseline. Unsupported
  bypasses: raising `maxFiles`/`maxMessages` in
  `apps/web/tests/unit/design-system/shadcn-no-restyle.baseline.json`;
  disabling `shadcn/no-restyle` in config; removing plugin enrollment;
  restyling inside `*.test.*` / `*.stories.*` (those files are exempt because
  they are not production call sites). Grandfathered production files keep
  their current restyle count; `scripts/shadcn-lint-changed.mjs` fails if a
  changed file's count grows.

Ship-time shrink-only ceiling: 239 files / 3264 `shadcn/no-restyle` messages
on production `app/` + `components/` call sites. New files are not listed in
the baseline and fail at error.

## Executable commands

```bash
pnpm --filter @jovie/web lint:eslint
pnpm --filter @jovie/web run lint:shadcn-contracts
pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts eslint-rules/shadcn-no-restyle.test.ts eslint-rules/shadcn-lint-enrollment.test.ts
```
