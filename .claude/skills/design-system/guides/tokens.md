# Tokens

## Source of truth
Target (Tim, 2026-10-25): `design.tokens.json` is the single token source. From it we generate (a) the CSS custom properties in `apps/web/styles/` and the TS exports, and (b) the Pen variables. Pen does not originate token values.

State today (read before editing, it is not yet the target):
- `apps/web/styles/design-system.css` emits the live values (Noir Ion anchors `--noir-ion-*`, `--color-*-token`, `--space-*`, `--duration-*`, `--ease-*`, `--shadow-*`, `--font-*`, `--text-*`).
- `design.tokens.json` is generated from it by `scripts/generate-design-tokens-export.mjs` (`pnpm design:tokens:export`, freshness: `pnpm design:tokens:export:check`). Colors only, dark only.
- `apps/web/design/tokens.json` compiles to `styles/generated/design-tokens.css` and `lib/design/generated/*` (`pnpm --filter @jovie/web run tokens:build`); `apps/web/design/ziawi-color-sot.json` projects Pen node ZiaWI for color.
- `packages/ui/theme/tokens.ts` maps names to `var(--color-*)`.
Until the Phase 2 flip PR merges, change a value in the emitting file and regenerate the export; do not hand-edit generated files or `design.tokens.json`.

## Families a token set must cover
Color (surface ladder canvas/shell/card/elevated/floating, text ladder primary to disabled, border subtle/default/strong/focus, accents, status, soft fills), typography (families, size ladder, weights, leading, tracking, marketing responsive roles), spacing (4px beat), sizing (control 28, hit 44, shell and rail widths), radius, shadow/elevation, motion (durations, easings), z-layers.

## Rules
- Components consume semantic tokens only. No raw hex, no `rounded-[Npx]`, no arbitrary spacing; the ratchets only shrink.
- Light and dark share one token name; only values differ per theme.
- One name, one value across Pen and code. Known same-name-different-value hazards found 2026-10-25 (resolve by rendered A/B before generating): radius scale (Pen `radius-xs` 8 vs code `xs` 2), weight bold/heavy (650/700 vs 680), tertiary text (three Pen values vs one code ladder), border strong (alpha .20 vs .26), mono family (Fira Code vs SF Mono first), status info (ion vs ultra).
- Pen-local values that are not product tokens (third-party brand colors, macOS chrome, editorial art gradients, device radii) live in an `ext.*` / `art.*` namespace outside the product source.
- Adding a token: add to the source, regenerate, add the Pen variable by generation (never by hand), update `docs/design-system/token-inventory.md` only if it is still maintained, and show the render in the PR.

## Pen variable generation (Phase 2 tool)
Generate `SetVariables({...})` payloads from the JSON (types `color|number|string`, themed values as `{value, theme}` arrays), apply through the locked live canvas, then read back `GetVariables()` and commit a hash-bound `pen-variables.export.json` so CI can diff Pen against the source (`ciReadsLivePen` stays false; CI reads the export). Details: `guides/pen-operations.md`.
