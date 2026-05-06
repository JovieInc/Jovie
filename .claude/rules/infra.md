# Infrastructure & Scheduling Guardrails

Cron, API budgets, forbidden infra patterns, cost disclosure.

AI agents lack context about operational costs, API billing, and infrastructure consequences. These guardrails exist because agents have historically created expensive, redundant, and architecturally unsound infrastructure without understanding the impact.

## The Decision Hierarchy: Before Creating Any Scheduled/Background Work

**STOP.** Before creating a cron job, scheduled task, background worker, or polling loop, walk through this hierarchy **in order**. Use the first option that works:

| Priority | Approach | When to Use |
|----------|----------|-------------|
| 1 | **Webhook / Event handler** | An external service (Stripe, Clerk, etc.) can notify you when state changes. **This is almost always the right answer.** |
| 2 | **Inline after-action** | The work can happen synchronously after the triggering action (e.g., clean up a record right after it's used). |
| 3 | **On-demand / lazy evaluation** | The work can happen when the data is next accessed (e.g., check if a token is expired when it's read, not on a timer). |
| 4 | **Add to existing scheduled job** | If a nightly/periodic job already exists, add your logic there instead of creating a new one. |
| 5 | **New scheduled job** | Only if none of the above work, AND you've documented why in the PR. |

## Rules for Cron Jobs & Scheduled Tasks

1. **NEVER create a new cron job without explicit approval.** Document in the PR description:
   - Why a webhook/event-driven approach won't work
   - Why it can't be added to an existing scheduled job
   - Expected API call volume and cost impact
   - Proposed frequency and why that frequency is necessary

2. **Consolidate, don't proliferate.** Multiple cleanup tasks that run at similar times should be a single job with multiple steps. One nightly cleanup job that handles photos, keys, retention, etc. is better than four separate cron entries.

3. **Frequency must be justified by business need, not convenience.**
   - Hourly jobs must justify why daily isn't sufficient.
   - "Near real-time" requirements should use webhooks, not polling.
   - If you can't explain what bad thing happens between intervals, the interval is too frequent.

4. **Cron jobs are NOT a substitute for proper event handling.** If Stripe, Clerk, or any external service provides webhooks:
   - Use the webhook to react to state changes in real time.
   - Do NOT poll the external API to check for changes.
   - Reconciliation jobs (if needed at all) should run at most daily and serve as a safety net, not the primary mechanism.

The `infra-guardrails-check.sh` hook blocks new `app/api/cron/*/route.ts` files and `vercel.json` cron changes without explicit approval.

## External API Call Budget Awareness

**Every external API call has a cost.** Agents MUST consider API call volume before writing code that interacts with third-party services.

| Rule | Rationale |
|------|-----------|
| **NEVER iterate over all users to call an external API** | At 1,000 users hourly = 24,000 calls/day. At 10,000 users = 240,000. |
| **NEVER poll external APIs for state you can receive via webhook** | Stripe, Clerk, Resend, and most services push state changes. Use those. |
| **Batch where possible** | If you must call an external API, use batch/list endpoints instead of per-record fetches. |
| **Cache aggressively** | If you need external data, cache it with appropriate TTLs. Don't re-fetch what hasn't changed. |
| **Log and monitor call volume** | Any new external API integration must log call counts so we can track costs. |

### Stripe-Specific Rules

- Stripe webhooks are the **primary** mechanism for billing state changes. The webhook handlers already exist and are hardened with deduplication, optimistic locking, and audit logging.
- Reconciliation (if any) is a **safety net**, not a primary mechanism. It should run at most once daily and only check users whose state actually looks inconsistent (e.g., `isPro = true` but `stripeSubscriptionId` is null).
- NEVER enumerate all Stripe customers/subscriptions. Query the local database for anomalies, then spot-check individual records against Stripe only when something looks wrong.
- Before adding any Stripe API call, calculate: `(calls per run) × (runs per day) × 30 = monthly API calls`. If this number exceeds 1,000/month, justify it in the PR.

## Forbidden Infrastructure Patterns

| Forbidden | Why | Do This Instead |
|-----------|-----|-----------------|
| New Vercel Cron entry without PR approval | Cron proliferation leads to unmanageable scheduled work | Add logic to existing cron or use events |
| Polling loop that calls external APIs | Burns through API budgets and rate limits | Use webhooks |
| Per-user external API call in a loop | O(N) API calls scale linearly with user growth | Batch endpoints or event-driven approach |
| Creating a new job queue / worker system | We already have an in-database job queue (`ingestionJobs`) | Use the existing system or justify why it's insufficient |
| Adding Bull, Agenda, BullMQ, or similar | Adds operational complexity for no benefit at our scale | Use existing in-database queue or Vercel Cron |
| `setInterval` or `setTimeout` in server code | Serverless functions don't persist; these silently fail | Use Vercel Cron or the existing job queue |
| Creating a dedicated "sync" service | Polling-based sync is almost always the wrong pattern | Webhook + reconciliation safety net |

## Cost Impact Disclosure

When a PR introduces or modifies any of the following, the PR description MUST include a **Cost Impact** section:

- New external API calls (Stripe, Clerk, Resend, AI providers, etc.)
- New or modified cron job frequency
- New database queries that run on a schedule
- New third-party service integrations

### Cost Impact template

```markdown
## Cost Impact
- **External API calls**: ~X calls/day to [Service] (X calls/run × Y runs/day)
- **Monthly projection**: ~X calls/month at current user count
- **Scaling factor**: O(1) / O(users) / O(records) per run
- **Monthly cost estimate**: $X based on [pricing tier]
```

## API Runtime

All API routes run on **Node.js runtime** (the Next.js default). Do not use Edge runtime.

**Why:** The API relies on connection pooling (Neon), native bindings (Sharp), payment SDKs (Stripe), and long-duration cron jobs (60–300s) — none of which work on Edge.

**Convention:** Only add `export const runtime = 'nodejs'` when documenting a specific constraint (e.g., Sharp, Stripe). Don't add it to every route as boilerplate.

## Reference Docs

| Doc | Question It Answers |
|-----|---------------------|
| `docs/CRON_REGISTRY.md` | What scheduled jobs already run? Can I add my logic to an existing one? |
| `docs/WEBHOOK_MAP.md` | Which webhooks handle this provider's events? |
| `docs/API_ROUTE_MAP.md` | Does an API endpoint already exist for this? What auth does it need? |
| `docs/FEATURE_REGISTRY.md` | What feature flags exist? What are their current states? |
