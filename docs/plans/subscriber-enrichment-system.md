# Subscriber Enrichment System for Name Lookup (JOV-1362)

## Why this matters

Today, unsubscribed and newly subscribed contacts commonly appear as **"SMS Subscriber"** or **"Email Subscriber"**.
That generic labeling degrades table readability, slows creator workflows, and makes segmentation less actionable.

This plan defines a privacy-safe, asynchronous enrichment system that resolves better display names from email addresses or phone numbers while preserving data provenance and graceful fallbacks.

---

## Product outcomes

1. **Improve recognizability** in Audience, Followers, and Users tables.
2. **Preserve trust** by clearly separating user-provided values from enriched values.
3. **Protect performance** by running enrichment off the signup/request path.
4. **Control costs** via queueing, retries, and provider-agnostic limits.

---

## UX principles

- **Never block signup or subscription flows** for enrichment calls.
- **Prefer confidence over completeness**: show enriched names only when confidence crosses threshold.
- **Always preserve original labels** as deterministic fallbacks.
- **Keep copy crisp and neutral**:
  - Primary fallback: `Email Subscriber`
  - Secondary fallback: `SMS Subscriber`
  - Avoid any language that implies certainty when confidence is low.

---

## Proposed data model (minimal)

Add enrichment-specific columns to `audienceMembers`:

- `enrichedName` (`text`, nullable)
- `enrichedNameSource` (`text`, nullable) — provider key (`clearbit`, `fullcontact`, etc.)
- `enrichedNameConfidence` (`numeric`, nullable)
- `enrichedNameUpdatedAt` (`timestamp`, nullable)
- `enrichmentStatus` (`text`, default `pending`) — `pending | enriched | no_match | failed | throttled`
- `enrichmentAttempts` (`int`, default `0`)
- `enrichmentLastError` (`text`, nullable)

### Precedence rule

When rendering display name:

1. User-supplied name (if available)
2. `enrichedName` (if confidence >= threshold)
3. Existing fallback labels

This precedence should be centralized in one shared formatter/helper to avoid drift across tables.

---

## System architecture

### 1) Provider abstraction

Create a provider interface that supports:

- `lookupByEmail(email)`
- `lookupByPhone(phoneE164)`
- normalized response: `{ fullName, confidence, source, rawMetadata }`

This lets us swap providers without rewriting queue or UI logic.

### 2) Async job pipeline

- Trigger enrichment job when a subscriber record is created/updated and lacks a trusted name.
- Queue jobs in small batches.
- Run via scheduled worker/cron with strict rate limiting.
- Include exponential backoff and max attempts.

### 3) Safety controls

- Circuit breaker on provider failures/timeouts.
- Per-provider daily quota guardrails.
- Feature flag to disable enrichment globally.
- Provider timeout budget (e.g., 2s to 3s) for each outbound request.

### 4) Observability

Track:

- success rate
- no-match rate
- average confidence
- median latency
- cost per enriched contact

Expose these metrics internally to evaluate ROI and tune thresholds.

---

## Privacy and compliance constraints

- Do not overwrite user-entered names with enriched values.
- Store provider metadata minimally; avoid retaining unnecessary PII.
- Add provider-specific disclosures in privacy policy if required.
- Respect deletion flows and ensure enriched fields are deleted with the subscriber.
- Keep enrichment optional behind rollout controls while legal review is pending.

---

## Rollout plan

### Phase 0 — Foundation

- Add schema fields + typed contracts.
- Add shared display-name resolver utility.
- No provider calls yet.

### Phase 1 — Single-provider pilot

- Implement provider adapter behind feature flag.
- Enrich only a small percentage of new subscribers.
- Validate latency, confidence distribution, and cost.

### Phase 2 — Background backfill

- Enrich historical contacts in capped nightly batches.
- Stop at confidence threshold and skip ambiguous matches.

### Phase 3 — Multi-provider fallback (optional)

- If no match from Provider A, try Provider B only when ROI justifies it.
- Keep strict budget and timeout policies.

---

## Acceptance criteria for implementation PRs

1. Signup/subscription latency unchanged (no synchronous enrichment).
2. Display-name resolver returns deterministic fallback when enrichment is unavailable.
3. Provider failures never break audience APIs or UI rendering.
4. Enrichment jobs are idempotent and bounded by retry limits.
5. Metrics dashboard or logs show enrichment outcome breakdown.

---

## Open decisions for product + architecture review

1. Minimum confidence threshold for showing enriched names.
2. Whether phone-based enrichment is enabled at launch.
3. Monthly budget cap and auto-throttle behavior.
4. Whether to expose enrichment provenance in internal admin UI.
5. Provider selection criteria (coverage, reliability, legal posture, and unit economics).

---

## Linear reference

- Linear: `JOV-1362`
