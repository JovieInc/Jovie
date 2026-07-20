# Nightly Testing Agent

> **Issue:** JOV-1870
> **Workflow:** `.github/workflows/nightly-testing-agent.yml`
> **Skill:** `.agents/skills/nightly-test-agent/SKILL.md`

## Purpose

The nightly testing agent ranks high-risk surfaces, runs deterministic test lanes,
optionally exercises Stryker mutation hotspots, and emits a compact daily report
for the admin ops panel and `docs/NIGHTLY_TESTING_AGENT_REPORT.md`.

## Schedule

| Workflow | Cron (PT) | Purpose |
|----------|-----------|---------|
| `Nightly Tests` | `30 23 * * *` | Full unit + E2E suite, Knip audit |
| `Nightly Testing Agent` | `30 4 * * *` | Risk scoring, unit telemetry, mutation hotspots, daily report |

The consolidated suite starts at 23:30, clear of the fixed 09:00 UTC screenshot and
Tuesday harness lanes. The agent then starts at 04:30 after those runners have
drained, so fresh failures from the main suite are reflected in its context.

## Cost path (economy / deterministic)

This automation is intentionally **LLM-free**:

| Lane | Cost | Notes |
|------|------|-------|
| Context + target selection | $0 | Reads manifests + local failure memory |
| Unit telemetry | $0 | Reuses existing Vitest JUnit output |
| Mutation hotspots | $0 | Stryker on curated files only; incremental mode |
| Report generation | $0 | Markdown + JSON from normalized telemetry |
| Redis publish | ~$0 | One `SET` per run via existing Upstash REST |

**Do not** route nightly candidate generation through premium models on schedule.
Candidate validation is `workflow_dispatch` only and still executes focused Vitest
commands — no model spend.

GitHub Actions runner time is the only recurring cost (~45–70 minutes/night).

## Outputs

| Artifact | Location | Consumer |
|----------|----------|----------|
| Daily markdown report | `docs/NIGHTLY_TESTING_AGENT_REPORT.md` | Humans, PR diff history |
| Machine-readable status | `apps/web/reports/nightly-agent/last-run.json` | Scripts, baselines |
| Ops HUD snapshot | Redis key `nightly-agent:jovie:last_run` | `/app/admin/ops` |
| CI artifacts | `nightly-agent-report-<run_id>` | Debugging, 90-day retention |

## Local commands

```bash
pnpm --filter=@jovie/web run test:nightly-agent:context
pnpm --filter=@jovie/web run test:nightly-agent:select
pnpm --filter=@jovie/web run test:nightly-agent:normalize -- --junit apps/web/test-report.junit.xml
pnpm --filter=@jovie/web run test:nightly-agent:emit-delta
pnpm --filter=@jovie/web run test:nightly-agent:publish-status
```

## HUD surface

`/app/admin/ops` shows:

- Pass/fail dot for the latest unit telemetry lane
- Compact suite summary (e.g. `unit 13717/13741`)
- Links to the last GitHub Actions run and committed daily report
