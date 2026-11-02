# Components

## Ownership
`docs/design-system/component-ownership.json` names one owner and one public import per family (18 today). Web routes import web owners from `@/components/canonical`; cross-product primitives come from `@jovie/ui`. Customer and operator (Ovie) surfaces share families; adapters supply data and permissions, not separate implementations. `pnpm component-ownership:test` is a deliberate-red guard.

## One master per concept
- Pen: one master per family with variants as separate reusable components named by family (`atom.*`, `molecule.*`, `organism.*`, `Canonical / ...`). Instances use `descendants` overrides; slots are `slot` frames. No second master by resemblance.
- Code: `packages/ui/atoms` (primitives), `apps/web/components` (feature and shell). Every `source-bound` component has a manifest entry in `docs/design-system/design-conformance-manifest.json` with `penRootId`, `source`, `contractSource`, stories and tests. A null `penRootId` is a gap to close, not a state to keep.
- Status, rails, menus, tables are the known multi-implementation families (9 status badges, 13 rails, 3+ menu stacks as of 2026-10-25). Converge, do not add a tenth.

## Right rail (proposal in the canonical IA doc, defaults ship unless Tim objects)
One `EntityRail`: chrome bar 44px, EntityHeader, exactly three key stats ("Not measured" when unwired), tabs max 4 in fixed order per entity type, PropertyRow list, shared ActivityFeed; width 360 (wide 480) from one `RAIL_WIDTH` token; pushed at >= 1280, overlay below, sheet under lg. Ovie uses the same rail and nav shell, only the registry differs.

## Build flow for a component (golden path first)
1. Art director updates or creates the Pen master (with all states from `docs/design-system/state-matrix.md`).
2. Implementer reads the master (`Get ... resolveVariables`, `Export html-css` or `browser.return-element`), finds the existing owner, changes it, keeps the public contract.
3. Add or update story, test and manifest entry; run `pnpm component-ship-gate` for the touched component.
4. Render evidence: Storybook capture and staging screenshot beside the Pen screenshot.
5. Record defect -> guard if anything was wrong.

Order of work: onboarding -> dashboard/releases/right rail -> public profile -> checkout -> Ovie -> marketing -> Mac/iOS. Native: `docs/design-system/native-ui-convergence-registry.md`.
