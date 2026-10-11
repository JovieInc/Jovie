# Products primitive audit — October 1, 2026

Owner: [JOV-7435](https://linear.app/jovie/issue/JOV-7435).
Source baseline: `20a3b98515142ac4d9a815c7e2ebb85fa20156fc`.
Scope: entity semantics, existing commerce contracts, provider fit, and a bounded
discovery-data correction. This is source evidence; account access, live stock,
payment, fulfillment, creator payout, and design certification remain unverified.

Read-only runtime baseline: production build-info returned the same full source
SHA, deployment `dpl_FARvKLYgwTkCtyaPUFq8fM8i7i9t`, version `26.10.0`.
The public Tim White profile rendered with no merch product IDs found in its
HTML. This is a receiving-profile observation, not proof of an empty database or
absence of approved inventory. No product page could be certified from that
profile; JOV-6346 retains the inventory/visibility/runtime acceptance.

## Decision and bottleneck

EVENT: Tim's October 1 direction makes **Products** the broader entity;
merchandise is a product type. Every approved product needs a useful product page
and a stable shareable link. Importing existing Shopify or Spring catalogs must
support external store/checkout handoff. Jovie-hosted selling with Printful and
agent-authorized buying are separate gated capabilities.

Products lives within **Work**, with `Library` retaining its implementation
namespace. [Identity / Work](identity-work-ontology.md) and the
[Work content graph](library-content-graph-and-artist-rules.md) supersede the
July 31 audit's old area inventory. No navigation, control-plane, or Pen-workflow
migration follows from this decision.

The bottleneck is commerce truth and product identity: the current public product
schema invents stock, while existing store-level links and Printful-specific rows
cannot represent an imported catalog. Success for this patch is zero unsupported
stock assertions, consistent persisted product identifiers, and behavioral
regressions executing through the existing CI selector. Success for the next
slice is one approved imported product reachable by stable link with a truthful
external buying destination, certified from canonical design through runtime.

## Primitive map and source receipts

| Primitive | Current owner/source | Coherent boundary and finding |
| --- | --- | --- |
| Principal / Creator | [profiles schema](../../apps/web/lib/db/schema/profiles.ts), [auth schema](../../apps/web/lib/db/schema/auth.ts) | Creator remains `creator_profiles.id`; identity, authenticated user, access grant and payee are distinct. Historical `createdByClerkUserId` columns in merch are provenance names, not authority to restore Clerk or migrate auth in this pass. |
| Creative Work | [lifecycle stage](../../apps/web/lib/library/lifecycle-stage.ts), [relationship graph](../../apps/web/lib/library/graph-types.ts) | Kind, stage, approval, publication and relationship are independent. `out`/`live` does not prove revenue. Current catalog kinds include `merch`, with no general `product` adapter. |
| Product | [merch schema](../../apps/web/lib/db/schema/merch.ts), [public service](../../apps/web/lib/merch/service.ts) | `merch_cards.id` is the persisted legacy product anchor. Its required Printful snapshot cannot honestly represent a Shopify/Spring import. Do not manufacture Printful metadata or duplicate authoritative catalogs. |
| Variant / provider binding | Same schema; [Printful catalog](../../apps/web/lib/merch/catalog.ts) | Provider product, variant IDs, variant map, placement and technique are separate from Jovie product identity. Current pricing/safety is USD/US-specific; imported currency/availability must stay provider-specific and fresh. |
| Offer / sales policy | [pricing](../../apps/web/lib/merch/pricing.ts), [safety](../../apps/web/lib/merch/safety.ts) | Current retail/cost/royalty snapshots belong to the hosted merch path. Merchandise type and normal/limited-drop policy are different axes. External merchant prices do not imply Jovie margin or payout. |
| Public product page/link | [product page](../../apps/web/app/[username]/merch/[cardId]/page.tsx) | Existing `/{username}/merch/{cardId}` is useful legacy routing; UUID is stable but handle-based URL stability across creator renames is unproven. URL `success=1` currently displays an order confirmation without checking payment/session evidence. |
| External destination | [shop settings](../../apps/web/lib/profile/shop-settings.ts) | Existing validated HTTPS `*.myshopify.com` setting is store handoff with UTM parameters, not catalog import, per-product identity, custom-domain verification or Spring support. No Shopify/Spring catalog connector found in the current connector source. |
| Discovery / availability | [JSON-LD](../../apps/web/lib/seo/structured-data/merch.ts), [availability endpoint](../../apps/web/app/api/merch/[sku]/availability/route.ts), [builder](../../apps/web/lib/merch/availability.ts) | JSON-LD formerly always emitted `InStock`. Endpoint applies live/public + card sellability, but omits checkout's MERCH_MVP and Connect readiness and the service's profile visibility predicate. A `checkoutUrl` is a product-page handoff, not an agent payment API. |
| Checkout / payment / refund | [checkout route](../../apps/web/app/api/merch/checkout/route.ts), [orders](../../apps/web/lib/merch/orders.ts), [Connect readiness](../../apps/web/lib/stripe/connect-readiness.ts) | Existing checkout gates MERCH_MVP, card safety and trusted Connect readiness. It creates a Stripe platform payment; that check does not establish merchant-of-record policy or a Connect transfer. Webhook payment, partial/full refund and fulfillment hold are distinct states. |
| Fulfillment / reconciliation | Same orders file; [Printful client](../../apps/web/lib/printful/client.ts) | Existing v2 draft -> confirm, external ID, jobs and provider events are the seam to retain. `fulfilledAt` currently means submitted, not delivered. Confirmation failure after `printful_draft_created` and create-response loss need reconciliation proof; external ID alone is not idempotency evidence. |
| Payout / outcome | [merch payout schema](../../apps/web/lib/db/schema/merch.ts), orders | Accrual, held-for-refund-window, reversed and manually paid are explicit. No automatic creator payout is established by a card, estimate, Connect readiness or paid order. Separate gross sales, refunds, fees/costs, creator liability and Jovie revenue. |
| Buying agent | [JOV-4077](https://linear.app/jovie/issue/JOV-4077), historical [JOV-3253](https://linear.app/jovie/issue/JOV-3253) | Product/Offer discovery and an availability endpoint exist in source. Eligible sales-channel access, delegated purchase authority, real paid order/refund/fulfillment and marketing certification are UNKNOWN. |

## Adopt-first receipt

Decision: **compose** existing Jovie identity/Work/provider contracts with
maintained merchant catalog and checkout APIs; **extend** only the Jovie-specific
product identity, projection, page and certification gap. Keep Stripe and
Printful for the existing hosted path. No new commerce engine, wallet, credential
vault, scheduler, router or design kit is justified by this slice.

Primary sources checked October 1, 2026:

| Option | Fit / operating and credential boundary | Maintenance, migration and decision |
| --- | --- | --- |
| [Shopify Storefront Product](https://shopify.dev/docs/api/storefront/latest/objects/Product), [API access](https://shopify.dev/docs/api/storefront/latest), [version policy](https://shopify.dev/docs/api/usage/versioning) | Product/variant IDs, online-store URL, contextual price and availability support external catalog projection. `onlineStoreUrl=null` means unpublished to that channel; availability is variant-aware. Public and private token modes differ; private/Admin tokens stay server-side in the current credential boundary. Initial handoff leaves checkout/customer/payment data with the merchant. | Maintained hosted service with versioned API/terms, not an OSS license. Pin a supported version at implementation, preserve provider/account/IDs and provenance so reconnect or version upgrades do not change Jovie IDs. Compose; no new Shopify checkout stack. Merchant authorization and actual Jovie connection remain UNKNOWN. |
| [Spring Seller API](https://api.teespring.com/docs) | Published docs require a provisioned `app_id`, email/password authentication and a one-day token. That is not proof of generally available OAuth or Jovie access. Do not add password collection, scrape a private catalog or bypass the existing token vault. | Hosted API/terms; current access and maintenance guarantees beyond published docs are UNKNOWN. Gate automatic import pending supported access; retain a reviewed external product destination as the conservative handoff boundary. Preserve provider IDs/source snapshots and avoid provider credentials in product records. |
| [Printful v2](https://developers.printful.com/docs/v2-beta/) | Catalog/variant cost, region availability, mockups, draft orders and confirmation fit existing source. Store-scoped bearer credentials remain server-side. Recipient addresses/print files enter Printful only through the existing authorized fulfillment path. Confirmation is a consequential action. | Official docs still identify v2 as beta and warn of possible endpoint changes. Current client already uses v2; no migration is warranted just for this audit. Extend existing seam, retain external IDs, re-fetch/reconcile before retrying a potentially accepted mutation. No live provider canary was run. |
| [Stripe agent commerce](https://stripe.com/guides/agentic-commerce-primer-ai-platforms), [SPT docs](https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens) | Existing Checkout/Connect remains the payment substrate. Scoped/time-limited agent payment credentials are distinct from reusable card credentials; seller tax/refund/fulfillment responsibility persists. Separate Jovie subscriptions from creator products. | Hosted service/terms, existing SDK/payment contracts; account/channel eligibility is UNKNOWN. SPT index was retrieved but detailed Connect variant returned an internal error; no Connect-specific support assertion is made. Compose only after JOV-4077's access and approved canary receipts. |
| [ACP onboarding](https://developers.openai.com/commerce/guides/get-started), [spec repository](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol), [license](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/blob/main/LICENSE) | Current OpenAI docs say feed onboarding is for approved partners. A JSON-LD product or open protocol implementation does not confer channel access or purchase authority. Maintain an adapter over canonical Product/Offer/Order records rather than making a protocol the entity model. | OpenAI/Stripe-maintained spec under Apache-2.0; hosted channel access has separate terms/approval. Preserve transport-independent IDs and receipts for portability. Candidate adapter under JOV-4077; no protocol selected or activated in this patch. |

Ship now: the bounded metadata truth correction and this reconciled contract.
Re-evaluate when: authorized catalog access and canonical product-page references
are available, or provider/API/access policy changes invalidate the fit.
Then: deliver one imported external product through the existing page/Work seam;
only expand hosted or buying-agent claims after the corresponding receipts.

## Canonical design brief and owner boundary

Implementation/design intake: [JOV-7436](https://linear.app/jovie/issue/JOV-7436).
Use the existing canonical file:
`/Users/timwhite/Documents/Jovie/Jovie Marketing Workspace/Jovie Design Studio — canonical.lib.pen`.
One writer; preserve approved layouts and Tim's stacked-DSP edit. Current urgent
Pen enforcement remains with **Ship Pen parity and governor enforcement**.
Shared clipping and all-screen interaction dogfood remain with their current
owner; failed-PR repair is independent of this audit.

Read-only Pen inventory found the active editor was the October 1 homepage review
copy, **not** the locked canonical file. No Pen mutation, switch or save was
performed. Inventory included `W6bcme` (merch checkout), `l7xRto` (Library asset
card), `odpZ8` (entity header) and `kh2z3` (public profile shell); those IDs are
review-copy evidence only, not certified canonical references. The existing Pen
owner was contacted to reconcile the product-detail owner/reference.

The focused product-page brief is one product hero with creator attribution,
source merchant, real variant/price/currency, honest availability and one clear
destination. Use existing card/header/controls. States to design and certify:

| State | Useful behavior and proof |
| --- | --- |
| Imported, approved, provider-available | Product page + share link; select real variant; continue to named external store. No Jovie fulfillment/payout promise. |
| Availability unknown/stale, disconnected source | Keep identity/source information; disclose unknown availability. Never infer InStock or display a false buy-ready claim. |
| Unavailable / withdrawn | Preserve permitted public identity/history; disable purchasing. Unapproved/private records remain inaccessible. |
| Hosted commerce gated | Page may explain the product; checkout only through existing safety/flag/payment/fulfillment gates. Show readiness without claiming a sale. |
| Checkout return / pending webhook | Return is distinct from order confirmation. Show paid/submitted/shipped/refunded only from a scoped server receipt. |
| Buying agent | Discovery schema can describe a product. Agent purchasing/marketing remains unavailable until channel, authorization and real fulfillment certification. |

Required design receipt is exact canonical frame/state review, save/persistence
and native readback, then code mapping, layout/state coverage, exact deployment
and rendered parity. A generated frame, review-copy inventory or source patch
does not establish any of those tiers.

## Reconciled issue ledger

| Issue | Current receipt / next responsibility |
| --- | --- |
| [JOV-7435](https://linear.app/jovie/issue/JOV-7435) | This audit, assigned Tim, In Progress at intake. Bounded JSON-LD correction: SKU/public URL and explicit-only stock; meaningful regressions. |
| [JOV-7436](https://linear.app/jovie/issue/JOV-7436) | Required Products identity/page/import slice, assigned Tim, Todo. Canonical design first; one approved external product, resumable provider binding, stable links and migration compatibility. |
| [JOV-6346](https://linear.app/jovie/issue/JOV-6346) | Existing hosted merch dogfood, Todo, unassigned at audit. Appended concrete availability/checkout mismatch, URL-only confirmation, submission/fulfillment, retry and payout findings without replacing original acceptance. |
| [JOV-4077](https://linear.app/jovie/issue/JOV-4077) | Existing agent commerce canary, Todo, unassigned. Retain support matrix, canonical offer/payment/entitlement and eligibility gates. No duplicate protocol project. |
| [JOV-4748](https://linear.app/jovie/issue/JOV-4748) | Existing normal-item/immutable-drop lifecycle contract, Backlog. Broader Product type remains separate from this sales policy. |
| [JOV-3439](https://linear.app/jovie/issue/JOV-3439) | Existing external-shop QA harness, Backlog, Tim. Reuse for safe handoff/attribution coverage. |
| [JOV-6559](https://linear.app/jovie/issue/JOV-6559) | Existing share-preview art direction, Todo. Include product page metadata once canonical page design exists. |

Open-PR title/branch audit found no commerce implementation writer; the existing
Links PR [#19502](https://github.com/JovieInc/Jovie/pull/19502) remains outside this
patch. No unrelated source or shared UI primitives are edited.

## Patch proof and limitations

The JSON-LD correction keeps existing page/checkout routes and USD merch pricing.
`sku` now uses the persisted card ID; `url` matches the existing product page.
Unknown stock is omitted; explicit observations can still emit InStock or
OutOfStock. Rich-result validation accepts an offer without invented availability.
Google's [Product snippet contract](https://developers.google.com/search/docs/appearance/structured-data/product-snippet)
classifies availability as recommended rather than required. This keeps the
validation rule aligned with the standard without changing CI admission gates.
This does not verify rename-proof public routing or agent purchasability.

New regression suite failed against baseline: 5 failed / 3 passed. After the
change, focused discovery and existing structured-data suites passed: 33 tests.
Current CI-selector coverage, review, hosted checks, merge queue and deployment
must be recorded on the exact PR head before promotion; local tests do not
certify the hosted/agent commerce paths. No product was published, purchased,
fulfilled, connected to a new provider or transferred to a new service.
