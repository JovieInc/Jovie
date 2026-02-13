# Linear Issues to Create

Copy each issue into Linear with status **Backlog**. Delete this file after all issues are created.

---

## Features — Backlog

### F-01: ISRC Auto-Generation for releases
**Priority:** Low | **Labels:** `feature`, `releases`

Auto-generate valid, unique ISRC codes during release creation. "Generate ISRC" button per track + batch "Generate All Missing" per release. Gated by ISRC prefix ownership (~$95 one-time registration with national agency), not plan tier.

**Scope:**
- ISRC prefix settings in Dashboard > Settings (country code + registrant code)
- `isrc_registrant_sequences` table with atomic increment for concurrency safety
- Three-layer duplicate protection: unique DB constraint, pre-save validation, background cron scanner
- `isrc_duplicate_flags` table for cross-release duplicate detection
- Duplicate flags surface in AI chat with resolution actions
- Education tooltip linking to USISRC registration

**Not needed yet — future bet.**

---

### F-02: Lyrics auto-format to Apple Music guidelines
**Priority:** Low | **Labels:** `feature`, `ai-chat`

Start as an AI chat skill/tool. The chat agent formats lyrics to Apple Music guidelines on request (sentence case, remove section labels, normalize punctuation, expand "(Repeat Chorus)" shorthand, straighten curly quotes, trim whitespace).

**Scope:**
- Pure formatting function (14 deterministic rules) exposed as a chat tool
- Rules: sentence case, preserve "I", remove [Verse]/[Chorus] labels, collapse blank lines, normalize ellipsis/em-dash/exclamation marks, straighten quotes, normalize ad-libs
- Future: standalone UI button with diff preview

**Not needed yet — future bet. Start as chat skill, promote to UI later.**

---

### F-03: Presale profile takeover with announcement date
**Priority:** Low | **Labels:** `feature`, `releases`, `notifications`

Artists set an announcement date for upcoming releases. On that date: profile transforms to showcase the release, smart link goes live, announcement email sends to subscribers. Default: 2 weeks before release date.

**Scope:**
- New columns on `discog_releases`: `announcement_date`, `announcement_message`, `announcement_email_sent_at`, presale URLs
- `PresaleTakeoverPage` component with countdown timer
- Smart link visibility gating (`not_announced` / `presale` / `released`)
- Announcement + release day email cron jobs
- Dashboard settings for announcement date, custom message, pre-save links

**Deprioritized — other features matter more right now.**

---

### F-04: Full geo/device/platform smart link routing
**Priority:** Medium | **Labels:** `feature`, `smart-links`

Upgrade smart link routing from basic priority fallback to full geo + device + platform detection. Fans clicking a Jovie link get routed to their preferred streaming platform in their region.

**Scope:**
- IP-based country detection (MaxMind GeoLite2 or Cloudflare headers)
- Platform preference detection (User-Agent, referrer, or cookie-based)
- Device-aware routing (mobile deep links vs. desktop web URLs)
- Fallback chain when preferred platform link isn't available
- Country-specific provider URL resolution (existing `providerLinks.country` column)

**Launch-relevant — matters for new artist acquisition.**

---

### F-05: SMS notifications gated behind Growth plan ($99/mo)
**Priority:** Low | **Labels:** `feature`, `notifications`, `billing`

Add SMS as a notification channel. Integrate a provider (Twilio or similar). Gate behind Growth tier ($99/mo plan). UI already supports SMS channel toggle on public profiles.

**Scope:**
- SMS provider integration (Twilio or AWS SNS)
- Plan gating: only Growth ($99/mo) subscribers can enable SMS notifications
- Phone number verification (OTP)
- SMS templates for release notifications, announcements
- Update existing notification channel code (currently stubs SMS as "not implemented")

---

### F-06: Mobile QR viewport overlay (auto-show on desktop)
**Priority:** Low | **Labels:** `feature`, `ux`

QR code component already exists. Add viewport detection to auto-show on desktop after 1.5s idle or scroll >50vh. Dismissible with 7-day localStorage suppression. Reopen via small phone icon. UTM tracking: `?src=qr_desktop`.

---

### F-07: Email campaign creator UI
**Priority:** Low | **Labels:** `feature`, `notifications`

Dashboard UI for creating and sending email campaigns to subscribers. See archived spec in `docs/plans/email-campaign-creator-ui.md` (being removed from codebase).

---

### F-08: AI analytics insights
**Priority:** Low | **Labels:** `feature`, `ai-chat`, `analytics`

AI-powered insights surfaced in chat — geographic growth, tour gaps, subscriber trends, platform preferences. See archived spec in `docs/plans/ai-analytics-insights.md` (being removed from codebase).

---

## Tech Debt — Backlog

### TD-01: Migrate Combobox away from Headless UI
**Priority:** Medium | **Labels:** `tech-debt`, `ui`

`components/organisms/combobox/Combobox.tsx` — Currently uses Headless UI. Migrate to Radix or native implementation to reduce bundle and align with the rest of the component library.

---

### TD-02: Build custom UTM builder modal
**Priority:** Low | **Labels:** `tech-debt`, `releases`

`components/releases/molecules/utm-copy-dropdown.tsx:387` — TODO to open a custom UTM builder modal instead of just copying preset UTM links.

---

### TD-03: Optimize auth E2E test performance
**Priority:** Low | **Labels:** `tech-debt`, `testing`

