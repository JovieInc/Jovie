# Merge Queue (Graphite)

`main` merges go through the **Graphite merge queue**, not GitHub's native merge queue. Graphite rebases each PR on the latest `main`, runs the required aggregate checks against the rebased commit, and merges when green — batching stack-aware so independent PRs test in parallel.

> History: this repo previously used GitHub's native merge queue (a `merge_queue` rule in the `Main Branch Protection` ruleset). That was retired on 2026-06-18 — the two systems are mutually exclusive, and Graphite owns the queue now.

## How a PR gets merged

1. Open a PR against `main`. CI runs the normal PR lane (`CI / PR Ready`, `CI / Migration Guard`, `Fork PR Gate`).
2. Apply the **`merge-queue`** label (this is Graphite's enqueue trigger). Automation does this for you:
   - Agent pipeline, Dependabot, Sentry/main autofix, screenshots, and landing sweep apply `merge-queue` after their gates pass (see `.github/workflows/`).
   - Humans/agents can do it directly: `gh pr edit <pr> --add-label merge-queue` (or `gt merge`, or the Graphite app).
   - If a PR is later hard-gated with `needs-human`, `hold`, or `gated`, remove
     `merge-queue` so it stops occupying Graphite queue slots.
   - `fast` is not a general priority label. Use it only for PRs explicitly
     classified as emergency/hotfix/incident, or for the guarded UI fast lane
     below. Ordinary generated branches with `fast` are gated for human review
     by the merge-queue guard.
3. Graphite enqueues the PR, rebases it on `main`, waits for the required checks, and squash-merges.
4. `linear-sync-on-merge.yml` transitions the Linear issue to `Done` on merge as before.

Do **not** use `gh pr merge --auto` to merge to `main` — with the native queue retired it merges directly and **bypasses Graphite**. Use the label.

## Guarded UI fast lane

Small visual-only PRs can use Graphite fast-track without waiting behind
unrelated backend trains when all of the following are true: labels `ui`,
`fast-track-ui`, `fast`, and `merge-queue`; changed files limited to UI visual
surfaces, design docs/assets, or the directly affected UI test; PR body
before/after screenshots plus an eligibility/checks audit trail; narrow
typecheck, Biome/lint, and affected component/test evidence when one exists.

The fast lane fails closed for auth, billing, DB/migrations, API routes,
entitlements, data writes, security/CSP, infra/cron, routing behavior, package
manifests, CI, and broad refactors. Repo-side classification lives in
`scripts/lib/merge-queue-guard.mjs` (`uiFastTrackPolicy`), and the regression
coverage is in `scripts/lib/__tests__/merge-queue-guard.test.mjs`.

## Verified configuration (2026-06-20, JOV-3291 / #11175)

Repo-side guardrails live in `scripts/lib/merge-queue-guard.mjs` and are enforced by `pnpm ci:merge-queue:check` (Structural Contract lane). Live ruleset verification: `pnpm ci:merge-queue:verify` (needs `gh` auth).

### Required checks: aggregates only

Graphite and branch protection must wait on **aggregate** contexts only — never individual CI jobs (`ci-fast`, `Typecheck`, `Unit Tests`, Lighthouse lanes, …). Pinning a leaf job causes a batch failure to evict siblings instead of bisecting to the culprit.

| Context | Role |
| --- | --- |
| `CI / PR Ready` | Single merge gate — fans in typecheck, biome, guardrails, structural contract, unit tests, risk classifier, and risk-triggered preview evidence (build is advisory) |
| `CI / Migration Guard` | Path-gated schema/migration safety (independent aggregate) |
| `Fork PR Gate` | Blocks unreviewed fork PRs (auto-passes for agents + team) |
| `PR Size Guard` | Caps PR size (800 lines / 40 files); `big-pr` label opts out |

**Queue CI is the PR's own CI.** Graphite runs on every PR directly (not draft-batch mode), so `gtmq_*` batch branches are never created and the former slim-lane `if:` conditions were removed from `ci.yml` (#13610). Graphite does not use GitHub `merge_group` events. If batching mode is ever re-enabled, the slim-lane conditions must be restored with it — see `docs/PR_FLOW.md` §2 and the 2026-06-22 post-mortem.

### Graphite dashboard (`app.graphite.com/settings/merge-queue`) — OWL/human verify

These settings have no CLI/API; confirm in the Graphite UI after any queue incident:

| Setting | Expected value | Why |
| --- | --- | --- |
| Merge strategy | Squash | Matches `required_linear_history` + agent squash flow |
| Merge queue label | `merge-queue` | Matches automation in `drain-pr-queue.sh`, agent pipeline |
| Auto-enqueue rule | PRs labeled `merge-queue` | Matches auto-enroll workflow |
| Optimistic / parallel batching | **On** | Independent PRs test in parallel under agent volume |
| Parallel batch size | **4** | Balances throughput vs. bisection cost (tune in dashboard) |
| Bisect on batch failure | **On** | One bad PR must not fail its siblings — isolate culprit, requeue rest |
| CI optimization | **On** | `optimize_ci` job in `ci.yml` skips redundant PR CI Graphite re-validates |
| Queue timeout | **≤ 60 min** | Prevents a regression from hanging the queue |
| Max queue depth | **12** | Source-of-record: `GRAPHITE_QUEUE_POLICY.maxQueueDepth` in `scripts/lib/merge-queue-guard.mjs`; agent workflows read it via `node scripts/ci-merge-queue-check.mjs max-queue-depth` |
| Per-agent enqueue rate | **≤ 6/hour** | Prevents one agent from flooding the queue (set in Graphite if available) |
| Push actor | `graphite-app` | Must be able to push through protected `main` |

Bisection behavior is also unit-tested in `scripts/lib/__tests__/merge-queue-guard.test.mjs` (`bisectBatchFailure`) so a single failing PR in a batch requeues siblings instead of failing the whole batch.

### GitHub (ruleset `Main Branch Protection`, id `10512119`) — `gh`-configurable

- Required status checks: `PR Ready`, `Migration Guard`, `Fork PR Gate`, `PR Size Guard` (strict / up-to-date). Verify live: `gh api repos/JovieInc/Jovie/rulesets/10512119 --jq '.rules[]|select(.type=="required_status_checks")|.parameters.required_status_checks[].context'`
- `required_linear_history`, `required_signatures`, `non_fast_forward`, `deletion`, `pull_request` (0 approvals).
- **No `merge_queue` rule** (retired).
- **Bypass actor: `graphite-app` (App ID `158384`), `bypass_mode: always`** — required so Graphite can merge through the protected branch. Source-of-record: `.github/rulesets/branch-protection.yml`.

Verify live ruleset:

```bash
gh api repos/JovieInc/Jovie/rulesets/10512119 \
  --jq '.rules[] | select(.type=="required_status_checks") | .parameters'
pnpm ci:merge-queue:verify
```

### Signed commits (human/admin apply)

The ruleset source adds `required_signatures` so unsigned commits cannot reach `main`. Apply it to the live ruleset after agent identities are configured to sign:

```bash
# Preview current ruleset
gh api repos/JovieInc/Jovie/rulesets/10512119 --jq '.rules[] | select(.type=="required_signatures")'

# Apply from source-of-record (Tim/OWL — requires repo admin)
gh api --method PUT repos/JovieInc/Jovie/rulesets/10512119 \
  --input .github/rulesets/branch-protection.yml
```

Agent commit signing (each identity that authors merges):

- **Codex / Claude / codegen agents:** enable GPG or SSH commit signing in the agent environment (`git config commit.gpgsign true` + key, or `gpg.ssh.defaultKeyCommand`).
- **Graphite squash merges:** Graphite's merge commit must also be signed — configure signing on the Graphite push actor before enabling `required_signatures` in production.
- **Verification:** `security.yml` runs `commit-signature-check` on every `main` push and warns when an unsigned commit lands.

## Monitoring & troubleshooting

- Queue status: Graphite dashboard (not the GitHub "merge queue" UI, which is now unused).
- **PR not merging after labeling:** confirm the `merge-queue` label is applied, required checks are green, no hard-gate label (`needs-human`, `hold`, `gated`) is present, and `graphite-app` is a ruleset bypass actor. If Graphite can't push, the bypass actor is missing.
- **Stale Graphite draft after a downstack MQ draft closes:** resubmit the
  source PR with `gt submit --always --update-only --no-edit --no-interactive
  --no-verify`. If the stale `gtmq_*` draft remains, cancel/retry the queue
  entry from the Graphite dashboard. Do not close `gtmq_*` PRs from GitHub.
- **Batch failure stalled siblings:** confirm Graphite **bisect on batch failure** is enabled in the dashboard. Repo guardrails only allow aggregate required checks — pinned leaf jobs break bisection.
- **Want to bypass for an emergency:** use Graphite's "merge now" in the dashboard; there is no GitHub-side bypass actor for humans.

## Local verification

```bash
pnpm ci:merge-queue:check          # repo source-of-record (CI Structural Contract)
pnpm ci:merge-queue:verify         # + live GitHub ruleset when gh is authenticated
pnpm ci:harness:test -- merge-queue-guard
```
