# Web release path: staging, promotion, verification, rollback

Operator entry point for the web application. Source reviewed on 2026-10-16 at
[`64162d7646adfccc6a751a885465c566d26a0402`](https://github.com/JovieInc/Jovie/commit/64162d7646adfccc6a751a885465c566d26a0402).
This describes checked-in controls, not a production certification. Re-read the
sources for the release being handled; repository variables, environment access,
and Vercel rollout settings need their own current evidence. Source admission and
merge remain governed by [PR Flow](../PR_FLOW.md).

## Controlling sources

The revision links pin each file's last change within the reviewed snapshot.
Local path links open the current checkout; compare changes before using this
runbook against a newer controller.

| Source path | Reviewed revision |
| --- | --- |
| [`.github/actions/sentry-error-gate/action.yml`](../../.github/actions/sentry-error-gate/action.yml) | [`323954cb24e0c9cc3cdb993ee489f7b66e5c20fa`](https://github.com/JovieInc/Jovie/blob/323954cb24e0c9cc3cdb993ee489f7b66e5c20fa/.github/actions/sentry-error-gate/action.yml) |
| [`.github/scripts/promote-production-deployment.sh`](../../.github/scripts/promote-production-deployment.sh) | [`94cfbf2c3ae9b6cdc0104a285310fbe007755e4a`](https://github.com/JovieInc/Jovie/blob/94cfbf2c3ae9b6cdc0104a285310fbe007755e4a/.github/scripts/promote-production-deployment.sh) |
| [`.github/scripts/verify-production-alias.sh`](../../.github/scripts/verify-production-alias.sh) | [`0a142c283bd5c56512d42c8da230886b186cceea`](https://github.com/JovieInc/Jovie/blob/0a142c283bd5c56512d42c8da230886b186cceea/.github/scripts/verify-production-alias.sh) |
| [`.github/workflows/canary-health-gate.yml`](../../.github/workflows/canary-health-gate.yml) | [`b2178903aff88d5f4d0e7d873acfdf2bd09a73ac`](https://github.com/JovieInc/Jovie/blob/b2178903aff88d5f4d0e7d873acfdf2bd09a73ac/.github/workflows/canary-health-gate.yml) |
| [`.github/workflows/production-controller.yml`](../../.github/workflows/production-controller.yml) | [`e75c494365b5a457dcecc0f187e87ad10d5aea99`](https://github.com/JovieInc/Jovie/blob/e75c494365b5a457dcecc0f187e87ad10d5aea99/.github/workflows/production-controller.yml) |
| [`.github/workflows/production-marker-recovery.yml`](../../.github/workflows/production-marker-recovery.yml) | [`8fda502295a6d2891c03853b744e5108749d10b2`](https://github.com/JovieInc/Jovie/blob/8fda502295a6d2891c03853b744e5108749d10b2/.github/workflows/production-marker-recovery.yml) |
| [`.github/workflows/production-release.yml`](../../.github/workflows/production-release.yml) | [`6e58e3799fbea865535e203e54a2a9f040223cf7`](https://github.com/JovieInc/Jovie/blob/6e58e3799fbea865535e203e54a2a9f040223cf7/.github/workflows/production-release.yml) |
| [`.github/workflows/staging-controller.yml`](../../.github/workflows/staging-controller.yml) | [`e75c494365b5a457dcecc0f187e87ad10d5aea99`](https://github.com/JovieInc/Jovie/blob/e75c494365b5a457dcecc0f187e87ad10d5aea99/.github/workflows/staging-controller.yml) |
| [`apps/web/vercel.json`](../../apps/web/vercel.json) | [`c06d1f61c3a8ba5b390db887cd5a979bfb644878`](https://github.com/JovieInc/Jovie/blob/c06d1f61c3a8ba5b390db887cd5a979bfb644878/apps/web/vercel.json) |
| [`docs/postmortems/2026-09-26-production-freeze.md`](../postmortems/2026-09-26-production-freeze.md) | [`ed3e8b052fd978c3b70a506b6d55d2c04d4cd2a7`](https://github.com/JovieInc/Jovie/blob/ed3e8b052fd978c3b70a506b6d55d2c04d4cd2a7/docs/postmortems/2026-09-26-production-freeze.md) |
| [`scripts/lib/release-risk-policy.mjs`](../../scripts/lib/release-risk-policy.mjs) | [`9d22d29b724ca10399c4f5320bf2a494b1b24f7c`](https://github.com/JovieInc/Jovie/blob/9d22d29b724ca10399c4f5320bf2a494b1b24f7c/scripts/lib/release-risk-policy.mjs) |
| [`vercel.json`](../../vercel.json) | [`b44c2e21ba809819960d0d6704527fdbae07a9f4`](https://github.com/JovieInc/Jovie/blob/b44c2e21ba809819960d0d6704527fdbae07a9f4/vercel.json) |

## Staging admission and canary

1. A completed successful `CI` push run on `main` wakes **Staging Controller**.
   `authorize-staging` validates the repository, workflow path, full SHA, run ID,
   attempt, and sealed `product-lane-release-<sha>-<attempt>` receipt. A missing
   receipt for current main fails closed. Proven older/unselected generations
   can finish as `superseded` or `not_applicable`; non-Web carryover is validated
   against canonical staging. A neutral completion is not a new staging deploy.
2. Under the non-cancelling `staging-mutation` FIFO, the controller calls
   **Production Release** with `release_mode: staging`. `deploy-staging` performs
   staging DB safety/migration/schema checks, builds and deploys a prebuilt
   **preview**, and `attest-staging-build` attests its build output. See the
   schema exception in the gate table below.
3. **Canary Health Gate** resolves the exact immutable preview deployment ID and
   full SHA before probing it. It checks protected-origin build identity,
   semantic public surfaces, preview noindex behavior, route-specific health
   and chat controls, and interactive public auth controls. It does not rely on
   whichever build currently owns the shared staging alias.
4. After canary and attestation pass, `staging-head` rechecks lineage and
   `alias-staging` assigns the preview to `staging.jov.ie`. It proves the exact
   READY deployment owns that alias, then exercises real Google and Apple UI
   buttons, Better Auth catch-all requests, and staging redirect URIs.
5. `staging-deployment-receipt` preserves `staging-deployment-<sha>` with exact
   identity and route-smoke proof. `staging-result` emits a terminal
   `staging-completion-<attempt>` receipt identifying the original CI attempt.
   Inspect these receipts when staging blocks production; do not substitute a
   green CI badge or an unrelated preview.

## Production authorization and promotion

1. Successful **Staging Controller** completion wakes **Production Controller**.
   `release-source` binds that completion to its original CI attempt;
   `authorize-production` revalidates CI, scoped fleet admission, product-lane
   routing, release risk, and staging evidence. Staging proof can be carried
   from an ancestor only through the controller's lineage/range validation.
2. The controller holds the non-cancelling `production-mutation` FIFO through
   promotion, centralized rollback, post-deploy probes, and finalization.
   Staging has its own FIFO; production does not redeploy staging. Before work,
   stale generations can yield to a queued replacement. Authorized ancestors
   of main may proceed after main advances; the lineage gate bounds starvation.
   A rewind or invalid/missing lineage proof cannot authorize mutation.
3. The sealed risk receipt selects `low`, `medium`, `high`, or `not_applicable`.
   Only `high` sets `full_runtime_proof: true`, adding production migration,
   performance/auth setup, Sentry, and production OAuth work. Low/medium skip
   those selected jobs; they still require staging, exact production candidate,
   promotion, and identity proof. A non-Web no-op needs the controller's live
   production binding proof. Unknown risk or a rule blocking unattended release
   requires its certification packet; it does not silently downgrade the lane.
4. **Production Release**, now with `release_mode: production`, rechecks lineage
   and runs production DB safety, migrations, and schema verification when
   required. In the `Production – jovie` GitHub environment,
   `promote-production` verifies project/domain ownership and builds a
   **separate artifact with production configuration**. It deploys prebuilt with
   `--prod --skip-domain`, waits for READY, checks SHA/input/artifact provenance,
   and probes the exact protected production candidate before promotion. The
   staging preview itself is not promoted into production.
5. After the applicable pre-promotion checks and security gate,
   `promote-production` calls `promote-production-deployment.sh`. The script
   records the previous canonical production deployment, rechecks main lineage,
   submits promotion once, and polls authoritative Vercel state. A CLI timeout
   alone does not justify resubmitting promotion.
6. The script observes Vercel's automatic rolling release. Its documented
   expectation is a 10% hold for five minutes, with an eight-minute default
   convergence window; confirm current Vercel settings separately. It never
   forces rollout completion to 100%. Success requires the exact candidate to
   be READY, Production Current, and free of an active rollout. It preserves or
   restores the canonical staging preview when production rewrites aliases.
7. `verify-production-alias.sh` checks canonical production against the exact
   deployment and full SHA. Both Vercel config files set `github.autoAlias` to
   `false`; a Git integration build or source merge is not promotion authority.

## Gate behavior and final verification

Read job conditions and terminal outputs, not just names such as
“observational.” The following describes the reviewed source:

| Check | Effect |
| --- | --- |
| CI/lineage/risk/staging receipts; candidate provenance; canary; exact alias identity | Fail closed where required by the selected lane. Missing or malformed proof is not success. |
| Staging schema verification | Blocking by default. The workflow contains a conditional commit-message exception, `[skip-schema-verify]`; it is not a general release bypass and is not an input on either controller. |
| Production DB migration/schema verification | Blocking for the high lane, before production promotion. |
| Staging freshness SLO | A breach of ten minutes is a warning preserved in the receipt; exact identity, canary, and alias proof remain blocking. |
| Staged-build and canonical public-profile performance budgets | Budget misses currently warn under the independent graduation policies (JOV-8338); exact build/alias identity remains blocking. Authenticated budget measurements can be explicitly skipped when unconfigured. If configured, establishing authenticated exact-build state must succeed. |
| Sentry observation (high lane) | Five-minute observation versus a thirty-minute reference window, with a 3x rate threshold and a low-baseline absolute-rate branch. Emits `passed`, confirmed `failed`, or uncertain `error`. Confirmed failure requests centralized rollback. Uncertainty blocks release verification without authorizing rollback. |
| Production OAuth observation (high lane) | Binds canonical production to the exact build and exercises real Google/Apple UI redirects through Better Auth. Only structured runtime-contract failures across all retries emit confirmed `failed`. Missing/malformed results emit `error`; both block release verification, but only confirmed failure authorizes rollback. |
| Hosted post-deploy probes | Public semantic/SEO smoke is required after release; Lighthouse is required for high risk. Risk-required authenticated OTP smoke must have configured credentials and an actual passing result. Missing required evidence blocks `Production Verified`. |
| Notification | Best effort after the verified marker; a notification failure does not erase verified deployment truth. |

The controller keeps its production lease while hosted probes target the exact
immutable production URL. `Production Verified` then checks canonical deployment
identity/full SHA and runs the [Done-sprint invariant rescan](done-sprint-invariants.md)
against that same immutable build. It preserves a payload-bound
`production-generation-verified-<sha>` marker (or its bounded recovery variant).
An authoritative marker also requires the producing controller attempt to have
completed successfully and its exact `Production Verified` job to have succeeded;
an artifact upload alone is insufficient. If main advanced, proof remains bound
to the deployed generation and does not certify the newer main SHA. Intentional
supersession before promotion leaves `released=false` and writes no success marker.

## Centralized rollback and promotion cleanup

The sole post-promotion rollback owner is `rollback-production` in
`production-release.yml`, under the caller's production FIFO. It runs only after
successful exact-SHA promotion when Sentry or OAuth emits confirmed `failed`.
Immediately before mutation it proves canonical production is still the failed,
READY production deployment, validates a distinct recorded previous deployment,
then explicitly rolls back to that previous ID. It polls canonical production
until the previous deployment is READY/current before setting `rolled_back=true`.
A completed rollback still leaves the release failed; it is not successful
certification of the attempted generation.

An uncertain gate result, missing ownership, or a foreign deployment never
licenses rollback. Separately, the promotion script can abort an **owned active
rollout** if convergence fails and verify cleanup; it refuses foreign rollouts.
That bounded in-flight cleanup is distinct from the centralized post-promotion
rollback. Neither mechanism undoes database migrations; database changes must
remain compatible with the prior application build.

## Break-glass boundary (JOV-6688)

[JOV-6688](https://linear.app/jovie/issue/JOV-6688) specifies a sanctioned
`workflow_dispatch` promote path inside the existing production FIFO: choose the
newest fully gated staged production deployment on main's ancestry, retain a
receipt, and run normal verification without a new credential holder. **That
promotion dispatch is not implemented in the reviewed controller/release
workflows.** The [production-freeze post-mortem runbook](../postmortems/2026-09-26-production-freeze.md#runbook-until-the-controls-ship)
requires explicit human authorization for a manual promotion until that control
ships. This document grants no ad hoc local production mutation authority.

`production-marker-recovery.yml` already has manual inputs for exact SHA,
deployment ID, original controller run, and attempt. It shares the production
FIFO and re-proves an **already deployed** generation while canonical production
still owns it. It never redeploys, promotes, mutates aliases, or rolls back, so it
cannot serve as the JOV-6688 promotion escape hatch.

## Operator evidence checklist

- [ ] Record source SHA, CI run/attempt, staging controller run/attempt, and the
  sealed staging completion/deployment receipts; identify any carryover/no-op.
- [ ] Record production controller run/attempt, selected risk lane and required
  proof, exact candidate deployment ID, and previous canonical deployment ID.
- [ ] Inspect canary, promotion, Sentry/OAuth outputs, and centralized rollback
  outcome; distinguish confirmed regressions, uncertainty, and policy skips.
- [ ] Require the exact controller/job success and verified-generation marker,
  immutable post-deploy probe results, canonical identity, and invariant rescan
  before describing that generation as verified production.
- [ ] Keep credentials and raw authenticated artifacts out of release notes and
  handoffs. Cite repository paths, source revisions, run links, and safe receipt
  identities; read credential configuration only through the existing workflows.
