# Release-marker recovery runbook

**Subsystem:** `.github/workflows/production-marker-recovery.yml` +
`.github/scripts/production-marker-state.mjs` +
`.github/workflows/production-controller.yml` +
`.github/workflows/production-release.yml` +
`scripts/lib/production-lane-range.mjs`

**Severity:** P0 when a generation has successfully promoted to production but
the durable `production-generation-verified-<sha>` artifact is missing or
interrupted, because the release lineage cannot be proven to downstream
controllers.

**Owner:** Shipping-Control / on-call operator with repo admin and Vercel access.

## Entry criteria

Enter this runbook when all of the following are true:

- `.github/scripts/production-marker-state.mjs` reports
  `state: "recovery_available"` for the target SHA.
- The `Production Controller` run ended successfully but did not upload a
  verified marker (e.g., artifact upload lag, post-write failure, or the
  `production-generation-verified-<sha>` artifact expired before the classifier
  observed it).
- The canonical production alias `jov.ie` already serves the generation.
- The original controller run's `Centralized production rollback` job was
  `skipped` (the generation was not rolled back).

## Exit criteria

Do not leave the runbook until all of the following are true for at least
5 minutes:

- A fresh `production-generation-verified-<sha>` artifact exists and is
  non-expired.
- `.github/scripts/production-marker-state.mjs` returns `state: "verified"`
  for that SHA.
- The artifact payload binds the recovery run to the exact source controller
  run and attempt.
- `Fleet Gate Refresh` has been dispatched at least once after the marker was
  uploaded, so the fleet gate can observe the new verified state.

## 1. Safe stop / kill switch

Do not start a new production promotion for the same SHA while marker recovery
is in flight. If a newer `main` generation has already started promoting, abort
recovery for the older SHA and let the newer generation proceed.

To cancel an in-progress recovery workflow:

```bash
gh run cancel <production-marker-recovery-run-id> --repo JovieInc/Jovie
```

## 2. Inspect current state and blast radius

Resolve the target SHA and confirm canonical ownership:

```bash
cd "$JOVIE_REPO"
sha=<40-hex main SHA>
node .github/scripts/assert-live-production-bind.mjs --main-sha "$sha"
```

Inspect the source controller run:

```bash
gh run view <source-controller-run-id> --repo JovieInc/Jovie
```

Check the source jobs to confirm promotion succeeded and rollback was skipped:

```bash
gh api repos/JovieInc/Jovie/actions/runs/<source-controller-run-id>/attempts/1/jobs?per_page=100
```

Classify marker state:

```bash
controller_id=$(gh api repos/JovieInc/Jovie/actions/workflows/production-controller.yml --jq '.id')
node .github/scripts/production-marker-state.mjs \
  --sha "$sha" \
  --repo JovieInc/Jovie \
  --controller-workflow-id "$controller_id"
```

Confirm the canonical production deployment ID matches the source generation:

```bash
./node_modules/.bin/vercel inspect jov.ie --format=json --scope "$VERCEL_ORG_ID"
```

## 3. Quarantine harmful work

During recovery:

- Do not trigger a new production release for the same SHA.
- Do not manually delete or rename artifacts.
- Do not run `vercel promote` or `vercel alias` outside the controller.
- If the source generation is suspected to be bad, do not recover the marker;
  instead follow the centralized rollback path in
  `.github/workflows/production-release.yml`.

## 4. Replay or resume safe work

If the classifier shows `recovery_available` with
`reason: "one_interrupted_marker_safe_to_rerun"`, the preferred first step is
to request one full rerun of the original `Production Controller` run. That
rerun will emit the recovery lease artifact and proceed through the normal
verification path.

```bash
gh run rerun <source-controller-run-id> --repo JovieInc/Jovie
```

If the lease already exists or the controller cannot be rerun, dispatch the
recovery workflow manually with the exact source evidence:

```bash
gh workflow run production-marker-recovery.yml --repo JovieInc/Jovie \
  -f sha=<sha> \
  -f deployment_id=<dpl_...> \
  -f controller_run=<source-controller-run-id> \
  -f controller_attempt=1
```

The recovery workflow will:

- Verify the canonical production alias owns the exact deployment.
- Re-probe the production Better Auth OAuth runtime.
- Upload a new `production-generation-verified-<sha>` artifact with the
  recovery binding.

It never redeploys, never mutates aliases, and never rolls back.

## 5. Reconcile ambiguous external effects

