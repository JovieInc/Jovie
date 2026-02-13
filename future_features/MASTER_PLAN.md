# Jovie Future Features — Master Plan

Consolidated list of all planned features, tech debt items, and infrastructure work across the codebase. This is the single source of truth for what's coming.

Last updated: 2026-02-13

---

## Feature Inventory

### Tier 1: Revenue & Monetization

| # | Feature | Spec | Status | Dependencies |
|---|---------|------|--------|--------------|
| 1.1 | **Tip Jar** (`/:handle/tip`) | [tip-jar.md](./tip-jar.md) | Spec complete | Stripe PaymentRequest API, notification subscriptions |
| 1.2 | **Growth Tier Pricing** ($99/mo) | In `lib/stripe/config.ts` | Price IDs stubbed, not launched | Stripe product creation |
| 1.3 | **Presale Profile Takeover** | [presale-profile-takeover.md](../docs/features/presale-profile-takeover.md) | Spec complete (6 phases) | Announcement email system, cron jobs |

### Tier 2: Artist Tools & Workflow

| # | Feature | Spec | Status | Dependencies |
|---|---------|------|--------|--------------|
| 2.1 | **ISRC Auto-Generation** | [isrc-generation.md](./isrc-generation.md) | Spec complete | ISRC prefix settings, sequence table, duplicate detection |
| 2.2 | **Lyrics Auto-Format** (Apple Music) | [lyrics-auto-format.md](./lyrics-auto-format.md) | Spec complete | Lyrics storage field (or works with any text input) |
| 2.3 | **Handle Claim Onboarding** | [claim-handle.md](./claim-handle.md) | Spec complete, Statsig gated | Clerk auth, Spotify artist search, `citext` handle column |

### Tier 3: Fan Engagement & Notifications

| # | Feature | Spec | Status | Dependencies |
|---|---------|------|--------|--------------|
| 3.1 | **Universal Artist Notifications** | [universal-artist-notifications.md](./universal-artist-notifications.md) | Spec complete | Email service, contact tables |
| 3.2 | **Tour Dates** (Songkick/Bandsintown) | [tour-dates.md](./tour-dates.md) | Spec complete, DB schema exists | Songkick API key, geo-detection |
| 3.3 | **SMS Notifications** | Referenced in cron code (`// TODO: SMS announcements`) | Not started | Twilio/SMS provider, phone verification |

### Tier 4: Discovery & Growth

| # | Feature | Spec | Status | Dependencies |
|---|---------|------|--------|--------------|
| 4.1 | **View on Mobile QR Overlay** | [view-on-mobile.md](./view-on-mobile.md) | Spec complete | QR code library (lazy-loaded) |
| 4.2 | **Spotify Ingestion Strategy** | In ADMIN_INGEST_AND_CLAIM_SYSTEM.md | Planned | Spotify API OAuth |
| 4.3 | **Instagram Bio Parsing** | In ADMIN_INGEST_AND_CLAIM_SYSTEM.md | Planned | HTTP meta parser |
| 4.4 | **Recursive Ingestion** (depth 3) | In ADMIN_INGEST_AND_CLAIM_SYSTEM.md | Planned | Existing scraper infrastructure |

### Tier 5: Admin & Operations

| # | Feature | Spec | Status | Dependencies |
|---|---------|------|--------|--------------|
| 5.1 | **Scraper Config Admin UI** | In ADMIN_INGEST_AND_CLAIM_SYSTEM.md | Planned | Admin panel |
| 5.2 | **Email Claim Invites** | In ADMIN_INGEST_AND_CLAIM_SYSTEM.md | Planned | Email service |
| 5.3 | **Claim Expiration** (token TTL) | In ADMIN_INGEST_AND_CLAIM_SYSTEM.md | Planned | Cron job |
| 5.4 | **Claim Analytics** (funnel tracking) | In ADMIN_INGEST_AND_CLAIM_SYSTEM.md | Planned | Analytics pipeline |
| 5.5 | **Bulk Ingest CSV** | In ADMIN_INGEST_AND_CLAIM_SYSTEM.md | Future | Admin panel |

