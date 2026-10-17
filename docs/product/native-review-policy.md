# Shared native App Store review policy

Decision date: October 13, 2026. Source implementation: `AppReview` in
`apps/ios/Packages/JovieKit/Sources/JovieKit/AppReviewPolicy.swift`.
Contract: `app-review/v1`, schema version 1. Native product/module: `JovieKit`.

The bottleneck is fragmented review-request admission across our iOS apps.
Success means an eligible request follows achieved product value at a quiet
moment, with bounded fatigue, and every consumer uses the same policy source.
Rating lift is a hypothesis, not a promised outcome.

## Source and adopt-first decision

Zach Witzel's [August 25 article](https://x.com/zzwitz/status/2092263503910351152)
recommends native prompts, value moments, sentiment screening, repeated requests,
and frequent releases. Browser retrieval recovered the actual article after
Grok's read-only retrieval failed. The sentiment-screening recommendation is
excluded. Apple's current [review guidelines, 5.6.1 and 5.6.3](https://developer.apple.com/app-store/review/guidelines/)
require the provided API, disallow custom review prompts, and prohibit review
manipulation. This policy never asks people to predict their rating or diverts
negative responders away from the App Store. Feedback remains independently
available to everyone.

**Compose:** extend the existing JovieKit owner with a small admission contract,
use Apple's maintained StoreKit presentation, and extend the existing
JOV-INV-028 growth-learning evaluator with a read-only readout adapter. Do not
build a review dialog, randomizer, analytics store, scheduler, or growth control
plane. The custom gap is semantic eligibility and local fatigue shared across
apps; StoreKit deliberately does not provide that product-specific policy.

