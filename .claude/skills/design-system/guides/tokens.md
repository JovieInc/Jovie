# Tokens

## Source of truth
**Phase 2 target** (Tim, 2026-10-25): repo-root `design.tokens.json` is the single
write SoT. From it we generate (a) CSS custom properties in `apps/web/styles/`
and TS exports, and (b) Pen variables. Pen does not originate token values.
**Tim owns flip timing** — do not invert the live emitter ↔ JSON export relationship
in a remediation PR unless that flip is already trivial, proven, and explicitly
approved.

**Live write path until Phase 2 flips** (read before editing):
- `apps/web/styles/design-system.css` emits live semantic values (Noir Ion anchors
  `--noir-ion-*`, `--color-*-token`, `--space-*`, `--duration-*`, `--ease-*`,
  `--shadow-*`, `--font-*`, `--text-*`). Color hexes project Pen node ZiaWI via
  `apps/web/design/ziawi-color-sot.json`.
- Compiler-owned families live in `apps/web/design/tokens.json` →
  `styles/generated/design-tokens.css` + `lib/design/generated/*`
  (`pnpm --filter @jovie/web run tokens:build`).
- Repo-root `design.tokens.json` is the **generated export** today
  (`pnpm design:tokens:export`; freshness `pnpm design:tokens:export:check`).
  Colors only, dark only — never hand-edit.
- `packages/ui/theme/tokens.ts` maps names to `var(--color-*)`.

### Write-path freeze (Drift W1 / T0.1)

1. **One write SoT.** New product tokens land only on the live write path above
   (emitter and/or compiler-owned `design/tokens.json`), then regenerate exports.
2. **No new `--linear-*`.** The namespace is deprecated and shrink-only
   (`linear-namespace` ratchet). Migrate consumers; never introduce new
   `--linear-*` definitions or references except as part of a removal PR that
   lowers the baseline.
3. **No new carbon shell overrides.** Do not add parallel shell/profile/desktop
   hex ladders (`#101114` / `#0b0c0f` / scenic near-blacks) beside ZiaWI /
   `--noir-ion-*` / semantic surfaces. Scenic paint belongs in justified
   `ext.*` / `art.*` only.
4. **No new feature token packs.** Do not add route- or feature-local token
   files (e.g. `dashboard/tokens/*`) or one-off `--profile-*-radius` literals.
   Extend shared System B scales / primitives, or alias into them.
5. **Phase 2 flip stays parked** until Tim schedules it. Freeze + bans ship
   without flipping the SoT direction.

## Families a token set must cover
Color (surface ladder canvas/shell/card/elevated/floating, text ladder primary to disabled, border subtle/default/strong/focus, accents, status, soft fills), typography (families, size ladder, weights, leading, tracking, marketing responsive roles), spacing (4px beat), sizing (control 28, hit 44, shell and rail widths), radius, shadow/elevation, motion (durations, easings), z-layers.

## Rules
- Components consume semantic tokens only. No raw hex, no `rounded-[Npx]`, no arbitrary spacing; the ratchets only shrink.
- Light and dark share one token name; only values differ per theme.
- One name, one value across Pen and code. Known same-name-different-value hazards found 2026-10-25 (resolve by rendered A/B before generating): radius scale (Pen `radius-xs` 8 vs code `xs` 2), weight bold/heavy (650/700 vs 680), tertiary text (three Pen values vs one code ladder), border strong (alpha .20 vs .26), mono family (Fira Code vs SF Mono first), status info (ion vs ultra).
- Pen-local values that are not product tokens (third-party brand colors, macOS chrome, editorial art gradients, device radii) live in an `ext.*` / `art.*` namespace outside the product source.
- Adding a token: add to the live write path, regenerate, add the Pen variable by generation (never by hand), update `docs/design-system/token-inventory.md` only if it is still maintained, and show the render in the PR.

## Pen variable generation (Phase 2 tool)
Generate `SetVariables({...})` payloads from the JSON (types `color|number|string`, themed values as `{value, theme}` arrays), apply through the locked live canvas, then read back `GetVariables()` and commit a hash-bound `pen-variables.export.json` so CI can diff Pen against the source (`ciReadsLivePen` stays false; CI reads the export). Details: `guides/pen-operations.md`.
