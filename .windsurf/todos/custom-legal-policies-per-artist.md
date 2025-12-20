---
description: Support custom Privacy Policy + Terms per artist/label for subscriptions (e.g., Universal Music Group), while preserving Jovie policies and minimizing conversion impact
---

# TODO: Custom Privacy Policy + Terms per Artist (Subscription Context)

## Goal
Enable certain artists/labels (e.g., a Universal Music Group artist) to use **label-provided** Privacy Policy and/or Terms **for subscription flows**, while:
- Preserving **Jovie’s platform** Privacy Policy + Terms as the default and always-accessible baseline
- Avoiding conversion harm (no extra steps, no confusing UX)
- Keeping the UI clean and consistent

## Non-goals (for this workstream)
- Rewriting the legal documents themselves
- Introducing new checkout funnels or payment providers
- Adding additional consent checkboxes unless legal explicitly requires it

## Principles (conversion + clarity)
- **Default to Jovie** unless an explicit per-artist override is configured.
- **One consent sentence** near the CTA; do not add extra steps.
- When overrides apply, **show both**:
  - “Applies to this subscription” = artist/label policy links
  - “Platform policies” = Jovie policy links
- Copy should be minimal, direct, and consistent.

## Key UX decisions
### A) Primary surface: consent line in subscription/tip checkout
- Default:
  - “By subscribing, you agree to the Terms and acknowledge the Privacy Policy.”
- With override:
  - “By subscribing, you agree to the Terms and acknowledge the Privacy Policy (provided by Universal Music Group).”

Notes:
- Keep to one sentence.
- Links open in a new tab or an in-app modal (choose based on existing patterns).

### B) Secondary surface (optional): “Legal details” disclosure
A collapsed disclosure that expands to:
- “Applies to this subscription:” label/artist Terms + Privacy links
- “Platform policies:” Jovie Terms + Privacy links

This keeps the main CTA area clean.

### C) Dedicated per-artist legal summary page (fallback)
Provide a stable route for legal review and user clarity:
- Example: `/<username>/legal` (or existing equivalent)

This page should:
- Clearly separate subscription policies vs platform policies
- Include “provided by <legal entity>” framing where applicable

## Policy scope model
Define policy “contexts” (initially only one):
- **Context: subscription**

For each creator/artist:
- If no overrides exist for `subscription` context → show Jovie defaults.
- If overrides exist → use overrides for the subscription context, but continue to expose Jovie platform policies.

## Data/config requirements
### Per-creator fields (subscription context)
- `subscriptionPrivacyPolicyUrl` (optional)
- `subscriptionTermsUrl` (optional)
- `subscriptionLegalEntityName` (optional but recommended, e.g., “Universal Music Group”)
- `subscriptionPolicyEffectiveDate` (optional)

### Resolver behavior
Create a single server-side resolver that returns:
- Which policy URLs to show for the **subscription context**
- A display string for the provider/entity (if present)
- A fallback to the global Jovie policy URLs

### Admin management
- Ability to set/update overrides per creator
- Audit history (who changed what, when)

## Legal/SEO/I.A. requirements
- Keep canonical Jovie pages:
  - `/legal/privacy`
  - `/legal/terms`
- Artist/label policy pages should **not** appear as “Jovie’s legal documents.”
  - If hosted internally, clearly label as “provided by <entity>”
- Ensure link labels are consistent: **Terms**, **Privacy Policy**

## Integration points (inventory)
Identify all places a user can subscribe/tip and ensure policy links are consistent:
- Subscription modal
- Checkout page (if separate)
- Post-purchase confirmation
- Transactional emails/receipts (if we include policy links today)

## Engineering plan (phased)
### Phase 0 — Discovery
- Identify all subscription/tip entry points in the codebase
- Decide whether policy links open in a new tab or in a modal
- Confirm any legal requirements for explicit checkbox vs inline consent

### Phase 1 — Config + resolver
- Add data model / config storage for per-creator override fields
- Implement a server-side resolver: `getSubscriptionPolicyConfig(creator)`
- Add admin UI to edit overrides
- Add audit logging for changes

### Phase 2 — UI wiring (subscription/tip flow)
- Update consent line to reference resolved policy config
- Add “Legal details” disclosure if needed
- Ensure “Platform policies” remain accessible

### Phase 3 — Optional: acceptance snapshot
If compliance/risk requires, store a snapshot/reference:
- Policy effective date / version captured at time of subscription

## Feature flag + rollout
- Introduce a feature flag for enabling overrides:
  - Default OFF
  - Enable only for enterprise artists initially

Rollout steps:
- Internal QA
- Enable for a single test creator
- Enable for first enterprise artist

## QA checklist
- Confirm default creators show only Jovie policies
- Confirm override creators show:
  - Artist/label policies for subscription context
  - Jovie platform policy links still accessible
- Confirm copy stays one-line and does not shift CTA layout
- Confirm links work on:
  - Mobile
  - Desktop
  - Light mode
  - Dark mode

## Conversion monitoring
Track:
- Checkout start → checkout completion
- Click-through rate on legal links
- Drop-off at checkout step containing consent copy

## Open questions (must answer before build)
- Merchant of record for enterprise subscriptions?
- Do we need explicit checkbox acceptance for label policies?
- Should overrides apply only to paid subscriptions, or also to email capture / free follows?
- Do we need to include policy links in receipts/emails?

## Risks
- Confusing wording could reduce trust or increase friction.
- Incomplete override coverage could lead to inconsistent experiences across entry points.
- Legal entity naming must be precise and approved.