`scripts/test-performance-guard.ts:59` — Auth tests exceed 120s target. Optimize to reduce CI time.

---

### TD-04: Integrate Clerk testing tokens in E2E
**Priority:** Low | **Labels:** `tech-debt`, `testing`

`tests/e2e/synthetic-golden-path.spec.ts:3` — Use `setupClerkTestingToken` from `@clerk/testing/playwright` for proper auth in E2E tests.

---

### TD-05: Fix tip-promo E2E test mocking
**Priority:** Low | **Labels:** `tech-debt`, `testing`

`tests/e2e/tip-promo.spec.ts:7` — Tests are skipped because they attempt to mock in a way that doesn't work with Playwright. Fix mock strategy.

---

### TD-06: Fix flaky waitlist transaction tests
**Priority:** Low | **Labels:** `tech-debt`, `testing`

`tests/unit/api/waitlist/waitlist.test.ts:226,271` — Transaction mock not properly intercepting DB calls. Fix mock infrastructure.

---

### TD-07: Add mock infrastructure for link/suggestion tests
**Priority:** Low | **Labels:** `tech-debt`, `testing`

`tests/unit/EnhancedDashboardLinks.test.tsx:231` and `tests/unit/GroupedLinksManager.test.tsx:141` — Need mock infrastructure for `useLinksPersistence`, `useSuggestionSync`, `useProfileEditor`, and `useRouter`.

---

### TD-08: Split env module into server/public
**Priority:** High | **Labels:** `tech-debt`, `security`

Per SECURITY_NOTES.md: split `lib/env.ts` into `lib/env-server.ts` (server-only with Stripe/DB vars) and `lib/env-public.ts` (only `NEXT_PUBLIC_*` vars) so no client component ever touches server env.

---

### TD-09: Fix dashboard to onboarding redirect loop
**Priority:** High | **Labels:** `bug`

Investigate and fix logic causing unnecessary redirect back to onboarding from dashboard.

---

### TD-10: Write to audit DB table
**Priority:** Low | **Labels:** `tech-debt`

`lib/audit/ingest.ts:195,198` — When database audit table is available, write audit events to it. Also integrate with external audit service when available.

---

### TD-11: Extend admin activity feed
**Priority:** Low | **Labels:** `tech-debt`, `admin`

`components/admin/ActivityTable.tsx:12` — Extend activity feed with additional admin event data.

---

### TD-12: Integrate performance monitoring with analytics
**Priority:** Low | **Labels:** `tech-debt`, `monitoring`

`app/api/monitoring/performance/route.ts:38` — Connect the performance endpoint to the analytics service.

---

### TD-13: Extend reliability metrics
**Priority:** Low | **Labels:** `tech-debt`, `monitoring`

`components/admin/ReliabilityCard.tsx:5` — Extend reliability metrics beyond current basic implementation.

---

## Admin & Ingestion — Backlog

### A-01: Spotify ingestion strategy (API-based)
**Priority:** Low | **Labels:** `feature`, `ingestion`

API-based Spotify ingestion for higher-confidence artist profile creation. Currently ingestion uses HTTP scraping.

---

### A-02: Instagram bio parsing
**Priority:** Low | **Labels:** `feature`, `ingestion`

HTTP meta parse for Instagram bio links to discover artist social/streaming links.

---

### A-03: Recursive ingestion (depth 3)
**Priority:** Low | **Labels:** `feature`, `ingestion`

Follow discovered profile URLs up to depth 3 during ingestion to build more complete artist profiles.

---

### A-04: Scraper config admin UI
**Priority:** Low | **Labels:** `feature`, `admin`

Admin panel to toggle enabled scrapers, set strategy (HTTP/browser/API), and configure rate limits per network.

---

### A-05: Bulk ingest via CSV upload
**Priority:** Low | **Labels:** `feature`, `admin`

Admin uploads CSV of Linktree/other URLs for bulk profile ingestion.

---

### A-06: Claim invite email with preview
**Priority:** Low | **Labels:** `feature`, `admin`

Send claim invite links to artists via email with a profile preview screenshot.

---

### A-07: Claim token expiration
**Priority:** Low | **Labels:** `feature`, `admin`

Claim tokens expire after N days. Cron job to expire stale tokens.

---

### A-08: Claim funnel analytics
**Priority:** Low | **Labels:** `feature`, `admin`, `analytics`

Track claim funnel: link clicked → auth → claimed. Dashboard view for conversion rates.

---

## Resolved/Archived Audit Findings

These were in docs that are being removed. Create issues only if the finding is still relevant:

### Audit-01: Chat history persistence race conditions
**Priority:** Medium | **Labels:** `bug`, `ai-chat`

From CHAT_HISTORY_AUDIT.md — race conditions in chat message persistence when multiple messages sent rapidly.

---

### Audit-02: Data fetching audit — raw fetch() calls
**Priority:** Low | **Labels:** `tech-debt`

From DATA_FETCHING_AUDIT.md — several endpoints use raw `fetch()` instead of the data fetching layer. Review and migrate.

---

### Audit-03: Test status tracker cleanup
**Priority:** Low | **Labels:** `tech-debt`, `testing`

From tests/e2e/TEST-STATUS.md — test status is being tracked in markdown instead of CI. Move all test status tracking to CI dashboard and Linear.
