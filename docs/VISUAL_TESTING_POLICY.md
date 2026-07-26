# UI visual coverage rollout

Jovie treats visual evidence as part of a UI change, not as optional follow-up.
This policy applies to UI code and visual infrastructure only; backend-only
changes do not enter these lanes.

## Coverage contract

- Reusable components under `apps/web/components` and `packages/ui` require an
  adjacent Storybook story. `packages/ui/atoms` is ratcheted at 100% coverage.
- Route surfaces (`page`, `layout`, `loading`, `error`, and `not-found` TSX
  files) require Storybook or Playwright visual evidence for the changed state.
- Shared Storybook configuration, styles, design tokens, and the Chromatic
  configuration are UI-relevant changes.
- The merge-group Storybook build, Storybook a11y, Chromatic, and Playwright
  visual lanes remain fail-closed when selected. Missing configuration,
  skipped selected jobs, unreviewed Chromatic changes, HTTP 500s, and unsafe
  Playwright artifacts are failures.
- DB-backed public redirects are marked `requiresDatabase`. DB-free smoke omits
  those routes explicitly; Neon-backed visual runs retain their coverage.

## Forward-only rollout

The `UI Story Coverage Audit` workflow is shadow evidence. It runs for current
main and UI PR changes, uploads a JSON report, and annotates missing coverage or
harness defects without participating in production authorization or merge
readiness.

Gem owns graduation. Change `.github/ui-story-coverage-policy.json` to
`blocking` only after five consecutive clean audit artifacts from authoritative
GitHub runs on the current baseline and representative UI PRs. Record those run
IDs, the activation timestamp, and the first PR number opened after activation.
Validation rejects a blocking policy without all three fields.

PRs opened before activation remain grandfathered. Backend-only PRs are never
selected. Newly opened UI PRs after activation fail on missing evidence.
Material UI additions to an older PR should opt into the new contract during
rebase; the owner records that remediation rather than surprising historical
branches or production builds.

The gate can graduate only when:

1. five consecutive reports are clean;
2. the root Chromatic config resolves from `apps/web`;
3. Storybook build and a11y complete on representative component changes;
4. DB-free and DB-required route inventories are explicit and both have a
   proving lane;
5. artifact scanning remains fail-closed; and
6. Gem documents the activation run IDs and PR cutoff in the policy file.