Apple's SDK remains under its developer terms. JovieKit retains the repository's
proprietary license for authorized company consumers. Optional
[RevenueCat Purchases](https://github.com/RevenueCat/purchases-ios) and
[PostHog iOS](https://github.com/PostHog/posthog-ios/blob/main/LICENSE) are maintained
MIT SDKs; neither is added by this change. Hosted connectors have separate
account permissions, service terms, and data boundaries. No new agreement,
credential, service, or account connection is created.

**Ship now:** one source and conservative configurable priors: a 30-day request
interval, fresh value opportunity within 24 hours, at most three *requests* per
rolling 365 days. These are our fatigue controls, not measurements of Apple's
display budget. **Re-evaluate when:** mature, correctly scoped readouts identify
interruption, fatigue, or a credible timing hypothesis. **Then:** prepare a
versioned policy change through the existing learning and authorization owner;
preserve the ledger and test its boundaries. A release never resets fatigue.

## Canonical invariants

1. A domain owner supplies an actual achieved-value receipt, never a launch
   count, screen name, purchase entitlement, star prediction, or sentiment.
2. Presentation requires an active foreground, a natural break, connectivity,
   and no blocking interaction. Editing, scrolling, capture, navigation,
   authentication, payment, and assistive interaction belong in that context.
   Enabling VoiceOver is not itself disqualifying.
3. StoreKit owns the UI. `request_invoked` means the API was called. Display,
   dismissal, rating, and review submission remain `unobservable`. No callback
   is synthesized, and absence of a callback is not a dismissal.
4. Reserve the request before invoking StoreKit. Corrupt/missing-version storage
   and failed reservation writes fail closed. Deferred offline/interrupted
   opportunities can recover while fresh. Apple remains authoritative for
   actual displays, including after reinstall or abrupt persistence failure.
5. One existing experiment owner supplies stable enrollment. There is no second
   randomizer. Active experiments require matching assignment; missing data
   cannot escape holdout. Ending an experiment is an explicit policy change.
6. Opaque event IDs stay local. Exportable receipt metadata has fixed generic
   fields. No transcript, media, health measurement, health record, account ID,
   purchase, or entitlement enters the review telemetry contract.

These follow Apple's [engagement and interruption guidance](https://developer.apple.com/design/human-interface-guidelines/ratings-and-reviews)
and [request-review API semantics](https://developer.apple.com/documentation/storekit/requesting-app-store-reviews).
The three-display system limit is a ceiling, not an instruction to use every slot.

## Consumer boundary

Authorized company consumers use an immutable, checksum-verified source snapshot
of the existing nested JovieKit package and a relative local Swift package
reference. The company [source contract](../company/REPOSITORY_SOURCE_CONTRACT.md)
permits pinned imports; Jovie remains the only policy writer. Consumer updates
and rollback are independent reviewed PRs. Never hand-edit the imported policy.

```swift
.package(path: "Vendor/JovieKit")
// Target dependency:
.product(name: "JovieKit", package: "JovieKit")
```

Requirements match existing JovieKit: Swift tools 6.0, Swift language 5, iOS 18+
or macOS 14+. Do not commit a machine-specific absolute package path. The direct
Jovie Git dependency is superseded: real LYB Xcode resolution timed out fetching
the large repository, including with the supported system SCM provider. A
successful temporary Git consumer did not establish native portability.

Apps construct `AppReview.Opportunity(id:moment:achievedAt:)`, with a typed
`ValueMoment`, and `Context(now:isAppStoreBuild:isForegroundActive:
hasExperiencedValue:isQuietMoment:isOnline:hasBlockingActivity:)`.
One installation-wide `@MainActor AppReview.Coordinator(load:save:)` consumes
`Data?` and writes encoded `Ledger` data. `consider(_:context:policy:assignment:request:)`
returns `Decision(reason:policyRevision:receipt:)`. Persistence closures must
surface errors where the chosen storage supports them. UserDefaults provides
best-effort local persistence, not crash-proof exactly-once delivery.

Jovie's first adapter uses `TeleprompterViewModel.onSaved`, after the actual
recording and local session save succeed. The shell waits for a quiet interval,
reevaluates context, cancels when interaction resumes, and drops pending requests
on background/lock. No geometry or custom review sheet is introduced. The
two-second settling delay is presentation plumbing; it is not eligibility.
Log Your Body supplies its own non-sensitive achieved-value event and uses this
same package. Its consumer and TestFlight delivery are separately owned.

Golden behaviors live in `AppReviewPolicyTests.swift`: eligibility, invalid and
future data, opacity, duplicate/reentry/relaunch, cooldown and annual boundaries,
policy-revision continuity, offline recovery, persistence failures, and stable
holdout/treatment enrollment.

## Apple testing and acquisition surfaces

| Surface | What it qualifies or measures | Boundary |
| --- | --- | --- |
| Swift/native tests | Admission, persistence, cancellation, accessibility and UI integration | Fake request closures prove policy, not real App Store presentation |
| Development StoreKit review UI | Native system prompt integration | Debug behavior is not production eligibility; [TestFlight review requests have no effect](https://developer.apple.com/documentation/storekit/skstorereviewcontroller/requestreview%28%29) |
| [Xcode StoreKit and sandbox](https://developer.apple.com/documentation/storekit/testing-at-all-stages-of-development-with-xcode-and-the-sandbox) | Purchase/refund/subscription integration; TestFlight IAP uses sandbox | Commerce testing does not measure review-prompt conversion |
| [Product-page optimization](https://developer.apple.com/app-store/product-page-optimization/) | Default-store-page icon/screenshots/previews; up to three alternatives, one test, up to 90 days | Store acquisition conversion; not available on custom product pages; not an in-app timing test |
| [Custom product pages](https://developer.apple.com/app-store/custom-product-pages/) | Up to 70 targeted pages with distinct URLs, reviewed metadata, page-level analytics; deep links on iOS 18+ | Referral/search/campaign context; no automatic causal link to review requests |
| [In-App Events](https://developer.apple.com/help/app-store-connect/offer-in-app-events/offer-in-app-events/) | Reviewed timely content/event discovery and deep links; up to 15 approved and 10 published | Event engagement/acquisition, not a generic rating campaign or daily-task prompt |

Use current Help documentation for limits: older Apple videos still describe
35 custom pages and 5 published events. Custom pages/events support App Store
Connect API metadata and submission, but publication is a separately authorized
action. No public API capability for product-page optimization test creation was
established in this research; do not invent one.

## Bounded self-driving learning

`assessAppReviewReadout` in `scripts/invariants/growth-learning-policy.mjs`
accepts `app-review-readout/v1` aggregate snapshots. It validates freshness,
matching app/version/storefront/window, outcome maturity, strict payload keys,
and guardrail counts. Missing data stays missing. It rejects prompt display,
dismissal, attributed-review and review-conversion metrics. Store written reviews
are a descriptive volume metric, not all ratings and not per-request attribution.

The adapter returns read-only evidence collection, a prepared policy-experiment
proposal, or a scoped disable proposal on harm. It always returns
`executionAuthority: none` and `causalCertification: not-certified`; execution
remains with the existing JOV-INV-028 workflow. It never auto-promotes a winner.

| Owner | Verified maintained capability | Authorized build boundary |
| --- | --- | --- |
| Apple | [Customer Reviews API](https://developer.apple.com/documentation/appstoreconnectapi/customer-reviews) and [Analytics Reports](https://developer.apple.com/help/app-store-connect-analytics/overview/analytics-reports-api) | Read app/version/territory/window-specific evidence. Written reviews are distinct from rating-only totals. Reports have privacy thresholds and delayed completeness; first report setup needs Admin, downloads can use Sales and Reports/Finance |
| PostHog | Hosted OAuth MCP, `execute-sql`, `experiment-get`, `experiment-results-get`, `feature-flag-get-definition`; [reference](https://posthog.com/docs/model-context-protocol/tools) | Use pinned project context and `x-posthog-read-only: true` or `readonly=true`. [Filtering](https://posthog.com/docs/model-context-protocol/faq) by category and tool name is a union. No customer/health data or session replay is needed |
| RevenueCat | OAuth or API v2 secret-key MCP; [read tools](https://www.revenuecat.com/docs/tools/mcp/tools-reference) include `get-experiment-results`, `get-chart-data`, and project inspection | Owns subscription/paywall offering experiments and commerce readouts; request-review policy never manufactures entitlements. [Read-only permission](https://www.revenuecat.com/docs/tools/mcp/setup) is sufficient for inspection; start/stop/update and price/offer mutations are distinct writes |

As observed in this task, no callable RevenueCat/PostHog account tools are
exposed. Plugin discovery found PostHog available but uninstalled. This says
nothing about whether the user's accounts exist or work elsewhere. The adapter
is tested against explicit simulated snapshots; no production metrics, uploads,
provider configuration, prices, offers, or storefront publications are changed.

Native/provider commissioning is tracked in [JOV-8276](https://linear.app/jovie/issue/JOV-8276).
Apple evidence collection reuses [JOV-6738](https://linear.app/jovie/issue/JOV-6738)'s
Summer `company-signal/v1` owner in summer-config, rather than adding a collector
here. Its credential and acceptance work remains with that owner. Neither item
is a gate on the currently prioritized Log Your Body beta.
