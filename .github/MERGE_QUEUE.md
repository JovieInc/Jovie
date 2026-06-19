# Merge Queue (Graphite)

`main` merges go through the **Graphite merge queue**, not GitHub's native merge queue. Graphite rebases each PR on the latest `main`, runs the required checks against the rebased commit, and merges when green — batching stack-aware so independent PRs test in parallel.

> History: this repo previously used GitHub's native merge queue (a `merge_queue` rule in the `Main Branch Protection` ruleset). That was retired on 2026-06-18 — the two systems are mutually exclusive, and Graphite owns the queue now.

## How a PR gets merged

1. Open a PR against `main`. CI runs the normal PR lane (`CI / PR Ready`, `CI / Migration Guard`, `Fork PR Gate`).
2. Apply the **`merge-queue`** label (this is Graphite's enqueue trigger). Automation does this for you:
   - Agent pipeline, Dependabot, Sentry/main autofix, screenshots, and landing sweep apply `merge-queue` after their gates pass (see `.github/workflows/`).
   - Humans/agents can do it directly: `gh pr edit <pr> --add-label merge-queue` (or `gt merge`, or the Graphite app).
3. Graphite enqueues the PR, rebases it on `main`, waits for the required checks, and squash-merges.
4. `linear-sync-on-merge.yml` transitions the Linear issue to `Done` on merge as before.

Do **not** use `gh pr merge --auto` to merge to `main` — with the native queue retired it merges directly and **bypasses Graphite**. Use the label.

## Required configuration

### GitHub (ruleset `Main Branch Protection`, id `10512119`) — `gh`-configurable

- Required status checks: `CI / PR Ready`, `CI / Migration Guard`, `Fork PR Gate` (strict / up-to-date).
- `required_linear_history`, `non_fast_forward`, `deletion`, `pull_request` (0 approvals).
- **No `merge_queue` rule** (retired).
- **Bypass actor: `graphite-app` (App ID `158384`), `bypass_mode: always`** — required so Graphite can merge through the protected branch. Source-of-record: `.github/rulesets/branch-protection.yml`.

### Graphite (`app.graphite.com/settings/merge-queue`) — dashboard-only (no CLI/API)

- **Merge strategy:** Squash.
- **Merge queue label:** `merge-queue`.
- **Auto-enqueue rule:** enqueue PRs labeled `merge-queue`.
- **Timeout:** cap queue duration so a regression can't hang the queue.
- **CI optimization / fast-track:** enable if available on the plan (skips redundant CI on already-validated commits / fast-forwards trivially-clean PRs).
- **Push access:** make `graphite-app` the push actor for `main`.

## Monitoring & troubleshooting

- Queue status: Graphite dashboard (not the GitHub "merge queue" UI, which is now unused).
- **PR not merging after labeling:** confirm the `merge-queue` label is applied, required checks are green, and `graphite-app` is a ruleset bypass actor. If Graphite can't push, the bypass actor is missing.
- **Want to bypass for an emergency:** use Graphite's "merge now" in the dashboard; there is no GitHub-side bypass actor for humans.
