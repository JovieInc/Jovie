# Merge Queue (Graphite)

`main` merges go through the **Graphite merge queue**, not GitHub's native merge queue. Graphite rebases each PR on the latest `main`, runs the required checks against the rebased commit, and merges when green — batching stack-aware so independent PRs test in parallel.

> History: this repo previously used GitHub's native merge queue (a `merge_queue` rule in the `Main Branch Protection` ruleset). That was retired on 2026-06-18 — the two systems are mutually exclusive, and Graphite owns the queue now.

## How a PR gets merged

1. Open a PR against `main`. CI runs the normal PR lane (`CI / PR Ready`, `CI / Migration Guard`, `Fork PR Gate`).
2. Apply the **`merge-queue`** label (this is Graphite's enqueue trigger). Automation does this through `node scripts/merge-queue-guard.mjs enqueue <pr>`:
   - Agent pipeline, Sentry/main autofix, screenshots, and landing sweep run the guard after their gates pass (see `.github/workflows/`).
   - The guard fetches current `main`, rebases generated same-repo branches when stale, refuses conflicts, refuses overlapping autonomous PRs on hot files/subsystems, and only applies `merge-queue` when required statuses are green on the current head.
   - Humans can still apply the label directly for manual work, but generated PRs should use the guard.
3. Graphite enqueues the PR, rebases it on `main`, waits for the required checks, and squash-merges.
4. `linear-sync-on-merge.yml` transitions the Linear issue to `Done` on merge as before.

Do **not** use `gh pr merge --auto` to merge to `main` — with the native queue retired it merges directly and **bypasses Graphite**. Use the label.

## Required configuration

### GitHub (ruleset `Main Branch Protection`, id `10512119`) — `gh`-configurable

- Required status checks: `CI / PR Ready`, `CI / Migration Guard`, `Fork PR Gate` (strict / up-to-date).
- `required_linear_history`, `required_signatures`, `non_fast_forward`, `deletion`, `pull_request` (0 approvals).
- **No `merge_queue` rule** (retired).
- **Bypass actor: `graphite-app` (App ID `158384`), `bypass_mode: always`** — required so Graphite can merge through the protected branch. Source-of-record: `.github/rulesets/branch-protection.yml`.

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

### Graphite (`app.graphite.com/settings/merge-queue`) — dashboard-only (no CLI/API)

- **Merge strategy:** Squash.
- **Merge queue label:** `merge-queue`.
- **Auto-enqueue rule:** enqueue PRs labeled `merge-queue`.
- **Timeout:** cap queue duration so a regression can't hang the queue.
- **CI optimization / fast-track:** ordinary generated PRs must not use the `fast` label. `scripts/merge-queue-guard.mjs` removes `fast` from generated branches unless the PR is explicitly classified with an emergency/hotfix label or `hotfix/*` branch.
- **Push access:** make `graphite-app` the push actor for `main`.

## Telemetry

`merge-queue-telemetry.yml` runs daily and records:

- queued-to-merged duration
- conflict and CI evictions
- requeue count
- branch staleness at enqueue from guard telemetry markers
- speculative reruns when detected

Use the daily artifact or workflow summary to confirm the observed wait is trending toward the under-30-minute target.

## Monitoring & troubleshooting

- Queue status: Graphite dashboard (not the GitHub "merge queue" UI, which is now unused).
- **PR not merging after labeling:** confirm the `merge-queue` label is applied, required checks are green, and `graphite-app` is a ruleset bypass actor. If Graphite can't push, the bypass actor is missing.
- **Want to bypass for an emergency:** use Graphite's "merge now" in the dashboard; there is no GitHub-side bypass actor for humans.
