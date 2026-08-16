# Visual QA coverage contract

The canonical coverage registry is
[`lib/agent-os/visual-qa/coverage.ts`](../lib/agent-os/visual-qa/coverage.ts).
It registers the web, admin, public, auth, onboarding, waitlist, iOS, and
macOS/Electron representatives together with their fixture, dynamic masks,
founder-locked regions, and diff thresholds. Native entries are explicitly
`unavailable` in this source-only web lane; they are never reported as web
parity evidence.

Run the source and registry check first:

```bash
pnpm --filter @jovie/web run visual-qa:coverage:check
```

Capture the registered Playwright route representatives with a commit-bound
run. The default capture is dark theme and both phases; set the filters when a
smaller slice is needed.

```bash
VISUAL_QA_COVERAGE_RUN_ID=ui-hygiene-20260813 \
GITHUB_SHA="$(git rev-parse HEAD)" \
VISUAL_QA_PHASE=both \
VISUAL_QA_COVERAGE_THEMES=dark \
pnpm --filter @jovie/web run visual-qa:coverage:capture
```

Write the fail-closed evidence receipt:

```bash
VISUAL_QA_COVERAGE_RUN_ID=ui-hygiene-20260813 \
pnpm --filter @jovie/web run visual-qa:coverage:receipt
```

The receipt is written below `agentos/runs/<run-id>/coverage-receipt.json` and
records the manifest hash, source commit state, dynamic-mask declarations,
locked-region baseline/after hashes, thresholds, and explicit unavailable
statuses. A dirty source tree, missing capture, missing hash, or changed locked
region blocks the receipt rather than being normalized into a pass.

Existing snapshot and admin representatives remain linked to their current
Playwright specs and baselines in the registry. The route capture lane does not
rewrite those baselines and does not touch Pen documents or production state.
