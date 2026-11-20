# DeepSec native scanner — retired pending enable proof

**Status:** retired as a standing automation (2026-11-20, SEC-11 / audit SEC-06).  
**Owner:** Summer (product); Gem hostops owns the `jovie-native-subscription` runner pool.

## Why retire

`github:jovie:deepsec-native` stayed `live` while every Actions run skipped because
`vars.DEEPSEC_NATIVE_ENABLED != true`. That produced stale automation-liveness
reads and a daily cron that did no security work. Enabling needs Tim (repo var)
plus a commissioned self-hosted native subscription runner with proof — not
available to unattended agents.

## What remains

| Piece | State |
|---|---|
| `.github/workflows/deepsec-native.yml` | `workflow_dispatch` only; job still gated on `DEEPSEC_NATIVE_ENABLED` |
| `scripts/security/deepsec-*.mjs` + `scripts/security/deepsec/` | Kept for a future enable; not deleted |
| Registry `github:jovie:deepsec-native` | `status: retired` |

## Enable checklist (follow-up)

1. Confirm `jovie-native-subscription` runner is healthy and subscription credits are funded.
2. Tim sets repo variable `DEEPSEC_NATIVE_ENABLED=true`.
3. Manually `workflow_dispatch` Native Security Advisory; require a green run that scans main and writes a ledger/Linear receipt.
4. Re-register as `live` in `canon/automation-registry.jsonl` with an event wake (prefer push/`workflow_run` of security scanners) and a backstop ≤ dwell SLO — do not restore a skip-only daily cron.
5. Point findings at Summer labels (`security`, `Bug`, `area:security`) already used by `deepsec-loop.mjs`.

Tracked: [JOV-13873](https://linear.app/jovie/issue/JOV-13873/candidate-follow-up-enable-deepsec-native-under-summer-with-runner).
