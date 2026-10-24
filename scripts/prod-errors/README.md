# prod-errors: closed-loop production-error system (Gem)

Deterministic gem timers, no model calls and no Grok Bot quota. Fixes run only through Symphony
lanes, which pick up the Linear issue this loop opens.

**Owner:** Jovie Owner (798b223e) owns every production error end to end. Lanes execute.

Timers: `sweep` (30 min: Sentry sweep, webhook inbox, claims, post-deploy verifier), `receiver`
(always-on HMAC webhook on 127.0.0.1:8788), `ci-main` (15 min: canary/E2E/a11y/nightly on main),
`deadman` (15 min: stale or erroring heartbeats, stuck synthetic), `synthetic` (weekly test error).
Dead-man heartbeats are graced: a watcher that has never run stays `pending-first-run` until one
full 2x-interval window after install (`installed_at`), and each watcher is judged on its own
cadence (the receiver on process liveness via the 15-min `/health` probe plus its startup
heartbeat, the synthetic weekly). A watcher missing env config fails fast with ONE
`missing config: <VARS>` status and a single deduplicated issue per watcher per unhealthy episode
(no crash-loop, no duplicates; fix the env file and restart the unit). Recovery clears the
dead-man gate. Staleness is never disabled: past the grace window, or 2x the interval since the
last heartbeat, the dead-man still pages.

Rules: golden-path flows (checkout, auth, onboarding, public profile/track pages, navigation) trigger
at any count; others at `PROD_ERRORS_USER_THRESHOLD` (25) users. One Linear issue per Sentry ID
(labels `sentry:<id>`, `golden-path`). Closed means zero events for 24h after the fix merged; only
the verifier closes, and a later event reopens and escalates. Money, Stripe, config/env, secrets
and destructive data get `human-gate` + `hold` and an alert to Tim (🚨 for checkout).

State: `~/.local/state/jovie-prod-errors/` (`ledger.json`, `heartbeats/`, `alerts.jsonl`,
`bottleneck-fragment.json` = `pipeline-bottleneck/v1` fields `golden_path_sentry` + `watcher_health`).
Secrets: `~/.config/jovie-prod-errors/env` (600). Install: `install.sh`. Tests: `python3 -m unittest test_prod_errors`.
