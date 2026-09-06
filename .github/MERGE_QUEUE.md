# Merge Queue (GitHub native)

`main` merges through GitHub's native merge queue. The live repository variable
is `MERGE_QUEUE_BACKEND=native`, and ruleset `Main Branch Protection`
(`10512119`) owns queue admission and combined-head validation. Native GitHub is
also the supported stack-construction path: dependent PRs may temporarily target
their immediate parent, then are retargeted and rebased onto `main` after that
parent lands. There is no second landing transport.

## How a PR lands

The owning agent completes review and qualification, marks its PR ready, then
runs `node scripts/native-merge-intent.mjs --repo JovieInc/Jovie --pr NUMBER --head FULL_SHA`.
The command pins the mutation with `--match-head-commit`, verifies native queue
is required, checks current metadata policy, and requests auto-merge once.
GitHub waits for required checks and validates the combined merge-group head.
No admin bypass, blanket queue sweep, or external health controller is involved.

Dependent children remain draft until their parent lands and their exact new
main-based head is qualified. Draft withdrawal and stale heads reject old intent.
Required `Fork PR Gate` revalidates holds, review/fork policy, failure tombstones
and changelog restrictions from trusted main on source and group events.
Production health/binding remain deployment gates, not source admission gates.

## Required contexts and CI stages

Branch protection pins aggregate contexts only—never individual CI jobs.

| Context | Source PR | Native `merge_group` |
| --- | --- | --- |
| `PR Ready` | Path selection, risk classification, `ci-fast` (including the portable iOS contract), diff secret scan, Golden Path Lock | Path selection, risk classification, `ci-fast`, five affected unit shards, one hosted build + layout workspace, path-selected iOS unit + coverage, diff secret scan, Golden Path Lock |
| `Migration Guard` | Path-gated migration policy | Re-emitted and evaluated on the combined head |
| `Fork PR Gate` | Source holds, review/fork policy and failure memory | Revalidates every exact group member before emitting the combined-head context |
| `PR Size Guard` | Source-diff size policy | Revalidates every exact group member before emitting the combined-head context |

Preview, Neon, E2E, Lighthouse, a11y, Storybook, golden-path, and extended-smoke
lanes are hosted manual, scheduled, repository-event, or post-merge work. They
never start from the source-PR event and are not required source `PR Ready`
leaves. No PR label fans out CI. Full security and CodeQL scans remain
post-merge/nightly;
the fast diff secret scan gates source and combined heads.
The full iOS simulator UI and screenshot regression runs only for an authorized
iOS TestFlight generation and must pass before upload.

## Canonical native configuration

Checked-in source: `.github/rulesets/branch-protection.yml`.

- Backend: `native`
- Ruleset id: `10512119`
- Bypass actors: none
- Required status checks are non-strict on source PRs; the combined head owns
  latest-`main` validation.
- Merge method: `SQUASH`
- Grouping strategy: `ALLGREEN`
- Minimum entries to merge: `5` (typed cohort; GitHub waits for this size or the bounded timeout)
- Minimum entries wait: `10` minutes (low-traffic timeout so a partial cohort can still land)
- Maximum entries per merge: `5` (synced to the live ruleset 10512119 readback on 2026-09-04, JOV-5867)
- Maximum entries building concurrently: `1` — the live ruleset builds one combined head at a time (synced 2026-09-04, JOV-5867; do not restore the superseded 2026-08-15 three-prefix canary value)
- Check response timeout: `20` minutes (synced to the live ruleset readback, JOV-5867)
- Stale exact-production: `hold-intake` preserves the admitted cohort and continues isolated implementation. It must not freeze enroll of CLEAN unrelated PRs. `jovie-fleet-queue-hold/v1` is a bounded recovery selector (default 12m TTL) and must expire, succeed, or fail with a terminal reason — never sit pending.
- Live ruleset `10512119` remains `min_entries_to_merge=1` / wait `0` until the post-merge apply. Source and preflight readback already describe the 5/10 cohort; auto-enroll stays up during that pending cutover.
- Signed-commit and non-fast-forward rules: dormant/not applied. The checked-in
  payload intentionally matches live ruleset `10512119`; enabling either is a
  separate reviewed cutover, not an implicit source reapply.

Verify source and live state:

```bash
pnpm ci:merge-queue:check
pnpm ci:merge-queue:verify
gh api repos/JovieInc/Jovie/rulesets/10512119 \
  --jq '{bypass_actors, rules: [.rules[] | select(.type == "merge_queue" or .type == "required_status_checks")]}'
```

`ci:merge-queue:check` (repo YAML only) already runs in `ci-fast`.
`ci:merge-queue:verify` (live ruleset `10512119` via `gh api`) runs in
`.github/workflows/merge-queue-ruleset-verify.yml` on a daily schedule, on
`main` pushes that touch the ruleset/check sources, and on `workflow_dispatch`.
It is not a source `PR Ready` context. Failures notify Slack. Pending native
cohort cutover fields are already exempted in `validateLiveMergeQueueRuleset`.

Bare local controller/check commands default to `native`, matching the live
repository variable. Unknown backends fail closed. Native enrollment/dequeue
mutations additionally require the dedicated controller authorization, so a
bare local command cannot mutate queue state accidentally.

## Reconciliation and loop prevention

See [PR flow](../docs/PR_FLOW.md) for the authoritative source/promotion split.
`native-merge-intent.mjs` reports recorded intent, positioned native entry,
merged, blocked, stale or unknown separately. It rereads after mutation errors
and does not blindly retry. Durable local attempt receipts must survive agent
restart; cross-host uncertain attempts need the same receipt directory.

Ejected PRs return to their owner for diagnosis, not an automatic retry loop.
GitHub's removal `beforeCommit` identifies the synthetic group, not the PR head.
After repairing and qualifying the current head, the owner may supply
`--reconcile-removal NODE_ID --reconciliation-receipt PATH` to the command.
The JSON receipt must use schema `jovie-native-merge-reconciliation/v1` and bind
`repository`, `prNumber`, `headSha`, `removalEventId`, `decision: "retry-once"`,
`owner` (the authenticated GitHub login), and nonempty diagnosis/qualification
`evidence`. Both reads must still match that head, event and owner. Each removal
gets one durable attempt; changing the receipt path or text cannot retry an
ambiguous request. Existing holds and required checks still apply.
Missing CI and conflicts remain repair work. Exact-head required
checks cannot be replaced by labels or a successful observer run.

The old drain, fleet queue freeze, auto-approval and landing sweep paths are
retired. `merge-queue-autoenroll.yml` refuses execution and directs the persistent owning
writer to its exact-head completion command. No independent controller may reconstruct readiness from green jobs.

## Deployment

Production promotion remains independently gated by its existing exact build,
health, credentials and ownership evidence. Native source merging does not
certify deployment or activate Symphony or protected LYB services.
