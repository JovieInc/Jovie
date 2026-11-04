# Launch readiness

This is the bar for calling the artist golden path launch-ready. It has two parts: what a machine can check (all of it must be blocking and green) and what only Tim can judge (taste). Tim signs off on the bar; after that, CI and the Production Controller enforce it without a human.

Last audited: 2026-10-24. Owner of the audit: the golden-path blocking stream (log: `fleet/golden-path-blocking.md`).

## The golden path

1. Find Jovie (homepage, search your name, pricing).
2. Sign up or sign in (Better Auth email code, OAuth).
3. Claim the profile (onboarding, handle, immutable creator entity).
4. Catalog and links render on `jov.ie/<handle>` and every release page. No 404 or placeholder for a linked release.
5. A fan follows or subscribes.
6. The artist sees the follower in the dashboard.

## Where each check runs, and whether it blocks

"Blocks merge" means the check is in the merge-queue `PR Ready` aggregate (or another required context) and a failure keeps the change out of `main`. "Blocks release" means a failure stops promotion to jov.ie or withholds the Production Verified marker. "Rolls back" means the controller reverts production on failure. "Alerts on drift" means something pages when production changes without a deploy (data edits, provider changes, expired secrets).

Required contexts on `main`: `PR Ready`, `Migration Guard`, `Fork PR Gate`, `PR Size Guard`. `PR Ready` on a pull request is a light aggregate (path changes, risk classifier, `ci-fast`, exact-head coverage, secret scan, Golden Path Lock, visual compare). `PR Ready` on a merge group adds unit tests, build and layout, Lighthouse for launch-gate paths, and database certification. Before this work, no browser journey was in either aggregate.

### Before (main at 2026-10-24)

| Step | Merge | Release | Drift alert |
| --- | --- | --- | --- |
| 1 Find Jovie | Golden Path Lock (unit, no browser): blocks. `ci-profile-admission-browser`: blocks only when profile files change | Staged canary fetches `/`, `/pricing` on the exact build: blocks promote | Synthetic monitor every 6h: pages, does not block |
| 2 Sign up / sign in | Unit tests only. Browser auth specs run on manual dispatch: does not block | Pre-promotion auth smoke (high-risk lane only), post-deploy auth smoke: withholds Production Verified. OAuth gate: rolls back | Synthetic Layer A auth UI every 6h: pages. OTP sign-in is not monitored on a schedule (needs Tim-only secrets) |
| 3 Claim profile | Unit tests only. `Golden Path (manual)` is dispatch-only; on `main` pushes it has `continue-on-error` | Post-deploy auth smoke stops at the dashboard shell; it does not check the claim | Nightly `Golden Path Nightly` files a Linear issue when the real-auth lane fails; blocks nothing. Onboarding robot is skipped (JOV-8809) |
| 4 Profile and release pages | Not covered by any blocking check | Staged canary checks `/tim` renders; no release page is opened | `public-profile-smoke.spec.ts` runs only in the 6-hourly synthetic monitor: pages, does not block. It never opened a release page |
| 5 Fan subscribe | Not covered | Not covered | Not covered on a schedule |
| 6 Artist sees follower in dashboard | Not covered | Not covered | Not covered |

### After this work (state at 2026-10-25 02:30Z)

| Step | Merge | Release | Drift alert |
| --- | --- | --- | --- |
| 1 Find Jovie | Unchanged | Unchanged | Unchanged |
| 2 Sign up / sign in | Blocking journey, **pending**: #23056 (draft, see below) | Promotion gate (see 3). Post-deploy auth smoke unchanged | Unchanged |
| 3 Claim profile | Blocking journey, **pending** #23056: real Better Auth sign-up, onboarding, handle claim, profile edit, link save, merge-group `PR Ready` only | Post-deploy auth smoke asserts the claimed profile and its public page (#23033, merged). The pre-promotion journey gate now demands exact-SHA Golden Path evidence for any range touching auth, billing, public UI, proxy or database (#23073, open) | Unchanged |
| 4 Profile and release pages | Blocking journey, **pending** #23056 (creates a release, opens its smart link and the signed-out profile) | Production and staged canary open every release linked from `/tim` and fail on non-200, Coming soon or a missing title: **blocks promote** (#23049, merged) | Synthetic monitor plus #23030 (legacy slugs, clean 404; draft until #23027 and #23029 are live) |
| 5 Fan subscribe | Not blocking yet (proof branch only) | Not covered | #23030 adds a subscribe probe to the monitor |
| 6 Artist sees follower in dashboard | Not blocking yet (proof branch only) | Not covered | Not covered |

