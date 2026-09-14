# Cost Monitoring & Incident Alerting

> **Question this answers:** "If a deploy lands and starts costing $X/day in unexpected spend, will the system catch it before I notice?"

This document covers the cost-anomaly defense layer. It exists because of a real prior incident where a runaway log/API loop cost ~$12k over 12 days while the founder was unavailable.

## Architecture: Four Layers

| Layer | Mechanism | Coverage | Defense Type |
|---|---|---|---|
| **0** | Vercel spend notifications + `production-continuity.yml` | Budget thresholds and Jovie/Summer availability | Founder-first alert + bounded agent ingress |
| **1** | Provider-native spend controls | All providers | Provider-enforced pause/limit; enforcement semantics and lag vary |
| **2** | `cost-anomaly-gate.yml` | Production event volume | **Alert-only observer** — opens one deduplicated incident |
| **3** | Provider usage ledger (future) | Per-provider attribution | Per-provider day-over-day anomaly detection |

Layer 0 composes Vercel's event-driven 50%/75%/100% notifications with a
best-effort five-minute external HTTP probe. GitHub schedules can be delayed or
disabled, so the probe is fallback detection, not a guaranteed immediate page.
Layer 1 is independent of GitHub Actions. Layer 2 declares a 15-minute hosted
schedule, but workflow enablement is an explicit operational step; do not rely
on it as continuous protection until its enabled state and Production secrets
have been verified.

### Production-continuity policy

`production-continuity.yml` probes both `jov.ie` and `summer.jov.ie` outside
Vercel. An exact `x-vercel-error: DEPLOYMENT_PAUSED` is classified separately
from a runtime 5xx, an HTTP 402 quota failure, and an observer/network failure.
When any target is unhealthy, the workflow runs two independent paths before it
preserves a red result:

1. It sends the existing Production Slack webhook a bounded incident packet and
   requires Slack's HTTP 200 `ok` transport acknowledgement. This proves webhook
   acceptance only. It does not prove that Tim saw or acknowledged the alert.
   A successful transport receipt suppresses repeats for the same stable
   incident key for 30 minutes; absent a human acknowledgement channel, the
   workflow then sends another reminder. A failed delivery retries on the next
   observation, and a changed affected target or failure class creates a new key.
2. It writes one stable `provider-unavailable` receipt through the existing
   delivery state machine on Gem. That admits a deduplicated Summer/Symphony
   investigation task without giving the observer Vercel credentials.

Vercel's personal Spend Management notification channels remain the primary
pre-pause signal. A September 13, 2026 readback showed Tim's SMS, Push, Email,
and Web selections enabled, but message delivery and human acknowledgement were
not observable. The Spend Management webhook field was empty. Do not host a
future receiver on the same Vercel team whose projects the budget can pause.
The policy library includes a fail-closed spend-rate forecast that returns
`unknown` for stale, future, reset-cycle, or drifting snapshots. It has no live
production feed yet: the current external probe detects availability, not
remaining budget. Commissioning the pre-pause path requires a signed Vercel
spend webhook or an external usage reader, an independent destination, and an
acknowledged founder route. Until those are configured and exercised, forecast
coverage remains explicitly unproven.

Budget policy is founder-first:

- At 50%, notify and observe. No budget mutation.
- At 75%, notify Tim and begin spend-source diagnosis immediately. No budget
  mutation.
- At 100% or a proven production pause, notify Tim and contain the spend source.
  Tim handles the budget/resume action during the configured acknowledgement
  window.
- If Tim is unavailable, an agent may propose one staged increase only after
  fresh spend evidence, containment proof, an expired acknowledgement window,
  and explicit numeric values for aggregate emergency ceiling, maximum stage,
  and minimum headroom. There are no code defaults for money or the window.
- Never increase a cap while the spend source is uncontained or under attack.
  One incident key permits at most one in-flight stage. Vercel metering and
  enforcement can lag, so a configured budget is not a guaranteed maximum bill.
- Increasing the team budget does not resume projects. Resume each affected
  project individually, then probe every production endpoint twice and retain
  the provider, runtime, notification, and agent-ingress receipts separately.

