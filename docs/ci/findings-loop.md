# Findings loop

One ledger (`scripts/lib/findings-ledger.mjs`) over SonarCloud, code scanning (CodeQL, Semgrep, Trivy, Scorecard, osv-scanner), Dependabot, secret scanning, critical-path coverage gaps, knip (`docs/metrics/waste-latest.json`) and mutation-floor breaches. Each finding has a source, severity, fingerprint, file, first seen and owner. Secret values never enter it.

Events: `workflow_run` of SonarCloud, CodeQL, Test Coverage Audit, Mutation Diff, Waste Sweep and the advisory loop; `repository_dispatch` `security_alert`; Gem clock `clock_findings_loop` every 6h as the backstop only. Actions has no alert-event trigger. Summer already ingests `dependabot_alert`, `code_scanning_alert` and `secret_scanning_alert` at `/summer/v1/events/github`, but repo webhook 686419189 is not subscribed to them; subscribing is an owner action.

SLOs: critical dispatches immediately as a Summer P0 incident (resolve 48h); high gets an owned issue within 24h (resolve 7d); medium and low batch per source and tool into the WSJF tech-debt portfolio (medium resolves in 30d). Secret leaks are `needsTim` rotation cards through `ops/registry/credentials.json`.

Ratchets: `docs/metrics/findings-baseline.json` holds per-source open counts (ratchet-core `lock_down`); growth fails, shrinking passes and the clock snapshot PR lowers it. A source the loop cannot read is recorded blind, which is a finding, not zero. Metrics land in `docs/metrics/findings-latest.json`; `findings-public-stats.json` holds public-safe aggregates for the proof-stats intake.
