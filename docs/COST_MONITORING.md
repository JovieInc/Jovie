# Cost Monitoring & Auto-Rollback

> **Question this answers:** "If a deploy lands and starts costing $X/day in unexpected spend, will the system catch it before I notice?"

This document covers the cost-anomaly defense layer. It exists because of a real prior incident where a runaway log/API loop cost ~$12k over 12 days while the founder was unavailable.

## Architecture: Three Layers

| Layer | Mechanism | Coverage | Defense Type |
|---|---|---|---|
| **1** | Provider-native spend caps | All providers | **Hard circuit-breaker** — provider stops billing |
| **2** | `cost-anomaly-gate.yml` | Vercel deployments | **Auto-rollback** — reverts deploy on event-volume spike |
| **3** | Provider usage ledger (future) | Per-provider attribution | Per-provider day-over-day anomaly detection |

**Layers 1 and 2 are independent.** If Layer 2's monitoring breaks, Layer 1 still caps your spend. If Layer 1's cap is set too high, Layer 2 catches the spike sooner.

---

## Layer 1: Provider Spend Caps (Checklist)

This is the primary defense. Walk this checklist on initial setup and re-verify quarterly as baseline traffic grows.

### Vercel
- Dashboard: **Settings → Billing → Spend Management**
- Action: enable hard cap (pauses project at limit; does NOT just alert)
- Recommended: 3-5x current monthly baseline
- Requires: Vercel Pro plan (Hobby has no spend management)
- Verify: take a screenshot of the configured cap and attach to the verification PR

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

### R2 / Cloudflare
- R2 has no native spend cap as of writing; rely on Layer 2 and bandwidth alerts in Cloudflare dashboard

---

## Layer 2: Cost Anomaly Gate Workflow

`.github/workflows/cost-anomaly-gate.yml` runs every 15 minutes against production. It queries Sentry for total event volume over the last hour and compares against a 4-week same-hour-of-week baseline. On anomaly: triggers `vercel rollback --yes`, posts to Slack, opens a GitHub issue.

### Why event volume?

A runaway code path that **succeeds** but burns money (tight loop hammering an external API, cron processing an unbounded backlog, log-volume blowup) doesn't show up in error metrics. But it almost always shows up in transaction/event volume because:
- Sentry instruments all API routes and server actions
- A runaway loop produces orders-of-magnitude more transactions
- Even non-instrumented runaways usually have downstream effects (DB queries, errors eventually)

This is a proxy metric, not a direct cost metric. If the runaway is in something Sentry doesn't see (e.g. a pure `console.log` flood), Layer 1 catches it instead.

### Tunable knobs (workflow inputs on `workflow_dispatch`)

| Input | Default | Purpose |
|---|---|---|
| `dry_run` | `true` | When true, detects anomalies + posts to Slack but does NOT roll back. Flip to `false` after calibration. |
| `threshold_multiplier` | `5` | Anomaly = current > baseline × this. |
| `absolute_floor` | `1000` | Anomaly requires current > this many events even if multiplier hits. Prevents low-traffic-hour false positives. |
| `lookback_minutes` | `60` | How much recent traffic to evaluate. |

### Calibration procedure (run on initial setup)

1. **Deploy the workflow with `dry_run` defaulted to `true`**. The current default is already `true`.
2. **Watch Slack for 1-2 weeks.** Note any "Cost Anomaly Detected (DRY RUN)" alerts. Each one would have triggered a rollback in production.
3. **Investigate every alert.** Was it a real anomaly or a false positive?
   - **Real anomaly with a known cause** (release-day notification fan-out, traffic spike from press): adjust `threshold_multiplier` upward or document as expected.
   - **False positive** (stable traffic, just baseline drift): adjust `threshold_multiplier` upward.
4. **When you go a full week with zero false positives**, edit `.github/workflows/cost-anomaly-gate.yml` and change the default of `DRY_RUN` from `'true'` to `'false'`.
5. **Verify rollback path** before flipping: run `gh workflow run cost-anomaly-gate.yml -f dry_run=false -f threshold_multiplier=0 -f absolute_floor=0` in a maintenance window. This forces a synthetic anomaly. Confirm `vercel rollback --yes` actually reverts production. Roll forward immediately afterward.

### When the gate fires (on-call runbook)

Slack alert lands. GitHub issue opens. Production has been rolled back to the prior deployment.

1. **Confirm rollback succeeded:**
   ```bash
   doppler run -- vercel ls --token "$VERCEL_TOKEN" | head -5
   curl -s https://jov.ie/api/health
   ```

2. **Identify the bad deployment.** The rollback reverts to the immediately-prior production deployment. Find the commits in between:
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

5. **Fix and redeploy.** The rolled-back code is back in production; you have time. Open a fix PR, get it through normal review, ship.

6. **If false positive:** tune `threshold_multiplier` upward in `.github/workflows/cost-anomaly-gate.yml` and document why in the commit message.

### Recovery from a wrong rollback

If the gate fires on a real anomaly that was actually intentional (e.g. you launched a marketing campaign that legitimately 10x'd traffic), roll forward:
```bash
# List recent deployments
doppler run -- vercel ls --token "$VERCEL_TOKEN"

# Promote a specific deployment back to production
doppler run -- vercel promote <deployment-url> --token "$VERCEL_TOKEN"
```

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
- [ ] Layer 2: confirm `cost-anomaly-gate.yml` is scheduled (`gh workflow list | grep cost-anomaly`).
- [ ] Layer 2: trigger a dry-run manually and confirm Slack message arrives:
  ```bash
  gh workflow run cost-anomaly-gate.yml -f dry_run=true -f threshold_multiplier=0 -f absolute_floor=0
  ```
- [ ] Layer 2: confirm the workflow's required secrets exist: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `SLACK_WEBHOOK_URL`. (All exist already, used by `sentry-error-gate.yml`.)

### Ongoing (quarterly)

- [ ] Re-walk Layer 1 checklist. Increase caps as baseline traffic grows.
- [ ] Review last quarter's gate fires. Tune thresholds if false-positive rate > 1/month.
- [ ] Confirm rollback still works by triggering a synthetic anomaly in maintenance window.