Ship now: the read-only observer, exact failure classification, acknowledged
Slack transport, and existing agent ingress. Re-evaluate when an external,
signed Spend Management webhook receiver and a verified Tim acknowledgement
channel exist. Then replace best-effort pre-pause polling with the signed event
while retaining the external availability probe as a deadman.

Activation still requires proving which Tim-observed on-call destination owns
the existing Slack webhook, exercising one synthetic incident end to end, and
observing one scheduled heartbeat from outside Vercel. Source and CI evidence do
not establish any of those runtime receipts.

### Selected external destinations (prepared, not activated)

The adopt-first implementation uses existing provider and repository surfaces.
These are the exact intended destinations; none of the pending configuration in
this section is evidence that the path is live.

| Role                                     | Selected destination                                                                                      | Exact configuration                                                                                                                                                                                                                                                                                               | Current receipt                                                                                                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent availability observer        | Sentry organization `jovie`, project `jovie-web`                                                          | Create `Jovie production serving` for `https://jov.ie/api/health/build-info` and `Summer production serving` for `https://summer.jov.ie/runtime/v1/health`; check every five minutes, alert after two consecutive failures, and notify on recovery.                                                              | The September 13 API readback returned zero monitors. The current token could not read project detectors or member identities (`403`), so no monitor or recipient is configured.              |
| Signed spend feed                        | Existing Cloudflare Worker `jovie-observability-ingest`                                                   | Extend it with `POST /vercel/spend`; verify the raw request body against Vercel's `x-vercel-signature` HMAC-SHA1 signature; require the expected Vercel team ID; accept only 50%, 75%, 100%, and billing-cycle-end events; persist the stable incident key before dispatch.                                       | The checked-in KV namespace ID is a placeholder and no deployed Worker hostname was found. The receiver is not commissioned, and a hostname must not be invented before deployment.           |
| Founder notification and acknowledgement | Vercel native Web, Email, Push, and SMS to Tim; Sentry Email to Tim as the independent availability route | Keep Vercel native delivery as the primary pre-pause notification. Bind both Sentry uptime monitors to Tim's verified Sentry member only after an authorized token can resolve that member identity. Treat Summer to iMessage and Ovie activity as recovery-time projections, not as the independent outage path. | Vercel channel selections are enabled, but delivery and human acknowledgement are unverified. The Sentry member ID is unresolved. No machine-readable Tim acknowledgement channel exists yet. |
| Operational transport                    | Existing Production Slack webhook and Gem delivery-state-machine ingress                                  | Retain HTTP 200 body `ok` as Slack transport acceptance and the stable Gem event as agent ingress.                                                                                                                                                                                                                | Neither receipt proves Tim saw or acknowledged an incident. Do not use either as the founder acknowledgement gate.                                                                            |

The proposed emergency envelope remains inactive: aggregate ceiling `$15`,
maximum one-time stage `$2`, minimum remaining headroom `$1`, and a 15-minute
founder acknowledgement window. Activating those values, changing the Vercel
budget, resuming a project, creating Sentry monitors or recipients, deploying
the Cloudflare receiver, or setting its secrets are separate operational
mutations and require their applicable approval and identity receipts.

---

## Layer 1: Provider Spend Caps (Checklist)

This is the primary defense. Walk this checklist on initial setup and re-verify quarterly as baseline traffic grows.

### Vercel

- Dashboard: **Settings → Billing → Spend Management**
- Action: enable hard cap (pauses project at limit; does NOT just alert)
- Set from an approved aggregate risk envelope and verified provider semantics;
  do not infer a safe cap from a blanket baseline multiple.
- Requires: Vercel Pro plan (Hobby has no spend management)
- Verify: take a screenshot of the configured cap and attach to the verification PR
- Verify every production project is individually live after a budget incident;
  a READY deployment does not override a project-level pause.

### Anthropic

- Dashboard: **Console → Plans & Billing → Usage limits**
- Action: set both **daily** and **monthly** caps
- Recommended daily: 2x typical day's spend (gives runaway ~12 hours before hard stop)
- Critical because we have 3 LLM-calling crons (`generate-insights`, `summarize-interviews`, `generate-playlist`) with no per-call ledger

### OpenAI (if used)

- Dashboard: **Billing → Usage limits**
- Action: set both **soft** (email alert) and **hard** (refuses requests) limits
- Recommended hard limit: 3x typical monthly spend

