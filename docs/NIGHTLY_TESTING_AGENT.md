# Nightly Testing Agent

> **Issue:** JOV-1870
> **Workflow:** `.github/workflows/nightly-testing-agent.yml`
> **Skill:** `.agents/skills/nightly-test-agent/SKILL.md`

## Purpose

The testing agent ranks high-risk surfaces after relevant evidence changes, runs deterministic test lanes,
optionally exercises Stryker mutation hotspots, and emits a compact report
for the admin ops panel and `docs/NIGHTLY_TESTING_AGENT_REPORT.md`.

## Triggers

| Workflow | Causal event | Purpose |
|----------|--------------|---------|
| `Changed-Evidence Test Suites` | Relevant web/shared/toolchain push to `main` | Full unit + E2E suite, Knip audit |
| `Nightly Testing Agent` | Test, mutation config, or harness push to `main` | Risk scoring, unit telemetry, mutation hotspots, report |

Manual dispatch remains available for a bounded diagnostic run. Twenty-four hours
without a matching input change launches neither workflow.

## Cost path (economy / deterministic)

This automation is intentionally **LLM-free**:

| Lane | Cost | Notes |
|------|------|-------|
| Context + target selection | $0 | Reads manifests + local failure memory |
| Unit telemetry | $0 | Reuses existing Vitest JUnit output |
| Mutation hotspots | $0 | Stryker on curated files only; incremental mode |
| Report generation | $0 | Markdown + JSON from normalized telemetry |
| Redis publish | ~$0 | One `SET` per run via existing Upstash REST |

**Do not** route candidate generation through premium models from these events.
Candidate validation is `workflow_dispatch` only and still executes focused Vitest
commands — no model spend.

GitHub Actions runner time is incurred only for changed evidence or manual diagnostics.

## Outputs

| Artifact | Location | Consumer |
|----------|----------|----------|
| Daily markdown report | `docs/NIGHTLY_TESTING_AGENT_REPORT.md` | Humans, PR diff history |
| Machine-readable status | `apps/web/reports/nightly-agent/last-run.json` | Scripts, baselines |
| Ops HUD snapshot | Redis key `nightly-agent:jovie:last_run` | `/app/admin/ops` |
| CI artifacts | `nightly-agent-report-<run_id>` | Debugging, 90-day retention |

### Reliability entropy receipt

The existing `emit-delta` completion event adds `entropyProjection` to Jovie's
`skill-delta.json`, already included in the report artifact. It composes the
nightly detector result and the existing quarantine-ledger evaluation without
starting another detector, job, service, or Redis write. All registered detectors
appear in the projection; detectors without supplied execution results stay
`unknown`. Existing detector and CI gate behavior is unchanged.
The existing `publish-status` step refreshes that same receipt with the final
workflow conclusion. A passing subset of tests cannot clear the nightly detector
before workflow success; cancelled or incomplete runs remain unknown.

Each result retains its source reference and observation time. Replaying old
input cannot refresh it: results older than 30 hours, invalid/future timestamps,
or conflicting simultaneous results stay unknown. Duplicate and out-of-order
delivery produces the same snapshot. `attention` identifies existing failure,
flake, or quarantine debt; its count is detector evidence, not a count of unique
customer incidents. This receipt is not production or revenue certification.

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
