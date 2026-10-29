# Findings loop

One ledger (`scripts/lib/findings-ledger.mjs`) over SonarCloud, code scanning (CodeQL, Semgrep, Trivy, Scorecard, osv-scanner), Dependabot, secret scanning, critical-path coverage gaps, knip (via `docs/metrics/waste-latest.json`) and mutation-floor breaches. Each finding has a source, severity, fingerprint, file, first seen and owner. Secret values never enter the ledger.

## Events

| Source | Trigger |
|---|---|
| SonarCloud, CodeQL, Test Coverage Audit, Mutation Diff, Waste Sweep, Security Advisory Loop | `workflow_run` completed on main |
| Dependabot, code-scanning, secret-scanning alerts | `repository_dispatch` `security_alert` (see below) |
| Backstop | Gem lanes clock `clock_findings_loop` every 6h; dwell alarmed by the automation-registry heartbeat |

GitHub Actions has no `dependabot_alert`, `code_scanning_alert` or `secret_scanning_alert` workflow trigger. Those arrive as repository webhooks. Summer already ingests all three at `POST /summer/v1/events/github`; the repo webhook (id 686419189) subscribes only to `merge_group`, `pull_request` and `workflow_run`, so adding the three alert events there is the missing subscription. A webhook change is an owner action (Ovie card). Until then the 6h clock and the scanner `workflow_run` events cover them.

## Severity SLOs

| Severity | Dispatch | Resolve by |
|---|---|---|
| critical | immediately, Summer P0 incident | 48h |
| high | owned agent-ready issue within 24h | 7d |
| medium | batched tech-debt issue (WSJF portfolio) | 30d |
| low | batched tech-debt issue | none |

Secret leaks are critical and `needsTim`: revoke and rotate through `ops/registry/credentials.json`; rotation that needs the founder is an Ovie card.

## Ratchets

`docs/metrics/findings-baseline.json` holds per-source open counts (ratchet-core `lock_down`). Growth fails the loop; shrinking passes and the clock-run snapshot PR lowers the baseline. A source that cannot be read is recorded blind (a finding, never zero) and is skipped by the ratchet. Diff-scoped PR gating stays with the tools that support it (dependency-review, code-scanning PR annotations); a `code_scanning` ruleset rule would make new alerts block merge and is an owner change.

## Metrics

`docs/metrics/findings-latest.json` (open by source and severity, time to remediation p50/p95, SLO breaches, blind sources). `docs/metrics/findings-public-stats.json` carries public-safe aggregates only, for the proof-stats registry intake once that route lands.