Merged so far: #23049 (release walk blocks promotion), #23033 (claim assertion in the post-deploy auth smoke), #23027 and #23029 (release slug defects). Open: #23073 (promotion input), #23056 (blocking journey), #23030 (release and legacy-slug monitor).

**Why #23056 is still draft.** It proves itself by running in CI before it can eject the queue. The first proof runs found real obstacles, fixed in the branch: a cold dev server (now a standalone build), an add-release drawer reset by Escape, and an onboarding state persistence lag (retried and annotated as `onboarding-state-lag`). The remaining failure is the add-release drawer: after choosing "Add manually" the dropdown item stays visible and the title input loses focus and characters (observed value `Golde` for `Golden Path Single`). That may be a real product defect for a fast user, not only a test race. It is the open item before the journey can block merges.

Steps 5 and 6 are the open gaps. The blocking journey ends at checkout; it does not subscribe a fan or read the follower back. The fan-subscribe helper exists on a proof branch (`gp/journey-fan`); it cannot go in until the journey itself is green.

## The bar

The path is launch-ready when all of these hold.

1. **Every step has a blocking check at merge and at release.** Each of the six steps above has at least one check in the merge-group `PR Ready` and one in the release path, and the controller promotes or rolls back on its result. A check that is dispatch-only, `continue-on-error`, path-selected away, or warn-only does not count.
2. **Every blocking check has a deliberate-red proof.** A recorded run (or test) in which the regression is injected and the gate fails. The proof is linked from the PR that introduced the gate.
3. **Green in production for 7 consecutive days.** Proposal: N = 7. During the window, every scheduled synthetic run is green (4 per day), every Production Controller run ends Production Verified, and the real-auth nightly lane is green. A single red run resets the count to zero. Seven days covers a full weekly cycle of merges and data edits; shorter windows missed the Oct 20 to Oct 22 failures that were only caught after two days.
4. **Zero open P0 or P1 golden-path defects** in Linear, including the release-slug defects (#23027, #23029) deployed and verified on production.
5. **No warn-only golden-path gate.** The public-profile alias performance gate (JOV-8737) graduated to blocking on the 2026-10-31 receipt (14/14); keep it blocking or remove it from the golden path.
6. **Alerting reaches a human.** A failed synthetic run opens or updates one Linear issue and posts to `#alerts-production`; verified by a deliberate-red run of the monitor.

## Taste items for Tim

A machine cannot judge these. Each has a proposed default that ships if unanswered.

- Homepage "find me" flow: does it read as an invitation to claim a profile? (Default: ship current copy.)
- Onboarding chat: tone and number of questions before the profile is live. (Default: current flow.)
- Sign-in email and code email wording and sender name.
- Release page design: ordering of streaming services, the artwork crop, the empty state when a service link is missing.
- "Coming soon" treatment for genuinely upcoming releases (#23029 limits it to those; the visual is a taste call).
- Fan subscribe: wording of the confirmation and the first email.
- Dashboard follower view: what the artist sees on day one with zero followers.
- Pricing and launch offer (JOV-8368): numbers and plan names.
- Whether the legacy `take-me-over` style redirects should be permanent for every re-slugged release or only the shared ones.

## How a gate is proven to block

1. Add the gate and open the PR.
2. On a throwaway branch, inject the regression the gate exists to catch (break a link, return 404, remove the claim write, change the heading).
3. Run the gate. It must fail with a message that names the regression.
4. Paste the failing run or test output into the PR. Delete the branch.

## What blocks what, in one picture

Merge queue (`PR Ready`) → staging deploy and canary (blocks alias) → production stage and canary (blocks promote, includes the linked-release walk) → sentry and OAuth gates (roll back) → post-deploy smoke and auth smoke (withhold Production Verified) → synthetic monitor every 6h (pages).
