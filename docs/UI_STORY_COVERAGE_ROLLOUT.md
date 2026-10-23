# UI story coverage rollout

Jovie treats visual evidence as part of a UI change, not as optional follow-up.
This policy applies to UI code and visual infrastructure only; backend-only
changes do not enter these lanes.

## Coverage contract

- Reusable components under `apps/web/components` and `packages/ui` require an
  adjacent Storybook story. `packages/ui/atoms` is ratcheted at 100% coverage.
- **Hard ship gate (JOV-4421 / JOV-5400 / JOV-5454):** `pnpm component-ship-gate` runs
  inside the `ci-fast` structural lane. Changed shippable components must have
  matching tests + stories (import/prop match), green story quality, and
  fail-closed rendered certification receipts. The same gate builds the real
  web Storybook and fail-closes live-browser certification for the enrolled
  canonical Badge, Button, and Card stories. Multi-root floors live in
  `scripts/story-coverage-baseline.json` (schema v2). See
  `docs/VISUAL_TESTING_POLICY.md`.
- Route surfaces (`page`, `layout`, `loading`, `error`, and `not-found` TSX
  files) require Storybook or Playwright visual evidence for the changed state.
- Shared Storybook configuration, styles, and design tokens are UI-relevant
  changes.
- The merge-group Storybook build, Storybook a11y, and Playwright visual
  lanes remain fail-closed when selected. Missing configuration, skipped
  selected jobs, HTTP 500s, and unsafe Playwright artifacts are failures.
- DB-backed public redirects are marked `requiresDatabase`. DB-free smoke omits
  those routes explicitly; Neon-backed visual runs retain their coverage.

## Forward-only rollout

The `UI Story Coverage Audit` workflow is blocking for UI pull requests opened
on or after `2026-10-23T02:55:00.000Z` with number `22700` or higher. Earlier
pull requests stay grandfathered. The activation evidence is five clean
applicable reports:

- [39795196291](https://github.com/JovieInc/Jovie/actions/runs/39795196291)
- [39796515081](https://github.com/JovieInc/Jovie/actions/runs/39796515081)
- [39868623309](https://github.com/JovieInc/Jovie/actions/runs/39868623309)
- [39873145141](https://github.com/JovieInc/Jovie/actions/runs/39873145141)
- [39884653800](https://github.com/JovieInc/Jovie/actions/runs/39884653800)

Workflow success alone is not a clean report. Audit mode used to exit 0 with
findings. These five artifacts have `clean: true` and at least one applicable
UI path.

Components that already have no adjacent story are the baseline allowlist in
`.github/ui-story-coverage-policy.json`. Every entry maps to
[JOV-8847](https://linear.app/jovie/issue/JOV-8847). Do not add paths. Remove
an entry in the same change that adds its story.
`assertBaselineAllowlist` fails when the list and the tree disagree. A changed
component that is not on the list fails the audit. Route surfaces are not
allowlisted.

The check is not a merge-queue required status. It is path-filtered, so
requiring it would stall pull requests that do not run it. Revisit on
2026-11-06, after the workflow reports a passing status on every pull request.

Backend-only PRs are never selected. Newly opened UI PRs after activation fail
on missing evidence.

Activation used the five clean reports above and the recorded cutoff in
`.github/ui-story-coverage-policy.json`. Storybook build, Storybook a11y,
Playwright visual lanes, and artifact scanning stay fail-closed on their own
jobs. This audit does not depend on Chromatic.