### Resend

- Dashboard: **Settings → API rate limit**
- Action: cap requests/hour at 10x typical send volume
- Critical because `frequent` cron's `sendNotifications` sub-job can fan out to many fans on release-day events

### Twilio (if used)

- Dashboard: **Console → Usage triggers**
- Action: set daily SMS spend cap with notification + suspend action

### Neon

- Already configured: compute autosuspend
- Verify: autosuspend timeout = 5 minutes (Neon dashboard → branch settings)

### Upstash Redis

- Approved pre-revenue ceiling: **$5/month** for `Jovie-1` pay-as-you-go.
  This is a hard maximum, not a target. Automated budget increases are disabled
  while the verified active paid-subscriber count is zero. Upstash account
  currently lacks a payment method, so the approved plan change remains
  unapplied until billing setup is completed.
- Hard tier limit: record the current monthly command quota in the production
  operations dashboard; the free-tier reference value is 500,000 commands.
- Provisioning status: the application emits the metrics and stable failure
  classes below. Production operations owns the Sentry dashboard and alert
  rules; do not claim continuous protection until those rules have been created
  and a synthetic event has reached the on-call destination.
- Quota early signal: configure alerts on the monthly sum of
  `redis.rate_limit_command_estimate` at 80% (warning) and 95% (critical).
  The metric uses the documented per-decision upper bound and a bounded limiter
  prefix; multiply writes by the database's current Global replica count.
- Anonymous anomaly signal: chart `anonymous.bot_detected` by its bounded
  `surface`, `reason`, and `blocked` dimensions. Warn when a 15-minute count is
  at least 100 and exceeds the same hour's four-week baseline by 5x; page at
  1,000 in 15 minutes. Production operations owns triage: correlate the surface
  with Vercel route volume, confirm that filtering happens before Redis, and
  tighten only bot rules that preserve anti-cloaking and paid-resource safety.
- Failure signal: configure paging for
  `redis.rate_limit_failure{failure_kind=quota_exceeded}` and the hourly
  `redis_operability_*` canary event.
- Mitigation: high-volume anonymous telemetry uses fixed windows with provider
  analytics off; documented payment-abuse exceptions retain sliding windows
  with analytics off. Known crawlers skip durable telemetry limiters, and quota
  errors open the shared Redis circuit for 15 minutes to stop retry
  amplification. Authentication routing state and native exchange codes are
  Postgres-backed, so Redis mitigation degrades analytics/rate-limit precision
  instead of blocking login.
- Recovery: restore write operability (quota reset, approved plan change, or
  replacement datastore), run the authenticated `/api/health/redis` write/read
  probe, then complete the production auth dogfood path before closing incident.
  Automation may apply the approved pay-as-you-go plan and hard cap, but must
  never delete/recreate the database, restore a backup, or rotate credentials.

### R2 / Cloudflare

- R2 has no native spend cap as of writing; rely on Layer 2 and bandwidth alerts in Cloudflare dashboard

---

## Layer 2: Cost Anomaly Gate Workflow

`.github/workflows/cost-anomaly-gate.yml` is configured for a 15-minute hosted
schedule plus manual dispatch. It queries Sentry for total event volume over
the last hour and compares against a 4-week same-hour-of-week baseline. On an
anomaly it opens one fixed-title incident and sends one Slack alert; later
observations are suppressed until that incident is closed. It has no Vercel
credentials and never mutates production. Confirmed release regressions are
rolled back only by the serialized production controller.

### Why event volume?

A runaway code path that **succeeds** but burns money (tight loop hammering an external API, cron processing an unbounded backlog, log-volume blowup) doesn't show up in error metrics. But it almost always shows up in transaction/event volume because:
- Sentry instruments all API routes and server actions
- A runaway loop produces orders-of-magnitude more transactions
- Even non-instrumented runaways usually have downstream effects (DB queries, errors eventually)

This is a proxy metric, not a direct cost metric. If the runaway is in something Sentry doesn't see (e.g. a pure `console.log` flood), Layer 1 catches it instead.

### Tunable knobs (workflow inputs on `workflow_dispatch`)