### Tier 6: AI & Intelligence

| # | Feature | Spec | Status | Dependencies |
|---|---------|------|--------|--------------|
| 6.1 | **AI Link Classification** | In ADMIN_INGEST_AND_CLAIM_SYSTEM.md | Future | AI chat infrastructure |
| 6.2 | **AI Lyrics Enhancement** (v2 of 2.2) | In lyrics-auto-format.md Phase 3 | Future | AI chat, daily message limits |
| 6.3 | **AI Proper Noun Detection** | In lyrics-auto-format.md Phase 3 | Future | AI chat infrastructure |

### Tier 7: Platform & Infrastructure

| # | Feature | Spec | Status | Dependencies |
|---|---------|------|--------|--------------|
| 7.1 | **Smart Link Routing** (geo/device) | In ADMIN_INGEST_AND_CLAIM_SYSTEM.md | Designed | Geo-detection service |
| 7.2 | **Sensitive Link Protection** | In ADMIN_INGEST_AND_CLAIM_SYSTEM.md | Designed | Social crawler detection |
| 7.3 | **API-based DSP Bio Sync** | In `lib/dsp-enrichment/` comments | Coming soon | DSP OAuth connections |
| 7.4 | **Performance Monitoring Endpoint** | `api/monitoring/performance/route.ts` | Stubbed (TODO) | Analytics service |

---

## Tech Debt Items (from TECH_DEBT_TRACKER.md & codebase TODOs)

| Item | Location | Priority |
|------|----------|----------|
| Custom UTM builder modal | `utm-copy-dropdown.tsx:387` | P3 |
| Optimize auth test performance | `test-performance-guard.ts:59` | P2 |
| Clerk testing token integration | `synthetic-golden-path.spec.ts:3` | P2 |
| `useLinksPersistence` mock infrastructure | `EnhancedDashboardLinks.test.tsx:231` | P3 |
| Tip promo test mocking (FIXME) | `tip-promo.spec.ts:7` | P2 |
| `GroupedLinksManager` mock infrastructure | `GroupedLinksManager.test.tsx:141` | P3 |
| Flaky waitlist transaction test | `waitlist.test.ts:226,271` | P2 |
| Migrate away from Headless UI Combobox | `Combobox.tsx:4` | P2 |
| Extend activity feed with admin events | `ActivityTable.tsx:12` | P3 |
| Write to audit DB table when available | `audit/ingest.ts:195` | P2 |
| External audit service integration | `audit/ingest.ts:198` | P3 |
| Integrate performance with analytics | `performance/route.ts:38` | P2 |
| Extend reliability metrics | `ReliabilityCard.tsx:5` | P3 |
| Dashboard → onboarding redirect loop | `todo_list.md` | P1 |
| Split env into server/public modules | `SECURITY_NOTES.md` | P1 |

---

## Recommended Implementation Order

Ordered by impact, feasibility, and dependency chains:

### Wave 1: Foundation & Quick Wins
These have no cross-dependencies and can be built in parallel:

1. **2.2 Lyrics Auto-Format** — Pure client-side, zero dependencies, immediate artist value
2. **4.1 View on Mobile QR** — Self-contained, improves mobile conversion
3. **2.3 Handle Claim Onboarding** — Already Statsig-gated, unblocks new user funnel

### Wave 2: Revenue Drivers
Build the money-making features:

4. **1.1 Tip Jar** — Direct revenue for artists, needs Stripe PaymentRequest
5. **1.2 Growth Tier Launch** — Price IDs already stubbed, needs product & checkout
6. **3.1 Universal Notifications** — Foundation for 1.3 presale emails

### Wave 3: Release Tools
Deepen the release management workflow:

7. **2.1 ISRC Auto-Generation** — Schema + server actions + settings UI
8. **1.3 Presale Profile Takeover** — Depends on 3.1 notifications being live
9. **3.3 SMS Notifications** — Extends 3.1 to a new channel

### Wave 4: Discovery & Engagement
Features that grow the user base:

10. **3.2 Tour Dates** — DB schema exists, needs API integration
11. **4.2 Spotify Ingestion** — Higher-confidence profile creation
12. **4.3 Instagram Bio Parsing** — Additional discovery channel
13. **4.4 Recursive Ingestion** — Amplifies 4.2 and 4.3

