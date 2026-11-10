# Code parity (Pen <-> code)

Contract: tokens flow code -> Pen (generated). Components are art-directed in Pen and implemented in code; CI proves code still matches.

## Gates that exist today
`pnpm design:conformance:gate` (tests + `design:conformance:check` + OKLCH palette + shared-UI arbitrary-value ratchet + frontend-skill check), `pnpm design:tokens:export:check`, `pnpm design:authority:check`, `pnpm design:drift-ledger:check` (`docs/design-system/drift-ledger.json`), `pnpm component-ownership:test`, `pnpm design-eight-invariants:test`, `pnpm component-ship-gate` per touched component, weekly `design:governance:audit`. CI never reads the live Pen (`ciReadsLivePen:false`).

## What parity means
For each component with a manifest entry: same token bindings, same dimensions and states as the Pen master, same contract (props and states), story per reachable state, and a rendered capture. Pen side comes from a committed, hash-bound export (variables + component specs), not the live canvas.

## Procedure: code matches Pen (generated, not hand built)
`pnpm design:pen-codegen --file <pen> --node <frameId> --section <name> --out <tsx> [--rules <json>] [--public-dir apps/web/public/pen/<name>] [--report <json>]` (or `--export-html <html-css export>` when the export already exists). It reads the attached Pen canvas read-only (`pen interactive -a desktop`, Export `html-css`, asserts the file exists) and emits a server component:
- root `<section data-pen-section="<name>">`; layout is a 12-column CSS grid (1440, 96px margins, 24px gutters) with Pen x snapped to columns and y kept as spacing-scale margins; background images become `next/image` with asset paths.
- every color resolves to a `design.tokens.json` semantic utility, text to the DS type scale or a type role, `Primary` pills to `Button`; the nav is left to the shared layout. No raw colors, no arbitrary values, no inline styles.
- Deterministic first. Anything the rules cannot decide (unmapped color, off-scale type, missing link, nested layout, overlap, missing asset) FAILS the run with the full list. A model pass answers by adding a reviewed entry to a rules file (`colorOverrides`, `typeOverrides`, `links`, `components`, `typeRoles`), never by editing generated output; the report lists every snap used. Preferred fix is in Pen, then delete the entry.
- Then: format with Biome, register the section in the route's `docs/design-system/pen-bindings.json` row, run `pnpm design:pen-diff`, and attach the report plus the diff evidence. Regenerate instead of hand-patching; a hand edit that Pen cannot express is a rules entry.
- Tests: `pnpm design:pen-codegen:test` (golden file, token mapping). Rules: `scripts/design-pen-codegen.rules.json`.

## Procedure: Pen matches code (new atoms, captures)
Load Storybook/staging in the `browser` tool, `import-to-canvas` the element, then have the art director refine it into a master. Mark it in the manifest only after the implementation is rebound.

## Drift triage
Read `docs/design-system/drift-ledger.json` (rawPalette, arbitrary, rawButton, linearToken, dangerAlias, oversizeControl, statusFamily, railFamily). Fix by converging onto the owner, never by adding allowlist entries. Allowlists and baselines only shrink.
