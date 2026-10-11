# Meta Muse SMB connector reconciliation

Issue: [JOV-7342](https://linear.app/jovie/issue/JOV-7342/p0-canary-meta-muse-smb-connectors-reconcile-integration-backlog)

Status: bounded decision complete; no Muse production dependency or external
publication authorized.

## Receipt

| Field               | Value                                                              |
| ------------------- | ------------------------------------------------------------------ |
| Evidence            | `evidence:meta-muse-small-business-2026-09-29`                     |
| Capability event    | `capability-event:ef6de8199823e6ff18ba8b8b`                        |
| Event digest        | `de4aaf491f5a416d999d77227db0344289d7d674ff46e0200f876418c48e3aeb` |
| Class               | `connector-surface`                                                |
| Observed            | 2026-10-01                                                         |
| Repository evidence | `6aa757b2a0` plus the Linear inventory below                       |
| Linear coverage     | complete active snapshot: 1,406 issues across 57 pages             |
| GBrain              | `gbrain-unavailable`; repository and primary sources used          |

The event is one connector-surface change with two independently evaluated
consequences: Muse as a supplier of business facts/actions, and Muse as a
distribution channel for Jovie capabilities. Duplicate launch coverage must
reuse this event ID and digest.

## Verified external evidence

Meta's [SMB launch](https://about.fb.com/news/2026/09/introducing-muse-small-business/)
names Klaviyo, Shopify, Stripe and other connectors, says Muse can work with
storefront, books and customer records, advertises custom connectors, and links
to a partner application. The announcement demonstrates breadth, not each
connector's fields, actions, fidelity or reliability.

The public [Muse Connector Platform](https://muse.ai/platform) separately
establishes a distribution opportunity: approved connectors can appear in the
Muse directory, Meta reviews functional, security and legal requirements plus
end-to-end behavior, and editorial selection controls featured placement. It
does not publish partner protocol details, install volume, fees, revenue share,
SLA, update semantics or partner telemetry.

The [connector help contract](https://www.meta.com/help/artificial-intelligence/1687253048996149/)
establishes user authorization, task-relevant data exchange, optional proactive
updates, configurable read/action access, approval defaults and user disconnect.
It also says previously used information may remain in Muse memory or
conversation history after disconnect, and custom connectors are not reviewed
by Meta. Those are material privacy and reversibility constraints.

Meta's [security design](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse)
documents per-user VMs, separate read/write privileges, connector-level
controls, credential isolation, approvals and an activity trail. These controls
are evidence about Muse; they do not transfer Jovie's tenant, consent, billing or
outcome authority to Meta.

Muse is free with a limit; public consumer plans are currently listed at
$20/month and $100/month in the [subscription help](https://www.meta.com/help/subscriptions/1021145227643680/).
Availability varies and remains limited testing. Partner and connector economics
are unpublished. Meta's broader reach claims and enterprise direction therefore
remain priors, not evidence of Jovie acquisition or connector usage.

## Customer jobs before providers

| Jovie customer job                            | Required facts                                                                                                   | Required actions                                                   | Muse disposition                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Understand what is growing or leaking revenue | Provenanced orders, payments, refunds, products, campaigns, segments, ads and social performance with freshness  | Read, aggregate and explain without changing source truth          | Candidate supplier; public docs do not prove field coverage, export, joins or freshness |
| Plan a release or audience campaign           | Consented segment, prior engagement, offer/catalog state, brand voice, channel constraints and measured outcomes | Draft plan/content and propose recipients, timing and budget       | Candidate supplier for context/drafts; Jovie keeps truth and approval                   |
| Execute an approved campaign                  | Exact actor, tenant, recipients, content revision, spend, suppression state and provider capability              | Send, publish, spend, retry, revoke and compensate idempotently    | Do not delegate authority until the full action contract is certified                   |
| Reconcile billing and commerce                | Signed payment/subscription/order events, account identity, amount, currency and dispute/refund state            | Apply billing state, fulfill or refund, reconcile duplicates       | Keep direct source-of-truth paths; Muse may only be advisory                            |
| Discover and use Jovie inside another agent   | Canonical artist/release identity, entitlement and capability version                                            | Resolve or retrieve a Smart Link with a truthful structured result | Candidate Muse distribution canary, independent of consuming Muse connectors            |

This applies [JOV-6259](https://linear.app/jovie/issue/JOV-6259/unify-integration-directory-dsp-capabilities-and-signal-driven):
Muse, Composio, direct APIs and custom code are replaceable fulfillment routes
behind stable fact/action contracts. The provider list is not product
architecture.

## What Jovie still owns

Current source has four first-party connector definitions (Gmail, Google
Calendar, Spotify and YouTube), one encrypted token-vault path, tenant-scoped
approval checks, closed action-kind dispatch, idempotent provider writes and
signed Stripe webhook truth. Muse does not make these contracts unnecessary.

Jovie retains:

- customer and artist tenant identity, entitlement and consent provenance;
- canonical facts, provenance, freshness, conflict and unknown semantics;
- least-privilege scope selection, credential lifecycle and revocation truth;
- action proposal, exact revision approval, suppression, spend and side-effect
  policy;
- idempotency, retry, compensation, audit and certified outcome receipts;
- direct billing/payment truth and any source where fidelity, economics,
  reliability or support justify direct ownership;
- provider-level observability and a removable fallback when Muse changes.

Muse may supply data or execute an adapter action only after the same contract
passes. Its own approval UI is additive defense, not a replacement for Jovie's
authority.

## Consume versus distribute

| Option                        | Decision now       | Reason                                                                                                                                     |
| ----------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Consume Muse connectors       | `INVESTIGATE`      | Breadth and safety controls are credible; representative data/action scope, reliability, terms, observability and economics remain unknown |
| Distribute Jovie through Muse | `INVESTIGATE`      | The directory and review path are real acquisition options; protocol, partner access, telemetry and measured reach are unknown             |
| Do both                       | Not coupled        | Each direction must pass independently; distribution must not require Muse to become Jovie's supplier                                      |
| Neither                       | Production default | No Jovie runtime or public listing depends on Muse today                                                                                   |

### Channel profile gaps

| Dimension             | Current evidence                                                                       | Consequence                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Reach                 | Directory discovery and possible featured placement; no install or active-user figures | Treat acquisition leverage as an experiment, not a forecast                                    |
| Auth and permissions  | User authorization, read/action separation and approvals exist                         | Partner OAuth, tenant mapping, entitlement callbacks and revocation receipts remain unverified |
| Reliability           | Product/security descriptions only; no connector SLA or status history                 | No production dependency or direct-path retirement                                             |
| Pricing/economics     | Consumer subscriptions published; partner fees, payout and quotas absent               | No adoption, margin or CAC claim                                                               |
| Platform dependence   | Meta controls review, listing and featured placement                                   | Compile a thin adapter; keep canonical logic and rollback outside Muse                         |
| Observability         | User-facing activity/audit exists                                                      | Partner request, error, attribution and outcome telemetry remain unverified                    |
| Terms/privacy         | Connector terms apply; disconnect may retain history; partner terms require access     | Do not send customer/audience/payment data before review                                       |
| Reversibility         | Users can disconnect; Jovie can remove an adapter                                      | Test revocation and deletion separately; retain direct alternatives                            |
| Distribution leverage | Meta promises directory discovery and partner placement                                | Measure qualified Jovie account creation and successful jobs, not listing presence             |

## Backlog reconciliation

| Issue                                                                                                                                                                                                                                                                                                                                                       | Disposition              | Why                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| [JOV-2923](https://linear.app/jovie/issue/JOV-2923/integration-strategy-aggregator-first-composionangomergeparagon-now)                                                                                                                                                                                                                                     | `RETIRE`, executed       | “Aggregator-first” is no longer a durable architecture. Suppliers remain candidates under JOV-6259 |
| [JOV-6259](https://linear.app/jovie/issue/JOV-6259/unify-integration-directory-dsp-capabilities-and-signal-driven)                                                                                                                                                                                                                                          | `KEEP`                   | Canonical outcome -> fact/action -> replaceable supplier compiler                                  |
| [JOV-2919](https://linear.app/jovie/issue/JOV-2919/connectordefinition-manifestregistry-eliminate-connectorprovider-type), [JOV-3188](https://linear.app/jovie/issue/JOV-3188/integrations-connections-page-youtube-connectorprovider-plumbing)                                                                                                             | `KEEP CLOSED`            | Completed provider registry and Connections foundation remain useful                               |
| [JOV-7363](https://linear.app/jovie/issue/JOV-7363/epic-founder-self-serve-connectors-one-connections-page-same-logic-and)                                                                                                                                                                                                                                  | `KEEP`, supplier-neutral | Self-serve auth and shared dogfood UI are Jovie responsibilities                                   |
| [JOV-4496](https://linear.app/jovie/issue/JOV-4496/program-build-consented-artist-profile-connector-registry), [JOV-6597](https://linear.app/jovie/issue/JOV-6597/minimize-oauth-scopes-and-add-connected-account-token-hygiene), [JOV-6712](https://linear.app/jovie/issue/JOV-6712/web-list-and-revoke-apps-connected-to-your-jovie-account-oauth-grants) | `KEEP`                   | Consent, scope hygiene and revoke lifecycle are not connector commodities                          |
| [JOV-3392](https://linear.app/jovie/issue/JOV-3392/design-note-audience-intelligence-loop-signal-recommend-approve)                                                                                                                                                                                                                                         | `KEEP`                   | Muse can supply signals; Jovie retains recommend -> approve -> execute -> learn                    |
| [JOV-6922](https://linear.app/jovie/issue/JOV-6922/sentry-error-no-signatures-found-matching-the-expected-signature-for)                                                                                                                                                                                                                                    | `KEEP`                   | A Stripe connector does not replace signed billing events or incident repair                       |
| [JOV-3253](https://linear.app/jovie/issue/JOV-3253/agentic-commerce-productoffer-schema-machine-readable-merch)                                                                                                                                                                                                                                             | `KEEP CLOSED`            | Canonical Product/Offer contract is reusable through Muse or another channel                       |
| [JOV-7311](https://linear.app/jovie/issue/JOV-7311/capability-distribution-os-27-canonical-capability-contract-channel), [JOV-7315](https://linear.app/jovie/issue/JOV-7315/capability-distribution-os-67-marketplace-radar-continuous-ecosystem)                                                                                                           | `KEEP + EXTEND`          | Add Muse platform evidence and compatibility inputs; no one-off publication path                   |

The JOV-2923 mutation ran through
`jovie.capability-backlog-reconciliation/v1`. Readback verified `Canceled` plus
intent/applied markers. Rollback snapshot digest:
`d3f078d422f76b3d4fc189005b7542e99be5300828e9f5a1b0291f3db7088036`.
No completed foundation reopened and no per-connector issues were created.

## Smallest reversible experiment

Use the existing JOV-7315/JOV-7311 scope; do not open another connector epic.

1. Obtain partner/developer access and record a versioned Muse platform profile:
   protocol, auth, scopes, tenant identity, review, terms, data retention,
   pricing/quota, telemetry, SLA and update/rollback behavior.
2. Only if that profile passes, package one already-certified, read-only and
   idempotent capability: resolve an artist/release and retrieve an existing
   Jovie Smart Link. Use synthetic or public non-sensitive data first.
3. Verify exact input/output fidelity, least privilege, tenant binding, revoke,
   error behavior, Jovie-side request/outcome receipts and zero business logic in
   the Muse adapter.
4. Measure completed connections, successful qualified invocations, latency,
   failures, attributed Jovie account creation and fully loaded cost. A listing
   or featured placement is not success.
5. Stop before publication if partner terms remain unavailable, auth cannot bind
   a Jovie tenant, customer data cannot be minimized/deleted, request/outcome
   telemetry is absent, or economics cannot beat the next-best channel.

**Ship now:** this evidence receipt, the JOV-2923 retirement, and one
partner-access/platform-profile probe inside JOV-7315/JOV-7311.

**Re-evaluate when:** Meta publishes or changes partner access, connector
read/write scopes, review rules, pricing/quota, telemetry, reliability/SLA,
privacy/retention, distribution reach or protocol; or a representative Jovie
contract produces measured runtime results.

**Then:** benchmark Muse against direct APIs and the best current supplier on the
same fact/action contract. Adopt, shadow, keep or retire only that route; never
promote Muse into product architecture by name.
