# Webhook Integration Map

> **Question this answers:** "Which webhooks handle this provider's events? What verification pattern do they use?"
>
> See [AGENTS.md — Guardrail #7: Public/Webhook Coordination Must Be Durable](../AGENTS.md#hard-guardrails-enforced-by-hooks) for webhook durability rules.

## Active Webhook Handlers

| Route | Provider | Verification | Events Handled | Key Side Effects |
|-------|----------|-------------|----------------|------------------|
| `/api/clerk/webhook` | Clerk | Svix (`svix-id/timestamp/signature` + `CLERK_WEBHOOK_SECRET`) | `user.created`, `user.updated`, `user.deleted` | **created:** syncs metadata, stops outbound sales, sends founder welcome, Slack notify. **updated:** syncs verified email changes, invalidates proxy cache. **deleted:** soft-deletes DB user. |
| `/api/stripe/webhooks` | Stripe (subscriptions) | Stripe signature (`stripe-signature` + `STRIPE_WEBHOOK_SECRET`) | `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_succeeded/failed` | Idempotent via `stripeWebhookEvents` table. **checkout:** activates Pro, activates referrals. **subscription:** updates billing status, Slack notify. **payment failed:** revokes Pro, sends dunning email. |
| `/api/webhooks/stripe-connect` | Stripe Connect | Stripe signature (`STRIPE_CONNECT_WEBHOOK_SECRET`) | `account.updated` | Updates `creatorProfiles.stripeOnboardingComplete` and `stripePayoutsEnabled`. |
| `/api/webhooks/stripe-tips` | Stripe (tips) | Stripe signature (`STRIPE_WEBHOOK_SECRET_TIPS`) | `checkout.session.completed`, `charge.refunded` | **checkout:** inserts into `tips` (idempotent on `paymentIntentId`). **refunded:** updates tip status. |
| `/api/webhooks/resend` | Resend (delivery) | HMAC-SHA256 over `svix-timestamp.body` with `RESEND_WEBHOOK_SECRET` (timing-safe) | `email.bounced`, `email.complained`, `email.delivered`, `email.opened`, `email.clicked`, `email.sent`, `email.delivery_delayed` | Idempotent via `webhookEvents` table. **bounced/complained:** adds to suppression list, updates sender reputation, stops campaign enrollments. **delivered/opened/clicked:** logs engagement. |
| `/api/webhooks/resend-inbound` | Resend (inbound email) | Svix-style HMAC (`RESEND_INBOUND_WEBHOOK_SECRET`, 5-min timestamp window) | `email.received` | Parses recipient, looks up creator, creates/updates `emailThreads`, inserts `inboundEmails`, runs AI classification (category, priority, summary). |
| `/api/webhooks/linear` | Linear | HMAC-SHA256 (`linear-signature` + `LINEAR_WEBHOOK_SECRET`, timing-safe) | Issue → "Todo" state, CodeRabbit plan-ready comment | Deduplication via Redis (60s TTL). Fires GitHub `repository_dispatch` (`linear_todo_ready` or `linear_plan_ready`) to trigger CI automation. |
| `/api/webhooks/sentry` | Sentry | HMAC-SHA256 (`sentry-hook-signature` + `SENTRY_WEBHOOK_SECRET`, timing-safe) | Issue alerts | Deduplication via Redis (60s TTL). Fires GitHub `repository_dispatch` (`sentry-issue`) to trigger autofix workflow with stack frames. |

## Shared Patterns

**Idempotency:**
- Stripe webhooks use the `stripeWebhookEvents` table (unique constraint on event ID) to prevent double-processing
- Resend delivery webhooks use the `webhookEvents` table for the same purpose
- Linear/Sentry webhooks use Redis-backed `acquireRecentDispatch` with 60s TTL

**Verification methods:**
- **Svix:** Used by Clerk. Verifies `svix-id`, `svix-timestamp`, `svix-signature` headers via `new Webhook(secret).verify()`
- **Stripe signature:** Used by all Stripe handlers. Verifies `stripe-signature` header via `stripe.webhooks.constructEvent()`
- **Manual HMAC-SHA256:** Used by Resend, Linear, Sentry. Computes HMAC over payload with timing-safe comparison

**Error handling:** All webhook handlers use try/catch with `captureError()` and return appropriate HTTP status codes. Failed webhooks are logged but don't crash the endpoint.

## Before Adding a New Webhook

1. Check this table first — the provider may already have a handler
2. Use the matching verification pattern for the provider
3. Add idempotency using `stripeWebhookEvents` (for Stripe) or `webhookEvents` (for other providers)
4. Webhook coordination state must be durable (database/Redis, not in-memory) per AGENTS.md guardrail #7
