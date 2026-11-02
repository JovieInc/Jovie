# Code parity (Pen <-> code)

Contract: tokens flow code -> Pen (generated). Components are art-directed in Pen and implemented in code; CI proves code still matches.

## Gates that exist today
`pnpm design:conformance:gate` (tests + `design:conformance:check` + OKLCH palette + shared-UI arbitrary-value ratchet + frontend-skill check), `pnpm design:tokens:export:check`, `pnpm design:authority:check`, `pnpm design:drift-ledger:check` (`docs/design-system/drift-ledger.json`), `pnpm component-ownership:test`, `pnpm design-eight-invariants:test`, `pnpm component-ship-gate` per touched component, weekly `design:governance:audit`. CI never reads the live Pen (`ciReadsLivePen:false`).

## What parity means
For each component with a manifest entry: same token bindings, same dimensions and states as the Pen master, same contract (props and states), story per reachable state, and a rendered capture. Pen side comes from a committed, hash-bound export (variables + component specs), not the live canvas.

## Procedure: code matches Pen
1. Export the master's resolved values (`Get ... resolveVariables`, `Export html-css`) from the locked canvas or from the committed export.
2. Implement in the owner; use tokens only.
3. Capture Storybook and staging; compare side by side with the Pen screenshot (system-1 judge for the first pass, human taste after ship).
4. Update manifest (`penRootId`, `sourceDigest`), run the gates, attach evidence.

## Procedure: Pen matches code (new atoms, captures)
Load Storybook/staging in the `browser` tool, `import-to-canvas` the element, then have the art director refine it into a master. Mark it in the manifest only after the implementation is rebound.

## Drift triage
Read `docs/design-system/drift-ledger.json` (rawPalette, arbitrary, rawButton, linearToken, dangerAlias, oversizeControl, statusFamily, railFamily). Fix by converging onto the owner, never by adding allowlist entries. Allowlists and baselines only shrink.
