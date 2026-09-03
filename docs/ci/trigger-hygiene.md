# Workflow trigger hygiene

Why: at blitz volume the repo hit **3,770 workflow runs in 12h with ~53%
concluding `skipped`** (#13349) — workflows spawning on events they immediately
decide to ignore. Skipped runs still consume queue/scheduler overhead and
pollute the Actions log, masking real failures. CI throughput is the binding
constraint; spawn noise is the cheapest capacity to buy back.

## Rules

1. **Filter at the `on:` level whenever GitHub allows it** — event `types`,
   `branches`, `paths`, `paths-ignore`. A non-matching event then never creates
   a run at all. Do NOT add `paths` filters to workflows that produce required
   status checks (path-skipped required checks stay pending and wedge the
   merge queue) — use the path-changes job pattern inside CI instead.

2. **Comment/review-driven workflows must stay broad** (`issue_comment`,
   `pull_request_review` cannot filter body content at the `on:` level). Gate
   with a **job-level `if:`** on the event payload — a job skipped by its `if:`
   never provisions a runner. Never put the skip decision inside a `run:` step:
   that boots a runner just to `exit 0` (this is what the AI Orchestrator guard
   did for every non-`agent-ready` label event).

3. **Fleet-wide scanners use the earliest event that changes their decision.**
   Merge-queue drain and PR conflict handling can reconcile from CI events.
   Auto-Ready is the exception: the owning agent's final source event must pair
   ready + native auto-merge while checks are pending, so it listens to source
   changes. No workflow listens to `ready_for_review`; an unchanged head never
   earns a second CI flight.

4. **Deduplicate event types that add no coverage.** Example: `issues:
   assigned` on Claude Code — the job only runs when the body/title contains
   `@claude`, which `opened` already covers.

5. **Measure before/after.** Runs-per-hour and skipped-share for a window:

   ```bash
   gh api "repos/JovieInc/Jovie/actions/runs?created=>$(date -u -d '12 hours ago' +%Y-%m-%dT%H:%M:%SZ)&per_page=100" \
     --paginate --jq '.workflow_runs[] | [.name, .conclusion] | @tsv' \
     | sort | uniq -c | sort -rn | head -30
   ```

   Acceptance for #13349: total runs/hr down ≥40% on a comparable-load day,
   skipped share <20%, no legitimate trigger lost (spot-check one real event
   per touched workflow).

## Touched in #13349

| Workflow | Change |
| --- | --- |
| `github-ai-orchestrator.yml` | Guard's label check moved from in-runner script to job-level `if:` |
| `auto-ready-agent-drafts.yml` | Historical: dropped `synchronize`; superseded by paired promotion before CI completion |
| `merge-queue-autoenroll.yml` | Dropped `pull_request: synchronize` (same) |
| `pr-conflict-handler.yml` | Dropped `pull_request: synchronize` (same; see #13347) |
| `claude.yml` | Dropped `issues: assigned` (no coverage beyond `opened`); documented broad-trigger rationale |
| ~~`taste-approve.yml`~~ | Removed 2026-07-07 — replaced by autonomous shipping (taste is advisory, not a human gate) |
