# Agentic API self-serve — PM brief

Owner: JOV-4875 / existing agent-native API workstream. Status: proposal only.
Evidence checked: October 20, 2026, source base `68b1c4a7c31`.
Pricing authority: [canonical proposal schema](../company/PRICING-STRATEGY.md#api-pricing-schema-proposal-jov-4875).

## Outcome, scope, and evidence

An authorized agent can start using Jovie for its customer's artist workflow
without a sales call, observe its remaining allowance, and continue on paid
usage within an explicit delegated budget. Repeated work reuses valid results
instead of paying again for a crawl or model invocation. The hypothesized
bottleneck is integration activation and marginal cost; no customer-demand or
cost improvement is demonstrated by this proposal.

The August 7 founder directive is preserved in
[JOV-4875](https://linear.app/jovie/issue/JOV-4875). Its referenced artifact
`artifacts/decision-api-pricing-agentic-2026-08-07.md` is absent from this
checkout, and the Fable thread's executable spec was not available here.
GBrain query failed at `127.0.0.1:7801` (`gbrain-unavailable`). These are missing
historical evidence, not approval for prices or a reason to invent a new stack.

The [September priority lock](../../canon/strategy/theses/2026-09-03-apis-mcps-core-not-first.md)
and [October outcome/subsidy thesis](../../canon/strategy/theses/2026-10-02-sell-outcomes-replaceable-substrate.md)
govern this work. Continue JOV-4073 (agent contract), JOV-4074 (MCP), and
JOV-4075 (API/CLI); do not fork a parallel API product. This PR adds no routes,
UI, credentials, database fields, infrastructure, or billing behavior.

Current source evidence, not runtime certification:

| Concern | Canonical source / observed boundary |
|---|---|
| Consumer identity | `apps/web/lib/auth/better-auth.ts`: Better Auth bearer and OAuth provider; current OAuth scopes are identity scopes, not paid-use grants |
| Public agent contract | `apps/web/lib/api/public-agent-openapi.ts`; creator lookup and profile routes return `no-store`; profile creation returns an unclaimed profile, not account ownership |
| Rate limiting | `apps/web/lib/rate-limit/config.ts`: anonymous creator lookup 60/hour/IP and profile creation 10/hour/IP, both require Redis; these are not approved account API quotas |
| Resource reuse | `apps/web/lib/ingestion/creator-lookup.ts`, `apps/web/lib/music-resolver/public-read.ts`, `apps/web/lib/db/cache.ts`, and `apps/web/lib/redis.ts` are existing integration points |
| Subscription billing | `apps/web/lib/config/plan-prices.ts`, `apps/web/lib/config/pricing.ts`, and `apps/web/lib/entitlements/registry.ts` remain authoritative for current prices/access |
| Stripe integration | `apps/web/lib/stripe/client.ts` and `apps/web/lib/stripe/webhooks/` own provider calls and billing reconciliation |

## Requirements and assumptions

Free use requires strict durable limits and a bounded subsidy, not a payment
method. Numeric API quotas, rate windows, unit rates, caps, retention periods,
cohort budget, and launch date remain `[VERIFY]` in the pricing schema. No
uncertain value may mean unlimited access. Paid use stays disabled until all
amounts and the legal/payment responsibility matrix below are approved.

**EVENT:** Summer's isolated Vercel Eve/Ovie operator identity, tokens, grants,
and billing authority never become consumer Jovie Eve credentials. Consumer
signup never grants operator, admin, artist ownership, publication, or payment
authority. Use the existing consumer auth boundary. There is no Hermes/Trigger
revival, alias change, or new orchestration service.

## Self-serve account and payment contract

1. Discover the existing API/OpenAPI/MCP contract. An idempotent signup creates
   a restricted free API principal under the consumer service. Bind it to a
   verified customer/account through existing auth; an asserted email, artist
   URL, OAuth client registration, or unclaimed profile is not identity proof.
2. Issue least-privilege, expiring, revocable credentials via the chosen auth
   provider. Reconcile authoritative registration/list/revoke state before
   success. Account binding and resource permissions are checked on every call;
   key rotation or new agents cannot reset account quotas or subsidy.
3. Expose account-scoped allowance, usage period, limits, accepted pricing
   version, and operation receipts through the shared API/MCP/CLI contract.
   Return a stable limit reason and retry/reset time. Never expose another
   tenant's cost, grants, cached data, or payment details.
4. At exhaustion, stop costly work and return machine-readable recovery:
   wait for reset, reduce work, or explicitly opt into an approved paid policy.
   A payment grant must bind the real payer/account, policy version, currency,
   allowed operations, cap, expiry, and revocation path. API access alone cannot
   create that grant. A valid prior delegation permits automated continuation;
   a missing or changed grant returns approval-required without charging.
5. Activate paid access only after authoritative payment setup confirmation,
   required identity/compliance checks, and a positive budget reservation.
   Pending/failed setup remains free or blocked. Price changes, cap increases,
   new currencies, and new payment methods require renewed authorization.
6. Revocation, payment failure, dispute, or a cap hit stops new paid admissions.
   Reconcile admitted work under its original grant; do not silently retry a
   charge, reset usage, increase a cap, or create debt to restore access.

Provider-required verification or payer approval is an explicit resumable
state. “No human friction” means no repeated manual step within valid delegated
authority; it cannot bypass KYC, strong authentication, or consent.

| Payment gate | Required decision / evidence before activation | Owner |
|---|---|---|
| Approval | Tim's dated exact-amount decision plus payer's versioned delegated grant; deny missing/expired/revoked grants | Founder / consumer auth owner |
| Disputes | Named operator for chargebacks, evidence retention, notice, and suspension; preserve operation/grant/invoice audit trail | Billing operations |
| Fraud | Signup/IP/account velocity limits, credential-abuse controls, provider risk signals, and a bounded exposure budget; no key-rotation bypass | Security / billing |
| KYC | Identify legal payer and any provider-required verification; unresolved or restricted status cannot enable paid use | Billing operations / payment provider |
| Merchant of record | Explicitly name seller/MoR, settlement entity, supported countries/currencies, liability, and processor relationship; Stripe SDK presence proves none of these | Founder / legal |
| Refunds | Publish eligibility, request path, decision owner, and reconciliation of credits to invoices/operation events; no duplicate refund | Billing operations / legal |
| Spend limit | Zero default paid authority; atomic account-wide reservation plus settled spend cannot exceed the selected cap | API / billing owner |
| Tax | Resolve service classification, jurisdiction, collection/remittance, invoice details, and responsibility with the selected MoR/provider | Legal / finance |

This is an activation checklist, not a legal conclusion or a new payment rail.
The separate [machine-access revenue-share proposal](machine-access-revenue-share-compliance.md)
does not approve API payments, Connect payouts, stablecoins, or x402 here.

## Metering before charging

Authenticate and authorize → enforce durable abuse/rate/concurrency limits →
deduplicate the logical operation → reserve allowance or worst-case paid cost
atomically → reuse/execute → persist completion and usage → reconcile billing.
Deduplication lookup follows abuse controls; replay does not spend another unit.

Use an account + operation + idempotency-key uniqueness constraint, binding the
normalized input and policy version; conflicting key reuse is rejected. One
logical operation has one receipt and one immutable usage event across REST,
MCP, CLI, retries, workers, and cold starts. A fresh cache hit for a new logical
operation counts once; the same-operation replay counts zero additional units.
If an accepted operation survives a timeout or crash, recover that operation
before repeating its external effect. Retain deduplication records through the
approved retry, billing, and dispute horizon; a short cache TTL is not enough.

Record account, operation/event IDs, meter, period, units, pricing/grant version,
outcome, completion time, cache provenance, and internal COGS separately.
Durably persist completion and its usage event together; use a retryable outbox
to report accepted paid usage with the same provider event identifier. Provider
summaries are reconciliation inputs, not synchronous budget enforcement.
Included units are allocated atomically before any paid excess. Pending or
uncertain work retains its reservation until reconciled; failed work releases
it only when non-completion is established. Unknown worst-case cost denies
paid admission. A ledger outage stops costly admissions rather than creating
unmetered work. An export outage pauses paid admissions and retains accepted
events for reconciliation; no duplicate or retroactive free-tier charge.

## Cache and deduplication contract

Cache resource work on the server while retaining private HTTP `no-store`.
Do not cache authorization, ownership grants, spend authority, or payment
readiness as truth. Recheck access before serving any cached result.

| Class | Key and freshness | Miss / invalidation behavior |
|---|---|---|
| Public discovery | Validated canonical source ID/URL, territory, source version, operation/schema version; public data only | Bounded class-specific TTL; source changes, deletion, or visibility changes invalidate. No new unsupported crawl or source-policy bypass |
| Generated output | Tenant/resource access scope, normalized inputs, model/prompt/tool versions, and source-content digest | Reuse only complete validated artifacts while every source dependency remains fresh; no cross-tenant prompt or private-result sharing |
| Merchant/product facts | Merchant/product identity, market/currency, authoritative source revision, observed time, and expiry | Expired price, stock, eligibility, or merchant status requires authoritative refresh; on failure return unavailable, never stale truth; checkout revalidates |
| Negative results | Same access/resource scope with short separate TTL; no cached auth denial or transient provider failure | Invalidate on creation/source update; never turn an outage into authoritative “not found” |

TTL values and maximum source age are per-class launch inputs `[VERIFY]`, not
approved durations. Responses need provenance and observation/expiry metadata;
freshness is bounded observation, not a guarantee the upstream cannot change.
If any required dependency expires, refresh it before reusing derived output.

Across instances, acquire a bounded durable single-flight lease for each work
key, recheck the cache, then compute once. Followers wait within a deadline or
receive retryable pending status. Use ownership/fencing on lease renewal,
release, and writes so an expired worker cannot overwrite a newer result.
Provider calls need bounded timeouts/retries. On coordination failure, stop
expensive misses; never fall back to unbounded parallel crawls/LLM calls.
Use resource revisions or invalidation generations so an in-flight worker
cannot republish deleted/private/changed data after invalidation.

## Capability sourcing and IA disposition

This is research-ready documentation, not an implementation candidate or an
independently approved auth/billing design. Reuse the current auth, rate-limit,
Redis, database, and Stripe owners; no new dependency is selected or installed.
Lockfile versions inspected: Better Auth 1.7.11, Stripe 23.0.0, Upstash Redis
1.39.0, Upstash Ratelimit 2.2.0, Next.js 16.4.1.

Official indexes checked October 20, 2026:

- [Better Auth plugins](https://better-auth.com/docs/plugins) lists API Key and
  Agent Auth. [API Key](https://better-auth.com/docs/plugins/api-key) supports
  credential management; [Agent Auth](https://better-auth.com/docs/plugins/agent-auth)
  documents registration and scoped grants but warns its standard is unstable.
  Neither is wired into current Jovie auth. Qualify provider compatibility,
  licensing, account binding, cancellation, recovery, and revocation against
  the current OAuth/bearer integration in JOV-4073 before adoption; do not build
  bespoke credential lifecycle state while this evidence is unresolved.
- [Stripe usage recording](https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api)
  supports meter events and idempotency; summaries update asynchronously.
  Reuse the existing integration after amounts/authority are approved, with
  provider reconciliation and independent local spend enforcement.
- [Upstash rate-limit documentation](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview)
  covers serverless limits. Reuse Jovie's durable fail-closed wrapper; qualify
  timeout and coordination failures rather than assuming vendor defaults are
  sufficient for paid admissions.

Classification: customer-visible unit/allocation rules are differentiating
product logic; provider adapters are necessary integrations; auth, counters,
leases, and billing transport are commodity mechanisms. Future implementation
must bind sourcing and independent behavior evidence to its exact head under
[JOV-INV-044](../../canon/ENGINEERING.md#capability-sourcing-and-ia-integration).

IA disposition: **no new surface**. The registry proposal sits outside its
production table, parsed by
`apps/web/lib/admin/founder-review-registry.ts`, so no admin row is mounted.
Product controls, first-level actions, groups, tabs/routes/panels, duplicate
concepts, and scroll growth are all zero in this diff. Future account/usage
controls must integrate into existing identity, API contract, and billing
surfaces; inspect their mounted UI and Pen/interaction owners before that work.

## Verification and staged delivery

| Stage / existing owner | Required proof |
|---|---|
| Documentation / JOV-4875 | Canonical API pricing fields, registry proposal, this brief, local links/parity/policy checks; no live billing edits |
| Account and shadow usage / JOV-4073, JOV-4075 | Provider signup/list/revoke/cancellation/recovery; cross-tenant and operator-token denial; durable rate limits; same-account multi-key quota; zero charges |
| Resource reuse / JOV-4075 | Concurrent identical misses invoke upstream once; crash/lease expiry and invalidation races cannot publish stale results; tenant isolation; source expiry and upstream failure never yield stale merchant/product truth |
| Paid activation / JOV-4875 gates | Tim's exact-amount receipt, responsibility matrix, delegated-grant denial/revocation, metering before charge, concurrent cap boundary, provider duplicate/out-of-order delivery, refunds/disputes, reconciliation after crashes/outages |

Shadow evidence must measure first-success activation, operation counts and
COGS, hit ratio, upstream calls avoided, stale-result denials, free-limit hits,
warning-to-opt-in conversion, abuse, and gross margin by operation/cohort.
Set numeric launch thresholds from that evidence and the canonical pricing
philosophy; no new threshold or demand claim is approved here.

**Ship now:** publish this bounded proposal with all external payment paths
disabled. **Re-evaluate when:** account and cache shadow receipts are available
or a requirement/provider version changes. **Then:** qualify the existing
workstream and obtain exact-amount/payment decisions before paid activation.
Stop new paid work on uncertain grants, metering drift, stale truth, or cap
breach; reconcile accepted work and preserve free access within its limits.
Rollback for this documentation slice is a revert; future activation needs a
charging kill switch that preserves audit history and does not erase usage.

Local documentation checks prove consistency only. Hosted CI, merge/main,
deployment, API availability, cost reduction, and recurring runtime behavior
need their own receipts; none is inferred from this brief.
