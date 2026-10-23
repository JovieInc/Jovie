# Jev CI failure triage (shadow pilot)

Decision: add a shadow-only System-1 classifier that reads one failed CI job's
log tail and names the failure class before the remediation ladder spends a
model repair run. It reuses the [Jev transport](jev-gateway-integration.md)
(`prepareJevChoiceRequest`, `runPreparedJevEvaluation`), its admission contract
and its receipts. It adds no adapter, credential, router, retry or store, and a
receipt never dispatches, reruns or labels anything.

## Contract

`runCiFailureTriage({sourceSha, artifactSha256, workflow, job, step, event, log}, options)`
returns a `jev-ci-failure-triage/v1` receipt. The log tail is curated first:
timestamps, ANSI codes, bearer tokens, GitHub tokens, private keys, emails and
inline images are redacted, and only the last 12,000 bytes are kept.

One choice question, `route`, with a frozen allowlist:

| Class | Suggested next rung |
|---|---|
| `code_defect` | `model-repair` |
| `ci_infra` | `rerun-or-ci-owner` |
| `pr_metadata` | `metadata-fix` |
| `production_incident` | `incident` |
| `insufficient` | abstain: `existing-ladder` |

Answers below a 0.8 choice probability, answers with no probability, and
`insufficient` all abstain to the existing ladder. Labels outside the allowlist
return `invalid-response`. The caller still owns admission, persistence and any
action.

## Replay evidence (2026-10-20)

39 failed jobs were sampled at random from the last 1,000 failed Actions runs
(Source Validation, CI, E2E, Product Screenshots, Post-Deploy Probes,
Production Continuity Guard), using the last 60 non-empty log lines. A strong
model labeled each one; 14 tails did not show the cause and were labeled
`insufficient`. Each was run through `runCiFailureTriage` with the existing
Gateway key and a per-call approval.

- 39 of 39 receipts reached `evaluated`.
- Labeled cases (25): the raw choice matched the label in 24 (96%).
- At or above the 0.8 floor: 16 of 25 decided, all 16 correct. The other 9
  abstained to the existing ladder, so nothing was misrouted.
- Unclear tails (14): all 14 went to the existing ladder (13 chose
  `insufficient`; 1 low-confidence `code_defect` fell below the floor).
- Cost: about $0.0001 per classification ($0.0036 for an earlier 39-call run on
  the raw `/typesafe/v1/systemone` endpoint). Mean latency there was 0.55 s.
  That raw-endpoint run agreed on 20 of 25; every miss was an abstention.

One labeler and 39 examples is directional evidence, not calibration.

**Ship now:** shadow receipts only. **Re-evaluate when:** 200 shadow receipts
have been joined to the ladder's actual outcome (what fixed the failure).
**Then:** if precision at the 0.8 floor holds at 95% or better, let
`ci_infra` skip the model-repair rung and go straight to rerun or the CI owner.