### Wave 5: Admin & AI
Operational improvements and AI enhancements:

14. **5.1-5.5 Admin tools** — Claim invites, expiration, analytics, CSV import
15. **6.1-6.3 AI features** — Link classification, lyrics AI enhancement
16. **7.1-7.4 Infrastructure** — Smart routing, bio sync, monitoring

---

## Feature Detail: ISRC Auto-Generation (2.1)

### What It Does
Auto-generates valid, unique ISRC codes for tracks during release creation. A "Generate ISRC" button appears on each track form for artists who have configured their ISRC registrant prefix in settings.

### Key Design Decisions
- **Gated by real-world prefix ownership**, not Jovie plan tier — the ~$95 registration fee with the national ISRC agency is the gate
- **Atomic DB sequence** for designation numbers prevents race conditions
- **Three layers of duplicate protection**: unique DB constraint, pre-save validation, background cross-release scanner
- **Burned designations** — deleted tracks don't reclaim their ISRC number (industry standard)
- **Duplicate flags surface in AI chat** as issues needing resolution

### Schema Changes
- New table: `isrc_registrant_sequences` (tracks next designation per prefix per year)
- New table: `isrc_duplicate_flags` (tracks detected duplicates and their resolution)
- New JSONB fields in `creator_profiles.settings`: `isrcCountryCode`, `isrcRegistrantCode`

### Full spec: [isrc-generation.md](./isrc-generation.md)

---

## Feature Detail: Lyrics Auto-Format (2.2)

### What It Does
One-click formatting of raw lyrics to Apple Music guidelines. Deterministic rule-based engine (no AI for v1). Shows a diff preview before applying.

### Key Design Decisions
- **Pure function** — no database, no API calls, runs entirely client-side
- **Diff preview** — artists see every change before accepting
- **14 formatting rules** covering capitalization, section labels, whitespace, punctuation, ad-libs, and repeat expansion
- **Chorus expansion** — detects `(Repeat Chorus)` shorthand and replaces with full text
- **No dependencies** — works with any text input field, doesn't require a dedicated lyrics table

### Schema Changes
- None for v1

### Full spec: [lyrics-auto-format.md](./lyrics-auto-format.md)

---

## Cross-Cutting Concerns

### Shared Dependencies

| Dependency | Features That Need It |
|------------|----------------------|
| Email service (Resend/SES) | 1.3, 3.1, 3.3, 5.2 |
| Cron infrastructure | 1.3, 2.1 (duplicate scanner), 3.2, 5.3 |
| Stripe PaymentRequest API | 1.1 |
| Statsig feature flags | 2.3, 3.1, 4.1 |
| AI chat infrastructure | 2.1 (duplicate alerts), 6.1, 6.2, 6.3 |
| Geo-detection | 3.2, 7.1 |
| Spotify API OAuth | 4.2 |

### Feature Flag Registry (Statsig)

| Flag | Feature | Default |
|------|---------|---------|
| `handle_claim_enabled` | 2.3 Handle Claim | Off |
| `feature_universal_notifications` | 3.1 Notifications | Off |
| `feature_tip_jar` | 1.1 Tip Jar | Off |
| `feature_tour_dates` | 3.2 Tour Dates | Off |
| `feature_isrc_generation` | 2.1 ISRC Generation | Off |
| `feature_lyrics_formatter` | 2.2 Lyrics Format | Off |
| `feature_presale_takeover` | 1.3 Presale | Off |
| `feature_mobile_qr` | 4.1 QR Overlay | Off |

---

## Status Legend

| Status | Meaning |
|--------|---------|
| **Spec complete** | Detailed specification written, ready for implementation |
| **Designed** | High-level design documented, needs detailed spec |
| **Planned** | Identified as needed, no detailed design yet |
| **Stubbed** | Code scaffolding exists (routes, env vars, etc.) |
| **Future** | On the roadmap but not yet prioritized |
| **In progress** | Currently being implemented |
| **Launched** | Shipped to production |
