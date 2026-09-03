# CI repair addendum for merge-group run 33706221513 (stacked on #17058)

## Why this stack exists

#17058 fixes the component-ship-gate coverage contract that failed PR #16554's
merge-queue runs. Re-validating run 33706221513 surfaced two more blockers the
#17058 branch does not carry:

1. **SystemBErrorFallback.stories.tsx on #17058 still passes the removed
   plural `actions` prop.** PR #16554 converged the component on the singular
   `action` prop (the whole point of JOV-5391), so merging #17058 as-is would
   fail typecheck and the Storybook surface-elevation matrix on the combined
   head. This stack rewrites that story file against the one-action API
   (button + link actions, `fn()` handler, title/decomposition unchanged).
2. **Design-system source ratchet grew on the same merge group.** Stacked PR
   #16937 (chart/metric consolidation) added three `w-[min(...)]` story
   wrappers while removing one `tracking-[-0.011em]`, net +3 arbitrary
   Tailwind values: 2242 measured vs baseline 2239. Growth-only ratchet
   (JOV-5301) fails the group. Following the #16180 precedent recorded in the
   baseline file, this stack locks the measured count at 2242 with a note
   crediting #16937.

## Contents

- `apps/web/components/providers/SystemBErrorFallback.stories.tsx` — corrected
  to the singular `action` API; passes `component-ship-gate` story-match rules
  (import, render, required props) and renders the same two states as before.
- `apps/web/tests/unit/design-system/arbitrary-values.baseline.json` —
  2239 -> 2242 with provenance note.

## Verification

- `evaluateDesignSystemSourceRatchet()` on the queue combined head
  (32fce394): ok=false at baseline 2239 (arbitrary 2242 > 2239) -> ok=true at
  2242 with this baseline; --linear-* 929/930 stays within limit.
- Story file matches the component interface on the combined head:
  `readonly action: SystemBErrorFallbackAction` (button|link union).
- Merge order: #17058 (ship-gate evidence) then this stack, or merge this
  branch into `ci-remediator/pr-16554-ship-gate-fix` before merging #17058
  into `fallback/JOV-5391-fix`. No conflicts either way; then requeue #16554.