| Input | Default | Purpose |
|---|---|---|
| `threshold_multiplier` | `5` | Anomaly when current > baseline × this. |
| `absolute_floor` | `1000` | Independent anomaly threshold that catches high volume even when the baseline is elevated or unavailable. |
| `lookback_minutes` | `60` | How much recent traffic to evaluate. |

The multiplier and absolute floor are independent: crossing either threshold
opens the incident. This preserves the standing 5×-baseline alert even during
lower-traffic hours.

### Calibration procedure (run on initial setup)

1. **Watch Slack for 1-2 weeks.** Resolve and close the open incident after each investigation so a later incident can alert again.
2. **Investigate every alert.** Was it a real anomaly or a false positive?
   - **Real anomaly with a known cause** (release-day notification fan-out, traffic spike from press): adjust `threshold_multiplier` upward or document as expected.
   - **False positive** (stable traffic, just baseline drift): adjust `threshold_multiplier` upward.
3. **Tune thresholds only from observed data.** This observer remains alert-only at every threshold.

### When the gate fires (on-call runbook)

Slack alert lands and one GitHub incident opens. Production is unchanged.

1. **Confirm production health and current deployment:**
   ```bash
   doppler run -- vercel ls --token "$VERCEL_TOKEN" | head -5
   curl -s https://jov.ie/api/health
   ```

2. **Identify the deployment or traffic source correlated with the spike:**
   ```bash
   gh pr list --state merged --base main --limit 10
   git log --oneline <prior-prod-sha>..<rolled-back-sha>
   ```

3. **Find the runaway code path.** In order of speed:
   - **Sentry → Performance → Transactions** filtered to the spike window. Sort by count desc. The top-1 transaction is your culprit.
   - **Vercel → Logs** filtered to the spike window. Look for repeated patterns.
   - **Vercel → Functions** filtered to the spike window. Look for one function with 10-100x normal invocation count.
   - **Anthropic / Resend dashboards** for spend spike correlated to the same window.

4. **Verify Layer 1 caps held.** Spot-check Vercel Spend Management, Anthropic usage, Resend logs. If any provider went above its cap, the cap is misconfigured.

5. **Fix and redeploy through the serialized production controller.** Use its centralized rollback only when a release gate has structured confirmed-regression evidence.

6. **If false positive:** tune `threshold_multiplier` upward in `.github/workflows/cost-anomaly-gate.yml` and document why in the commit message.

---

## Layer 3: Provider Usage Ledger (Future)

Not built. Tracked in Linear as candidate follow-up work. The design would be:
- Daily cron writes per-provider usage to a `provider_usage_daily` table (rows per provider, day, units, est_cost_usd)
- Sources: Anthropic usage API, Resend events, Vercel usage API, Sentry events
- Daily check: each row vs 30-day rolling average; alert on day-over-day anomaly per provider

This is finer-grained than Layer 2 but slower to react (daily vs every-15-min). Layers 1+2 cover the high-trauma scenario. Build Layer 3 only if observed gaps demand it.

---

## Verification of This System

### Initial setup (one-time)

- [ ] Layer 1: walk the checklist above. Screenshot every cap. Attach to the setup PR.
- [ ] Upstash: create and verify the 80%/95% command alerts, anonymous bot-volume
      warning/page rules, and quota-failure canary page before marking Redis
      anomaly protection active.
- [ ] Layer 2: confirm `cost-anomaly-gate.yml` is enabled and its 15-minute schedule is declared before treating it as continuous protection.
- [ ] Layer 2: trigger a synthetic observer run manually and confirm one issue + Slack message arrives:
  ```bash
  gh workflow run cost-anomaly-gate.yml -f threshold_multiplier=0 -f absolute_floor=0
  ```
- [ ] Layer 2: confirm the `Production – jovie` environment exposes `SENTRY_AUTH_TOKEN`. The workflow resolves canonical project `jovie/jovie-web` to a numeric Sentry project ID; it does not depend on repo-level org/project secrets or Vercel credentials.

### Ongoing (quarterly)

- [ ] Re-walk Layer 1 checklist. Increase caps as baseline traffic grows.
- [ ] Review last quarter's gate fires. Tune thresholds if false-positive rate > 1/month.
- [ ] Confirm repeated anomaly observations reuse the open incident without duplicate Slack alerts.