If the recovery workflow fails because the canonical alias no longer owns the
expected deployment, the generation has been superseded or rolled back. Do not
overwrite the marker; instead let the current generation establish its own
marker through the normal controller path.

If the OAuth re-probe fails, the production runtime may have regressed. The
marker must not be recovered; treat it as a production incident and follow
`docs/ON_CALL_PROCESS.md`.

If the recovery workflow reports a duplicate or expired artifact race, inspect
all marker artifacts before retrying:

```bash
gh api repos/JovieInc/Jovie/actions/artifacts?name=production-generation-verified-$sha&per_page=100
gh api repos/JovieInc/Jovie/actions/artifacts?name=production-generation-verified-recovery-$sha&per_page=100
```

## 6. Restore / recover data

The only durable state to recover is the verified-generation artifact. The
recovery workflow regenerates it; do not hand-edit the JSON.

If you need to preserve pre-recovery evidence:

```bash
mkdir -p /tmp/jovie-marker-evidence
gh api repos/JovieInc/Jovie/actions/runs/<source-controller-run-id> > /tmp/jovie-marker-evidence/source-run.json
gh api repos/JovieInc/Jovie/actions/runs/<source-controller-run-id>/attempts/1/jobs > /tmp/jovie-marker-evidence/source-jobs.json
```

## 7. Verify recovery completion

After the recovery workflow succeeds:

```bash
node .github/scripts/production-marker-state.mjs \
  --sha "$sha" \
  --repo JovieInc/Jovie \
  --controller-workflow-id "$controller_id"
```

Confirm all of the following:

- `state` is `"verified"`.
- `reason` is `"exact_recovered_generation_verified"`.
- `controllerRun` is the source controller run ID.
- `controllerAttempt` is `1` (the recovery workflow's own run is not the
  controller attempt; the artifact binds to the original controller run).
- The artifact payload contains `recoveredFromControllerRun` and
  `recoveredFromControllerAttempt` matching the source controller.

Also verify the artifact listing:

```bash
gh api repos/JovieInc/Jovie/actions/artifacts?name=production-generation-verified-$sha&per_page=100
```

Exactly one non-expired artifact named `production-generation-verified-<sha>`
should exist.

Finally, dispatch a fresh fleet gate refresh so downstream controllers observe
recovery:

```bash
gh workflow run fleet-gate-refresh.yml --ref main --repo JovieInc/Jovie
```

## 8. Communicate affected-user scope

Marker recovery is normally bookkeeping after a successful promotion; it has
no direct user-facing change. If the recovery exposes a missing or broken
promotion, follow the incident format in `docs/ON_CALL_PROCESS.md`:

```text
[P0] Release marker interrupted for <sha>
Status: Monitoring | Resolved
Impact: Release provenance gap; no user-facing change if promotion succeeded
Started: <time PT + UTC>
Owner: <name>
Recovery runbook: scripts/symphony/runbooks/release-marker-recovery.md
Next update: <time>
```

## 9. Audit trail, permissions, and break-glass

- **Who can run this runbook:** Shipping-Control owners and operators with
  `actions: write` and Vercel access.
- **Audit:** keep workflow run logs and the artifact payload. The recovery
  workflow writes a step summary with the exact deployment ID and OAuth probe
  outcome.
- **Break-glass:** if GitHub or Vercel APIs are unreachable, the marker cannot
  be recovered safely. Escalate to the owner of the GitHub organization and
  Vercel account.
- **Safety invariant:** recovery never redeploys, never mutates aliases, and
  never rolls back. It only re-proves an already-deployed generation.

## 10. Runbook freshness and stale-command checks

This runbook is automatically validated by
`scripts/symphony/lib/__tests__/release-marker-recovery.test.ts`. The test
checks that the runbook contains the required recovery sections and that every
repo-relative path it references exists.

When you change the following files, update this runbook and the test together
in the same PR:

- `.github/workflows/production-marker-recovery.yml`
- `.github/workflows/production-controller.yml`
- `.github/workflows/production-release.yml`
- `.github/scripts/production-marker-state.mjs`
- `scripts/lib/production-lane-range.mjs`
- `.github/scripts/verify-production-alias.sh`
- `.github/scripts/assert-live-production-bind.mjs`
- `.github/workflows/fleet-gate-refresh.yml`
- `scripts/symphony/runbooks/production-controller-recovery.md`
- `docs/ON_CALL_PROCESS.md`
