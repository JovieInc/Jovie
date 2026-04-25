# Feature Registry

Generated on April 24, 2026 at 11:41 AM. This registry is derived from current repo truth and rendered from `docs/FEATURE_REGISTRY.data.json`.

## Audit Summary

- Source counts: 158 pages, 269 route handlers, 243 API route handlers, 26 non-API route handlers (17 internal shell action routes), 35 server-action files, 111 exported tables, 70 E2E specs, 1306 test-like files, 25 user-doc pages, 96 dev-doc markdown files.
- Current plan IDs in code are `free`, `trial`, `pro`, and `max`. Table shorthands such as `free+` and `pro+` are human-readable summaries of those plan gates.

## Hardening Backlog

| Capability | Tier | Hardening Rank | Why It Is High Risk | Current Gaps |
|---|---|---:|---|---|
| Auth & Account Management | P0 | 1 | Revenue, identity, or conversion critical; Broad user-facing blast radius | No major gap recorded in this pass |
| Public Profile Page | P0 | 2 | Revenue, identity, or conversion critical; Broad user-facing blast radius | No major gap recorded in this pass |
| Releases & Smart Links | P0 | 3 | Revenue, identity, or conversion critical; Broad user-facing blast radius | No major gap recorded in this pass |
| Billing & Subscription Management | P0 | 4 | Revenue, identity, or conversion critical; Depends on background automation or third-party callbacks | No major gap recorded in this pass |
| Subscribe / Follow Page | P0 | 5 | Revenue, identity, or conversion critical; Broad user-facing blast radius | No major gap recorded in this pass |
| Release Notifications | P0 | 6 | Revenue, identity, or conversion critical; Depends on background automation or third-party callbacks | No major gap recorded in this pass |
| Tips, Earnings & Stripe Connect | P0 | 7 | Revenue, identity, or conversion critical; Depends on background automation or third-party callbacks | No major gap recorded in this pass |
| Webhooks, Crons & Automation | P0 | 8 | Revenue, identity, or conversion critical; Depends on background automation or third-party callbacks | No major gap recorded in this pass |
| Homepage & Marketing Acquisition | P1 | 11 | Broad user-facing blast radius; Behavior changes across flags or plan gates | No major gap recorded in this pass |
| Onboarding & Handle Claiming | P1 | 12 | Broad user-facing blast radius; Behavior changes across flags or plan gates | No major gap recorded in this pass |
| Artist Bio & Social Links | P1 | 13 | Broad user-facing blast radius | No major gap recorded in this pass |
| Tour Dates (Bandsintown) | P1 | 14 | Broad user-facing blast radius | No major gap recorded in this pass |
| Smart Link Routing & Short Links | P1 | 15 | Broad user-facing blast radius; Behavior changes across flags or plan gates | No major gap recorded in this pass |
| Auto Sync & DSP Linking | P1 | 16 | Broad user-facing blast radius; Unit coverage is below 50% | No major gap recorded in this pass |
| Manual Release Creation | P1 | 17 | Broad user-facing blast radius; Behavior changes across flags or plan gates | No mapped unit/integration coverage; Gate exists without an obvious surfaced page, route, or action |
| Pre-save & Countdown Campaigns | P1 | 18 | Depends on background automation or third-party callbacks; Broad user-facing blast radius | No major gap recorded in this pass |
| Promo Downloads | P1 | 19 | Broad user-facing blast radius | No mapped unit/integration coverage |
| Click Tracking & Analytics | P1 | 20 | Broad user-facing blast radius; Behavior changes across flags or plan gates | No major gap recorded in this pass |
| AI-Powered Insights | P1 | 21 | Depends on background automation or third-party callbacks | No major gap recorded in this pass |
| Fan CRM, Contacts & Audience Capture | P1 | 22 | Broad user-facing blast radius; Behavior changes across flags or plan gates | No major gap recorded in this pass |
| Ad Pixels & Retargeting | P1 | 23 | Depends on background automation or third-party callbacks; Behavior changes across flags or plan gates | No major gap recorded in this pass |
| AI Career Assistant, Album Art & Chat | P1 | 24 | Broad user-facing blast radius; Behavior changes across flags or plan gates | No major gap recorded in this pass |
| Release Planning, Tasks & Metadata Submission | P1 | 25 | Depends on background automation or third-party callbacks; Behavior changes across flags or plan gates | No major gap recorded in this pass |
| Waitlist & Access Requests | P2 | 31 | Broad user-facing blast radius | No major gap recorded in this pass |
| Contact Page | P2 | 32 | Broad user-facing blast radius | No major gap recorded in this pass |
| About Page | P2 | 33 | Broad user-facing blast radius | No mapped unit/integration coverage |
| Verified Badge | P2 | 34 | Broad user-facing blast radius; Behavior changes across flags or plan gates | No mapped unit/integration coverage; Gate exists without an obvious surfaced page, route, or action |
| Remove Jovie Branding | P2 | 35 | Behavior changes across flags or plan gates | No mapped unit/integration coverage |
| Use This Sound Pages | P2 | 36 | Broad user-facing blast radius | No mapped unit/integration coverage |
| Shop Links & Storefront Redirects | P2 | 37 | Broad user-facing blast radius | No major gap recorded in this pass |
| Spotify OAuth & Platform Connections | P2 | 37 | Behavior changes across flags or plan gates | No major gap recorded in this pass |
| Playlists & Share Studio | P2 | 38 | Depends on background automation or third-party callbacks; Broad user-facing blast radius | No major gap recorded in this pass |
| Admin Creator Ops & Ingestion | P2 | 39 | Multi-surface capability with meaningful production blast radius | No major gap recorded in this pass |
| Referrals & Affiliate Program | P2 | 39 | Broad user-facing blast radius; No mapped E2E coverage | No major gap recorded in this pass |
| Creator Inbox & Email Campaigns | P2 | 40 | Depends on background automation or third-party callbacks; Behavior changes across flags or plan gates | No major gap recorded in this pass |
| Experiments, A/B Testing & Latent Max Features | P2 | 41 | Behavior changes across flags or plan gates; No mapped E2E coverage | No major gap recorded in this pass |
| Blog & Changelog Publishing | P3 | 46 | Broad user-facing blast radius | No major gap recorded in this pass |
| Legal & Compliance Pages | P3 | 47 | Broad user-facing blast radius | No mapped unit/integration coverage |
| Browser Extension Workflow | P3 | 48 | No mapped E2E coverage | No major gap recorded in this pass |
| Admin Growth, Leads & Campaigns | P3 | 49 | Multi-surface capability with meaningful production blast radius | No major gap recorded in this pass |
| Admin People, Roles & Feedback | P3 | 50 | Multi-surface capability with meaningful production blast radius | No major gap recorded in this pass |
| Investor Portal & Pipeline | P3 | 51 | Unit coverage is below 50% | No major gap recorded in this pass |
| Health Monitoring, HUD & Deploy | P3 | 52 | Multi-surface capability with meaningful production blast radius | No major gap recorded in this pass |
| Demo, UI Gallery & Sandbox | P3 | 53 | Multi-surface capability with meaningful production blast radius | No major gap recorded in this pass |

## Capability Table

| Capability | Tier | Hardening Rank | Status | Access Model | Flag / Gate | Unit Coverage | E2E Coverage | Dev Doc | User Doc | Owner Primitives |
|---|---|---:|---|---|---|---|---|---|---|---|
| Auth & Account Management | P0 | 1 | Shipped | free+ | SPOTIFY_OAUTH | 82.7% | 39 specs (default, demo, dropdown, nightly, noauth, smoke) | `docs/TESTING_STRATEGY.md` | `apps/docs/app/docs/getting-started/page.mdx` | P11 R0 A10 S0 T2 J0 W0 |
| Public Profile Page | P0 | 2 | Shipped | free+ | PROFILE_V2, LATEST_RELEASE_CARD | 85.5% | 9 specs (default, noauth, smoke) | `docs/PRODUCT_CAPABILITIES.md` | `apps/docs/app/docs/features/profile/page.mdx` | P8 R0 A3 S0 T3 J0 W0 |
| Releases & Smart Links | P0 | 3 | Shipped | free+ | canEditSmartLinks, smartLinksLimit | 48.7% | 10 specs (default, demo, noauth, smoke) | `docs/PRODUCT_CAPABILITIES.md` | `apps/docs/app/docs/features/releases/page.mdx` | P4 R0 A7 S1 T10 J0 W0 |
| Billing & Subscription Management | P0 | 4 | Shipped (flagged) | free+ | BILLING_UPGRADE_DIRECT, trial, pro, max | 71.7% | 69 specs (default, demo, dropdown, nightly, noauth, smoke) | `docs/WEBHOOK_MAP.md` | `apps/docs/app/docs/plans-pricing/page.mdx` | P5 R0 A13 S0 T2 J1 W1 |
| Subscribe / Follow Page | P0 | 5 | Shipped (flagged) | free+ | SUBSCRIBE_TWO_STEP, SUBSCRIBE_CTA_EXPERIMENT, experiment_subscribe_cta_variant | 56.5% | 13 specs (default, demo, noauth, smoke) | `docs/STATSIG_FEATURE_GATES.md` | `apps/docs/app/docs/features/profile/page.mdx` | P3 R0 A11 S0 T3 J0 W0 |
| Release Notifications | P0 | 6 | Shipped | pro+ | canSendNotifications | 23.8% | 1 specs (default) | `docs/CRON_REGISTRY.md` | `apps/docs/app/docs/features/releases/page.mdx` | P1 R0 A2 S0 T2 J2 W0 |
| Tips, Earnings & Stripe Connect | P0 | 7 | Shipped (flagged) | pro+ / max | STRIPE_CONNECT_ENABLED, canAccessTipping, canAccessStripeConnect | 66.9% | 10 specs (default, noauth, smoke) | `docs/WEBHOOK_MAP.md` | `apps/docs/app/docs/features/tips/page.mdx` | P5 R0 A10 S0 T2 J0 W2 |
| Webhooks, Crons & Automation | P0 | 8 | Shipped | internal | None | 69.3% | 6 specs (default, smoke) | `docs/WEBHOOK_MAP.md` | N/A | P0 R0 A12 S0 T1 J7 W4 |
| Homepage & Marketing Acquisition | P1 | 11 | Shipped (flagged) | public | SHOW_EXAMPLE_PROFILES_CAROUSEL, SHOW_SEE_IT_IN_ACTION, SHOW_REPLACES_SECTION, SHOW_PHONE_TOUR, SHOW_LOGO_BAR, SHOW_FEATURE_SHOWCASE, SHOW_FINAL_CTA, SHOW_HOMEPAGE_SECTIONS, SHOW_HOMEPAGE_V2_SOCIAL_PROOF, SHOW_HOMEPAGE_V2_TRUST, SHOW_HOMEPAGE_V2_SYSTEM_OVERVIEW, SHOW_HOMEPAGE_V2_SPOTLIGHT, SHOW_HOMEPAGE_V2_CAPTURE_REACTIVATE, SHOW_HOMEPAGE_V2_POWER_GRID, SHOW_HOMEPAGE_V2_PRICING, SHOW_HOMEPAGE_V2_FINAL_CTA, SHOW_HOMEPAGE_V2_FOOTER_LINKS | 62.7% | 6 specs (default, noauth, smoke) | `docs/PRODUCT_CAPABILITIES.md` | `apps/docs/app/docs/page.mdx` | P11 R0 A4 S0 T0 J0 W0 |
| Onboarding & Handle Claiming | P1 | 12 | Shipped (flagged) | free+ | CLAIM_HANDLE, HERO_SPOTIFY_CLAIM_FLOW, SPOTIFY_OAUTH | 62.4% | 11 specs (default, nightly, smoke) | `docs/TESTING_STRATEGY.md` | `apps/docs/app/docs/self-serve-guide/claim-handle/page.mdx` | P3 R2 A6 S7 T4 J0 W0 |
| Artist Bio & Social Links | P1 | 13 | Shipped | free+ | None | 56.9% | 5 specs (default) | `docs/TANSTACK_QUERY_INVENTORY.md` | `apps/docs/app/docs/features/profile/page.mdx` | P4 R0 A3 S3 T4 J0 W0 |
| Tour Dates (Bandsintown) | P1 | 14 | Shipped | free+ | None | 73.2% | 1 specs (default) | `docs/SCHEMA_MAP.md` | `apps/docs/app/docs/features/profile/page.mdx` | P4 R0 A2 S1 T1 J0 W0 |
| Smart Link Routing & Short Links | P1 | 15 | Shipped | free+ | IOS_APPLE_MUSIC_PRIORITY, canAccessUrlEncryption | 47.3% | 4 specs (default, dropdown, smoke) | `docs/API_ROUTE_MAP.md` | `apps/docs/app/docs/features/releases/page.mdx` | P2 R3 A3 S0 T4 J0 W0 |
| Auto Sync & DSP Linking | P1 | 16 | Shipped | free+ | None | 45.9% | 8 specs (default, noauth, smoke) | `docs/SCHEMA_MAP.md` | `apps/docs/app/docs/features/releases/page.mdx` | P1 R0 A19 S1 T6 J0 W0 |
| Manual Release Creation | P1 | 17 | Shipped | free+ | canCreateManualReleases | no tests | 2 specs (default, demo, smoke) | `docs/PRODUCT_CAPABILITIES.md` | `apps/docs/app/docs/features/releases/page.mdx` | P0 R0 A0 S0 T0 J0 W0 |
| Pre-save & Countdown Campaigns | P1 | 18 | Shipped (flagged) | pro+ | SMARTLINK_PRE_SAVE, canAccessFutureReleases, canAccessPreSave | 39.4% | 2 specs (default, smoke) | `docs/STATSIG_FEATURE_GATES.md` | `apps/docs/app/docs/features/releases/page.mdx` | P0 R0 A4 S0 T1 J1 W0 |
| Promo Downloads | P1 | 19 | Shipped | free+ | None | no tests | 1 specs (default) | `docs/API_ROUTE_MAP.md` | `apps/docs/app/docs/features/releases/page.mdx` | P2 R0 A5 S0 T2 J0 W0 |
| Click Tracking & Analytics | P1 | 20 | Shipped | free+ | canAccessAdvancedAnalytics, canFilterSelfFromAnalytics, analyticsRetentionDays | 64.4% | 22 specs (default, demo, noauth, smoke) | `docs/testing/TEST_COVERAGE_ANALYSIS.md` | `apps/docs/app/docs/features/analytics/page.mdx` | P2 R0 A4 S0 T6 J0 W0 |
| AI-Powered Insights | P1 | 21 | Shipped | pro+ | None | 92.4% | 1 specs (default, noauth) | `docs/CRON_REGISTRY.md` | `apps/docs/app/docs/features/analytics/page.mdx` | P1 R0 A5 S0 T2 J1 W0 |
| Fan CRM, Contacts & Audience Capture | P1 | 22 | Shipped (flagged) | free+ / pro+ | SHOW_AUDIENCE_CRM_SECTION, canExportContacts, contactsLimit | 63.2% | 1 specs (default, nightly, smoke) | `docs/testing/TEST_COVERAGE_ANALYSIS.md` | `apps/docs/app/docs/features/audience/page.mdx` | P4 R0 A7 S2 T3 J0 W0 |
| Ad Pixels & Retargeting | P1 | 23 | Shipped | pro+ | canAccessAdPixels | 53.6% | 3 specs (default) | `docs/CRON_REGISTRY.md` | `apps/docs/app/docs/features/analytics/page.mdx` | P2 R0 A7 S0 T2 J2 W0 |
| AI Career Assistant, Album Art & Chat | P1 | 24 | Shipped (flagged) | free+ | ALBUM_ART_GENERATION, THREADS_ENABLED, aiCanUseTools, canGenerateAlbumArt, aiDailyMessageLimit, aiPitchGenPerRelease | 69.5% | 3 specs (default) | `docs/PRODUCT_CAPABILITIES.md` | `apps/docs/app/docs/features/chat-ai/page.mdx` | P3 R0 A11 S0 T3 J0 W0 |
| Release Planning, Tasks & Metadata Submission | P1 | 25 | Shipped (flagged) | pro+ / max | SHOW_RELEASE_TOOLBAR_EXTRAS, canAccessTasksWorkspace, canGenerateReleasePlans, canAccessMetadataSubmissionAgent | 37% | 4 specs (default, demo, smoke) | `docs/SCHEMA_MAP.md` | `apps/docs/app/docs/features/releases/page.mdx` | P2 R0 A7 S3 T13 J2 W0 |
| Waitlist & Access Requests | P2 | 31 | Shipped | public + admin | None | 70.5% | 4 specs (default, nightly, smoke) | `docs/SCHEMA_MAP.md` | `apps/docs/app/docs/plans-pricing/page.mdx` | P2 R4 A3 S0 T3 J0 W0 |
| Contact Page | P2 | 32 | Shipped | free+ | None | 89.5% | 3 specs (default, smoke) | `docs/PRODUCT_CAPABILITIES.md` | `apps/docs/app/docs/features/profile/page.mdx` | P2 R0 A1 S0 T1 J0 W0 |
| About Page | P2 | 33 | Shipped | free+ | None | no tests | 2 specs (default, noauth, smoke) | `docs/PRODUCT_CAPABILITIES.md` | `apps/docs/app/docs/features/profile/page.mdx` | P1 R0 A0 S0 T0 J0 W0 |
| Verified Badge | P2 | 34 | Shipped | pro+ | canBeVerified | no tests | 3 specs (default) | `docs/PRODUCT_CAPABILITIES.md` | `apps/docs/app/docs/features/profile/page.mdx` | P0 R0 A0 S0 T0 J0 W0 |
| Remove Jovie Branding | P2 | 35 | Shipped | max | canAccessWhiteLabel | no tests | 7 specs (default, smoke) | `docs/artist-profile-features.md` | `apps/docs/app/docs/features/profile/page.mdx` | P3 R0 A0 S0 T0 J0 W0 |
| Use This Sound Pages | P2 | 36 | Shipped | free+ | None | no tests | 2 specs (default, smoke) | `docs/PRODUCT_CAPABILITIES.md` | `apps/docs/app/docs/features/releases/page.mdx` | P1 R0 A0 S0 T0 J0 W0 |
| Shop Links & Storefront Redirects | P2 | 37 | Shipped | free+ | None | 59.5% | 1 specs (default, smoke) | `docs/PRODUCT_CAPABILITIES.md` | N/A | P1 R0 A1 S0 T0 J0 W0 |
| Spotify OAuth & Platform Connections | P2 | 37 | In rollout | flagged | SPOTIFY_OAUTH | 55.4% | 4 specs (default, noauth, smoke) | `docs/STATSIG_FEATURE_GATES.md` | `apps/docs/app/docs/self-serve-guide/connect-dsps/page.mdx` | P1 R0 A1 S1 T0 J0 W0 |
| Playlists & Share Studio | P2 | 38 | Shipped (flagged) | mixed | PLAYLIST_ENGINE | 100% | 6 specs (default, demo, dropdown, noauth) | `docs/CRON_REGISTRY.md` | `apps/docs/app/docs/features/releases/page.mdx` | P6 R0 A5 S1 T2 J1 W0 |
| Admin Creator Ops & Ingestion | P2 | 39 | Shipped | admin | None | 74.7% | 4 specs (default, smoke) | `docs/ADMIN_INGEST_AND_CLAIM_SYSTEM.md` | N/A | P3 R13 A13 S1 T3 J0 W0 |
| Referrals & Affiliate Program | P2 | 39 | In rollout | free+ / internal | None | 89.7% | gap | `docs/SCHEMA_MAP.md` | N/A | P0 R0 A3 S0 T3 J0 W0 |
| Creator Inbox & Email Campaigns | P2 | 40 | In rollout | max / internal | canAccessInbox, canAccessFanSubscriptions, canAccessEmailCampaigns | 63.4% | 11 specs (default, demo, noauth, smoke) | `docs/WEBHOOK_MAP.md` | N/A | P0 R0 A4 S0 T10 J1 W1 |
| Experiments, A/B Testing & Latent Max Features | P2 | 41 | Planned | max / flagged | ENABLE_LIGHT_MODE, PWA_INSTALL_BANNER, canAccessApiKeys, canAccessTeamManagement, canAccessWebhooks, canAccessAbTesting | 57.5% | gap | `docs/STATSIG_FEATURE_GATES.md` | `apps/docs/app/docs/plans-pricing/page.mdx` | P0 R1 A0 S0 T0 J0 W0 |
| Blog & Changelog Publishing | P3 | 46 | Shipped | public | None | 69.8% | 2 specs (default, noauth, smoke) | `docs/API_ROUTE_MAP.md` | `apps/docs/app/docs/page.mdx` | P4 R1 A3 S0 T1 J0 W0 |
| Legal & Compliance Pages | P3 | 47 | Shipped | public | None | no tests | 1 specs (default, noauth) | `docs/PRODUCT_CAPABILITIES.md` | `apps/docs/app/docs/page.mdx` | P4 R0 A0 S0 T0 J0 W0 |
| Browser Extension Workflow | P3 | 48 | Shipped | dev-only | None | 67.3% | gap | `docs/chrome-extension-office-hours.md` | N/A | P0 R0 A5 S0 T0 J0 W0 |
| Admin Growth, Leads & Campaigns | P3 | 49 | Shipped | admin | None | 72.3% | 3 specs (default, smoke) | `docs/SCHEMA_MAP.md` | N/A | P8 R0 A18 S0 T6 J0 W0 |
| Admin People, Roles & Feedback | P3 | 50 | Shipped | admin | None | 79.4% | 3 specs (default, smoke) | `docs/testing/TEST_COVERAGE_ANALYSIS.md` | N/A | P9 R0 A6 S0 T3 J0 W0 |
| Investor Portal & Pipeline | P3 | 51 | Shipped | mixed | None | 5.4% | 3 specs (default, smoke) | `docs/SCHEMA_MAP.md` | N/A | P7 R0 A4 S0 T3 J0 W0 |
| Health Monitoring, HUD & Deploy | P3 | 52 | Shipped | dev-only | None | 69.7% | 3 specs (default, smoke) | `docs/TESTING_STRATEGY.md` | N/A | P3 R0 A16 S0 T0 J0 W0 |
| Demo, UI Gallery & Sandbox | P3 | 53 | Shipped | dev-only | None | 71.8% | 13 specs (default, demo, dropdown, smoke) | `docs/testing/TEST_COVERAGE_ANALYSIS.md` | N/A | P22 R0 A5 S0 T0 J0 W0 |

## Drill-down

<details>
<summary><strong>Auth & Account Management</strong> — Shipped — free+</summary>

Clerk-backed sign in, sign up, SSO callback, account settings, and account export/delete flows.

- Tier: P0
- Hardening rank: 1
- Flags: `SPOTIFY_OAUTH`
- Entitlements: none
- Unit coverage: 82.7% across 45 files
- E2E coverage: 39 specs

Pages
- `/signin` — `apps/web/app/(auth)/signin/page.tsx`
- `/signin/sso-callback` — `apps/web/app/(auth)/signin/sso-callback/page.tsx`
- `/signup` — `apps/web/app/(auth)/signup/page.tsx`
- `/signup/sso-callback` — `apps/web/app/(auth)/signup/sso-callback/page.tsx`
- `/signup` — `apps/web/app/@auth/(.)signup/page.tsx`
- `/account` — `apps/web/app/account/page.tsx`
- `/app/settings/account` — `apps/web/app/app/(shell)/settings/account/page.tsx`
- `/app/settings/data-privacy` — `apps/web/app/app/(shell)/settings/data-privacy/page.tsx`
- `/app/settings/delete-account` — `apps/web/app/app/(shell)/settings/delete-account/page.tsx`
- `/error/user-creation-failed` — `apps/web/app/error/user-creation-failed/page.tsx`
- `/sso-callback` — `apps/web/app/sso-callback/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/account/delete` (auth) — `apps/web/app/api/account/delete/route.ts`
- `/api/account/email` (auth) — `apps/web/app/api/account/email/route.ts`
- `/api/account/export` (auth) — `apps/web/app/api/account/export/route.ts`
- `/api/auth/reset` (public) — `apps/web/app/api/auth/reset/route.ts`
- `/api/creator` (public) — `apps/web/app/api/creator/route.ts`
- `/api/dev/clear-session` (public) — `apps/web/app/api/dev/clear-session/route.ts`
- `/api/dev/test-auth/enter` (public) — `apps/web/app/api/dev/test-auth/enter/route.ts`
- `/api/dev/test-auth/session` (public) — `apps/web/app/api/dev/test-auth/session/route.ts`
- `/api/dev/test-user/set-plan` (auth) — `apps/web/app/api/dev/test-user/set-plan/route.ts`
- `/api/mobile/v1/me` (auth) — `apps/web/app/api/mobile/v1/me/route.ts`

Server Actions
- none

Tables
- `users` — `apps/web/lib/db/schema/auth.ts`
- `userSettings` — `apps/web/lib/db/schema/auth.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/app/api/dashboard/audience/source-links/route.test.ts`
- `apps/web/components/features/dashboard/organisms/AnalyticsSidebar.test.tsx`
- `apps/web/lib/__tests__/changelog-parser.test.ts`
- `apps/web/scripts/performance-route-resolvers.test.ts`
- `apps/web/tests/components/BillingDashboard.test.tsx`
- `apps/web/tests/components/admin/DeleteCreatorDialog.test.tsx`
- `apps/web/tests/components/auth/OtpInput.hero.test.tsx`
- `apps/web/tests/components/auth/OtpInput.test.tsx`
- `apps/web/tests/components/auth/SsoCallbackHandler.test.tsx`
- `apps/web/tests/components/dashboard/DashboardNav.interaction.test.tsx`
- `apps/web/tests/components/organisms/MarketingSignInLink.test.tsx`
- `apps/web/tests/components/organisms/MarketingSignInModal.test.tsx`
- `apps/web/tests/components/user-button.test.tsx`
- `apps/web/tests/contracts/dashboard-apis.nightly.test.ts`
- `apps/web/tests/e2e/admin-dashboard.spec.ts`
- `apps/web/tests/e2e/admin-gtm-health.spec.ts`
- `apps/web/tests/e2e/admin-navigation.spec.ts`
- `apps/web/tests/e2e/admin-visual-regression.spec.ts`
- `apps/web/tests/e2e/auth.spec.ts`
- `apps/web/tests/e2e/billing.spec.ts`
- `apps/web/tests/e2e/chaos-authenticated.spec.ts`
- `apps/web/tests/e2e/chat-pitch-generation.spec.ts`
- `apps/web/tests/e2e/content-gate.spec.ts`
- `apps/web/tests/e2e/core-user-journeys.spec.ts`
- `apps/web/tests/e2e/dashboard-pages-health.spec.ts`
- `apps/web/tests/e2e/dashboard.access-control.spec.ts`
- `apps/web/tests/e2e/dashboard.profile-link-card.spec.ts`
- `apps/web/tests/e2e/demo-live-parity.spec.ts`
- `apps/web/tests/e2e/drawer-profile-editing.spec.ts`
- `apps/web/tests/e2e/dropdown-parity.spec.ts`
- `apps/web/tests/e2e/golden-path-app.spec.ts`
- `apps/web/tests/e2e/golden-path.spec.ts`
- `apps/web/tests/e2e/handle-check-api.spec.ts`
- `apps/web/tests/e2e/musicfetch-coverage.spec.ts`
- `apps/web/tests/e2e/nightly/auth-flows.spec.ts`
- `apps/web/tests/e2e/nightly/full-surface-chaos.spec.ts`
- `apps/web/tests/e2e/onboarding-completion.spec.ts`
- `apps/web/tests/e2e/onboarding-flow.spec.ts`
- `apps/web/tests/e2e/onboarding.spec.ts`
- `apps/web/tests/e2e/payment-complete-flow.spec.ts`
- `apps/web/tests/e2e/presence.spec.ts`
- `apps/web/tests/e2e/pro-feature-gates.spec.ts`
- `apps/web/tests/e2e/profile-subscribe-e2e.spec.ts`
- `apps/web/tests/e2e/releases-dashboard.chaos.spec.ts`
- `apps/web/tests/e2e/releases-dashboard.health.spec.ts`
- `apps/web/tests/e2e/releases-dashboard.spec.ts`
- `apps/web/tests/e2e/resilience.spec.ts`
- `apps/web/tests/e2e/signup-funnel.smoke.spec.ts`
- `apps/web/tests/e2e/smoke-auth.spec.ts`
- `apps/web/tests/e2e/smoke-prod-auth.spec.ts`
- `apps/web/tests/e2e/smoke-public.spec.ts`
- `apps/web/tests/e2e/tasks-layout.spec.ts`
- `apps/web/tests/e2e/yc-demo.spec.ts`
- `apps/web/tests/helpers/clerk-auth.test.ts`
- `apps/web/tests/integration/onboarding-completion.test.ts`
- `apps/web/tests/integration/rls-access-control.test.ts`
- `apps/web/tests/lib/admin/impersonation.test.ts`
- `apps/web/tests/lib/admin/sentry-metrics.test.ts`
- `apps/web/tests/lib/anti-cloaking.test.ts`
- `apps/web/tests/lib/claim/claim-flow.test.ts`
- `apps/web/tests/lib/deep-links.test.ts`
- `apps/web/tests/lib/errors/onboarding-errors.test.ts`
- `apps/web/tests/lib/notifications/preferences.test.ts`
- `apps/web/tests/lib/queries/useBillingStatusQuery.test.tsx`
- `apps/web/tests/lib/rls-policies.test.ts`
- `apps/web/tests/lib/stripe/billing-hardening.test.ts`
- `apps/web/tests/scripts/performance-route-resolvers.test.ts`
- `apps/web/tests/unit/LoadingSpinner.test.tsx`
- `apps/web/tests/unit/actions/admin-actions.test.ts`
- `apps/web/tests/unit/actions/contacts-actions.test.ts`
- `apps/web/tests/unit/actions/creator-profile-actions.test.ts`
- `apps/web/tests/unit/actions/onboarding/complete-onboarding.test.ts`
- `apps/web/tests/unit/actions/onboarding/profile-setup.test.ts`
- `apps/web/tests/unit/actions/onboarding/validation.test.ts`
- `apps/web/tests/unit/actions/releases-actions.create.nightly.test.ts`
- `apps/web/tests/unit/actions/releases-actions.publish.nightly.test.ts`
- `apps/web/tests/unit/actions/releases-actions.update.nightly.test.ts`
- `apps/web/tests/unit/actions/tour-dates-actions.test.ts`
- `apps/web/tests/unit/admin/AdminConversionFunnelSection.test.tsx`
- `apps/web/tests/unit/admin/conversion-funnel.test.ts`
- `apps/web/tests/unit/api/account/delete-route.test.ts`
- `apps/web/tests/unit/api/account/email.test.ts`
- `apps/web/tests/unit/api/admin/creator-avatar.test.ts`
- `apps/web/tests/unit/api/admin/roles.test.ts`
- `apps/web/tests/unit/api/admin/test-user-set-plan.test.ts`
- `apps/web/tests/unit/api/admin/waitlist-approve.test.ts`
- `apps/web/tests/unit/api/apple-music/search.test.ts`
- `apps/web/tests/unit/api/artist/theme.test.ts`
- `apps/web/tests/unit/api/auth/reset.test.ts`
- `apps/web/tests/unit/api/billing/health.test.ts`
- `apps/web/tests/unit/api/billing/status.test.ts`
- `apps/web/tests/unit/api/chat/conversation-message-routes.test.ts`
- `apps/web/tests/unit/api/chat/conversations.test.ts`
- `apps/web/tests/unit/api/clerk/webhook.test.ts`
- `apps/web/tests/unit/api/creator/creator.test.ts`
- `apps/web/tests/unit/api/cron/billing-reconciliation.test.ts`
- `apps/web/tests/unit/api/cron/send-release-notifications.test.ts`
- `apps/web/tests/unit/api/dashboard/analytics.test.ts`
- `apps/web/tests/unit/api/dashboard/contacts.test.ts`
- `apps/web/tests/unit/api/dashboard/earnings.test.ts`
- `apps/web/tests/unit/api/dashboard/press-photos.test.ts`
- `apps/web/tests/unit/api/dashboard/profile/clerk-sync.test.ts`
- `apps/web/tests/unit/api/dashboard/profile/route-rollback.test.ts`
- `apps/web/tests/unit/api/dashboard/shop.test.ts`
- `apps/web/tests/unit/api/dashboard/social-links-verify.test.ts`
- `apps/web/tests/unit/api/dev/clear-session.test.ts`
- `apps/web/tests/unit/api/dev/test-auth-routes.test.ts`
- `apps/web/tests/unit/api/extension/action-log-route.test.ts`
- `apps/web/tests/unit/api/extension/fill-preview-route.test.ts`
- `apps/web/tests/unit/api/extension/session-status-route.test.ts`
- `apps/web/tests/unit/api/feedback/route.test.ts`
- `apps/web/tests/unit/api/health/auth.critical.test.ts`
- `apps/web/tests/unit/api/hud-metrics-route.test.ts`
- `apps/web/tests/unit/api/images/press-photos-delete.test.ts`
- `apps/web/tests/unit/api/images/status.test.ts`
- `apps/web/tests/unit/api/images/upload.test.ts`
- `apps/web/tests/unit/api/insights/generate.test.ts`
- `apps/web/tests/unit/api/insights/insight-update.test.ts`
- `apps/web/tests/unit/api/insights/route.test.ts`
- `apps/web/tests/unit/api/insights/summary.test.ts`
- `apps/web/tests/unit/api/metadata-submissions-approve-send.test.ts`
- `apps/web/tests/unit/api/metadata-submissions-prepare.test.ts`
- `apps/web/tests/unit/api/metadata-submissions-status.test.ts`
- `apps/web/tests/unit/api/mobile/v1/me.test.ts`
- `apps/web/tests/unit/api/onboarding/discovery.test.ts`
- `apps/web/tests/unit/api/onboarding/distribution-event.test.ts`
- `apps/web/tests/unit/api/onboarding/welcome-chat.test.ts`
- `apps/web/tests/unit/api/pre-save/apple.test.ts`
- `apps/web/tests/unit/api/spotify/fal-analysis.test.ts`
- `apps/web/tests/unit/api/stripe/checkout.test.ts`
- `apps/web/tests/unit/api/stripe/plan-change.test.ts`
- `apps/web/tests/unit/api/stripe/portal.test.ts`
- `apps/web/tests/unit/api/tour-date-analytics-route.test.ts`
- `apps/web/tests/unit/api/verification/request.test.ts`
- `apps/web/tests/unit/api/waitlist/waitlist.test.ts`
- `apps/web/tests/unit/api/wrap-link/wrap-link.test.ts`
- `apps/web/tests/unit/app/[username]/claim/route.test.ts`
- `apps/web/tests/unit/app/admin-platform-connections-client.test.tsx`
- `apps/web/tests/unit/app/auth-layout.test.tsx`
- `apps/web/tests/unit/app/dashboard-earnings-page.test.tsx`
- `apps/web/tests/unit/app/dashboard-metadata.test.ts`
- `apps/web/tests/unit/app/dashboard-tasks-page.test.tsx`
- `apps/web/tests/unit/app/onboarding/actions/avatar.test.ts`
- `apps/web/tests/unit/app/onboarding/actions/connect-spotify.test.ts`
- `apps/web/tests/unit/app/onboarding/actions/index.test.ts`
- `apps/web/tests/unit/app/onboarding-page.test.tsx`
- `apps/web/tests/unit/app/release-tasks-page.test.tsx`
- `apps/web/tests/unit/app/settings-page.test.tsx`
- `apps/web/tests/unit/app/signin-page.test.tsx`
- `apps/web/tests/unit/app/signup-metadata.test.ts`
- `apps/web/tests/unit/app/signup-page.test.tsx`
- `apps/web/tests/unit/app/surface-elevation-guardrails.test.ts`
- `apps/web/tests/unit/auth/AuthModalShell.test.tsx`
- `apps/web/tests/unit/auth/profile-completeness.test.ts`
- `apps/web/tests/unit/auth/waitlist-gating.test.ts`
- `apps/web/tests/unit/chat/ChatUsageAlert.test.tsx`
- `apps/web/tests/unit/chat/JovieChat.empty-state.test.tsx`
- `apps/web/tests/unit/chat/SuggestedPrompts.test.tsx`
- `apps/web/tests/unit/chat/greeting.test.ts`
- `apps/web/tests/unit/components/admin/AdminUsersTableUnified.test.tsx`
- `apps/web/tests/unit/components/admin/admin-user-actions.test.ts`
- `apps/web/tests/unit/components/admin/csv-export.button.test.tsx`
- `apps/web/tests/unit/components/admin/csv-export.config.test.tsx`
- `apps/web/tests/unit/components/admin/csv-export.hook.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardNav.test.tsx`
- `apps/web/tests/unit/dashboard/ReleaseProviderMatrix.test.tsx`
- `apps/web/tests/unit/dashboard/dashboard-data-prefetch.test.ts`
- `apps/web/tests/unit/dashboard/presence-actions.test.ts`
- `apps/web/tests/unit/dashboard/profile-selection-activeProfileId.test.ts`
- `apps/web/tests/unit/extensions/summary.test.ts`
- `apps/web/tests/unit/home/AuthRedirectHandler.test.tsx`
- `apps/web/tests/unit/lib/admin/platform-connections.test.ts`
- `apps/web/tests/unit/lib/auth/build-app-shell-signin-url.test.ts`
- `apps/web/tests/unit/lib/auth/build-auth-route-url.test.ts`
- `apps/web/tests/unit/lib/auth/cached.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-errors.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-identity.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-middleware-bypass.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-sync.critical.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-sync.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-webhook-handlers.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-webhook-registry.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-webhook-types.test.ts`
- `apps/web/tests/unit/lib/auth/constants.test.ts`
- `apps/web/tests/unit/lib/auth/dev-test-auth.server.regression-1.test.ts`
- `apps/web/tests/unit/lib/auth/dev-test-auth.server.test.ts`
- `apps/web/tests/unit/lib/auth/gate.critical.test.ts`
- `apps/web/tests/unit/lib/auth/gate.test.ts`
- `apps/web/tests/unit/lib/auth/plan-intent.test.ts`
- `apps/web/tests/unit/lib/auth/proxy-state.test.ts`
- `apps/web/tests/unit/lib/auth/require-auth.test.ts`
- `apps/web/tests/unit/lib/auth/session.critical.test.ts`
- `apps/web/tests/unit/lib/auth/staging-clerk-keys.test.ts`
- `apps/web/tests/unit/lib/auth/test-mode.test.ts`
- `apps/web/tests/unit/lib/billing/batch-processor.test.ts`
- `apps/web/tests/unit/lib/billing/orphaned-subscription-handler.test.ts`
- `apps/web/tests/unit/lib/chat/submit-feedback.test.ts`
- `apps/web/tests/unit/lib/contact-limit-entitlements.test.ts`
- `apps/web/tests/unit/lib/db/queries/shared.test.ts`
- `apps/web/tests/unit/lib/entitlements-billing-negative.test.ts`
- `apps/web/tests/unit/lib/entitlements-concurrency-isolation.test.ts`
- `apps/web/tests/unit/lib/entitlements-state-transitions.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/fetch/deduped-fetch.test.ts`
- `apps/web/tests/unit/lib/ingestion/session.test.ts`
- `apps/web/tests/unit/lib/notifications/domain.test.ts`
- `apps/web/tests/unit/lib/queries/useAccountMutations.test.tsx`
- `apps/web/tests/unit/lib/rate-limit/plan-aware-limiter.test.ts`
- `apps/web/tests/unit/lib/referrals/service.critical.test.ts`
- `apps/web/tests/unit/lib/sentry/route-detector.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.misc.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.routes.test.ts`
- `apps/web/tests/unit/lib/sentry/set-user-context.test.ts`
- `apps/web/tests/unit/lib/spotify/jovie-account.test.ts`
- `apps/web/tests/unit/lib/stripe/client.cache.test.ts`
- `apps/web/tests/unit/lib/stripe/customer-sync.auth.test.ts`
- `apps/web/tests/unit/lib/stripe/customer-sync.errors.test.ts`
- `apps/web/tests/unit/lib/stripe/customer-sync.fallback.test.ts`
- `apps/web/tests/unit/lib/stripe/customer-sync.misc.test.ts`
- `apps/web/tests/unit/lib/stripe/customer-sync.queries.test.ts`
- `apps/web/tests/unit/lib/stripe/dunning.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/utils.test.ts`
- `apps/web/tests/unit/lib/testing/test-user-provision.server.test.ts`
- `apps/web/tests/unit/lib/tracking/fire-subscribe-event.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/index.test.ts`
- `apps/web/tests/unit/lib/username/sync.test.ts`
- `apps/web/tests/unit/lib/username-sync.test.ts`
- `apps/web/tests/unit/lib/waitlist/approval.test.ts`
- `apps/web/tests/unit/middleware/proxy-behavioral.test.ts`
- `apps/web/tests/unit/middleware/proxy-composition.critical.test.ts`
- `apps/web/tests/unit/onboarding/checkout-page.test.ts`
- `apps/web/tests/unit/onboarding/onboarding-checkout.test.tsx`
- `apps/web/tests/unit/onboarding-step-navigation.test.ts`
- `apps/web/tests/unit/organisms/release-credits-action.test.ts`
- `apps/web/tests/unit/profile/ProfileInlineNotificationsCTA.test.tsx`
- `apps/web/tests/unit/profile/inline-notifications-cta.test.tsx`
- `apps/web/tests/unit/profile/notifications-otp-step.test.tsx`
- `apps/web/tests/unit/profile/otp-input-comprehensive.test.tsx`
- `apps/web/tests/unit/profile/profile-components.test.tsx`
- `apps/web/tests/unit/profile/profile-layout-shift.test.tsx`
- `apps/web/tests/unit/profile/subscription-form-states.test.tsx`
- `apps/web/tests/unit/profile/subscription-sms-flow.test.tsx`
- `apps/web/tests/unit/release/release-landing-page.test.tsx`
- `apps/web/tests/unit/routes/route-coverage.test.ts`
- `apps/web/tests/unit/routes/shell-nav-coverage.test.ts`
- `apps/web/tests/unit/settings/SettingsBillingSection.test.tsx`
- `apps/web/tests/unit/signup-claim-storage.test.ts`
- `apps/web/tests/unit/use-clerk-safe.test.tsx`
- `apps/web/tests/unit/validation/tip.test.ts`

Dev Docs
- `docs/TESTING_STRATEGY.md`
- `docs/testing-clerk.md`

User Docs
- `apps/docs/app/docs/getting-started/page.mdx`
- `apps/docs/app/docs/plans-pricing/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Public Profile Page</strong> — Shipped — free+</summary>

The main public artist page and linked listening surfaces that fans see first.

- Tier: P0
- Hardening rank: 2
- Flags: `PROFILE_V2`, `LATEST_RELEASE_CARD`
- Entitlements: none
- Unit coverage: 85.5% across 4 files
- E2E coverage: 9 specs

Pages
- `/artist-profile` — `apps/web/app/(marketing)/artist-profile/page.tsx`
- `/artist-profiles` — `apps/web/app/(marketing)/artist-profiles/page.tsx`
- `/blog/authors/[username]` — `apps/web/app/(marketing)/blog/authors/[username]/page.tsx`
- `/[username]/[...slug]` — `apps/web/app/[username]/[...slug]/page.tsx`
- `/[username]/listen` — `apps/web/app/[username]/listen/page.tsx`
- `/[username]` — `apps/web/app/[username]/page.tsx`
- `/[username]/releases` — `apps/web/app/[username]/releases/page.tsx`
- `/artists` — `apps/web/app/artists/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/artist/theme` (auth) — `apps/web/app/api/artist/theme/route.ts`
- `/api/celebration-card/[username]` (public) — `apps/web/app/api/celebration-card/[username]/route.tsx`
- `/api/profile/view` (public) — `apps/web/app/api/profile/view/route.ts`

Server Actions
- none

Tables
- `creatorProfileAttributes` — `apps/web/lib/db/schema/profiles.ts`
- `creatorProfiles` — `apps/web/lib/db/schema/profiles.ts`
- `profilePhotos` — `apps/web/lib/db/schema/profiles.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/app/api/spotify/search/__tests__/helpers.test.ts`
- `apps/web/lib/admin/reliability.test.ts`
- `apps/web/tests/app/sitemap.test.ts`
- `apps/web/tests/components/admin/CreatorProfileTableRow.test.tsx`
- `apps/web/tests/components/dashboard/organisms/onboarding-v2-performance.test.tsx`
- `apps/web/tests/components/profile/ClaimBanner.test.tsx`
- `apps/web/tests/e2e/anti-cloaking.spec.ts`
- `apps/web/tests/e2e/artist-profiles.spec.ts`
- `apps/web/tests/e2e/profile-cls-audit.spec.ts`
- `apps/web/tests/e2e/profile-performance.spec.ts`
- `apps/web/tests/e2e/profile-visual-audit.spec.ts`
- `apps/web/tests/e2e/profile.spec.ts`
- `apps/web/tests/e2e/public-profile-smoke.spec.ts`
- `apps/web/tests/e2e/tasks-layout.spec.ts`
- `apps/web/tests/e2e/tim-white-profile-showcase.spec.ts`
- `apps/web/tests/integration/admin-ingestion.test.ts`
- `apps/web/tests/integration/onboarding-completion.test.ts`
- `apps/web/tests/integration/rls-access-control.test.ts`
- `apps/web/tests/lib/anti-cloaking.test.ts`
- `apps/web/tests/lib/dsp-enrichment/musicfetch-enrichment.test.ts`
- `apps/web/tests/lib/ingestion/linktree-real-ingestion.test.ts`
- `apps/web/tests/lib/ingestion/profile.test.ts`
- `apps/web/tests/lib/ingestion/status-manager.test.ts`
- `apps/web/tests/lib/notifications/preferences.test.ts`
- `apps/web/tests/lib/utils/bot-detection.test.ts`
- `apps/web/tests/unit/EnhancedDashboardLinks.test.tsx`
- `apps/web/tests/unit/actions/admin-actions.test.ts`
- `apps/web/tests/unit/actions/contacts-actions.test.ts`
- `apps/web/tests/unit/actions/creator-profile-actions.test.ts`
- `apps/web/tests/unit/actions/onboarding/profile-setup.test.ts`
- `apps/web/tests/unit/actions/onboarding/validation.test.ts`
- `apps/web/tests/unit/actions/releases-actions.create.nightly.test.ts`
- `apps/web/tests/unit/actions/releases-actions.publish.nightly.test.ts`
- `apps/web/tests/unit/actions/releases-actions.update.nightly.test.ts`
- `apps/web/tests/unit/actions/tour-dates-actions.test.ts`
- `apps/web/tests/unit/api/account/delete-route.test.ts`
- `apps/web/tests/unit/api/admin/creator-invite-bulk.test.ts`
- `apps/web/tests/unit/api/admin/waitlist-approve.test.ts`
- `apps/web/tests/unit/api/artist/theme.test.ts`
- `apps/web/tests/unit/api/audience/click.test.ts`
- `apps/web/tests/unit/api/audience/visit.test.ts`
- `apps/web/tests/unit/api/calendar-ics-route.test.ts`
- `apps/web/tests/unit/api/chat/confirm-edit.test.ts`
- `apps/web/tests/unit/api/cron/cleanup-photos.test.ts`
- `apps/web/tests/unit/api/cron/send-release-notifications.test.ts`
- `apps/web/tests/unit/api/dashboard/contacts.test.ts`
- `apps/web/tests/unit/api/dashboard/earnings.test.ts`
- `apps/web/tests/unit/api/dashboard/press-photos.test.ts`
- `apps/web/tests/unit/api/dashboard/profile/db-operations.test.ts`
- `apps/web/tests/unit/api/dashboard/shop.test.ts`
- `apps/web/tests/unit/api/featured-creators/featured-creators.test.ts`
- `apps/web/tests/unit/api/handle/check.test.ts`
- `apps/web/tests/unit/api/health/auth.critical.test.ts`
- `apps/web/tests/unit/api/images/press-photos-delete.test.ts`
- `apps/web/tests/unit/api/images/status.test.ts`
- `apps/web/tests/unit/api/images/upload.test.ts`
- `apps/web/tests/unit/api/tip/create-tip-intent.test.ts`
- `apps/web/tests/unit/api/track/route.test.ts`
- `apps/web/tests/unit/api/verification/request.test.ts`
- `apps/web/tests/unit/api/waitlist/waitlist.test.ts`
- `apps/web/tests/unit/api/webhooks/resend-inbound.test.ts`
- `apps/web/tests/unit/api/webhooks/stripe-connect.test.ts`
- `apps/web/tests/unit/api/webhooks/stripe-tips.test.ts`
- `apps/web/tests/unit/app/ProfileCompletionRedirect.test.tsx`
- `apps/web/tests/unit/app/artist-profiles-page.test.tsx`
- `apps/web/tests/unit/app/onboarding/actions/avatar.test.ts`
- `apps/web/tests/unit/app/onboarding/actions/connect-spotify.test.ts`
- `apps/web/tests/unit/app/onboarding-page.test.tsx`
- `apps/web/tests/unit/artists-page-config.test.ts`
- `apps/web/tests/unit/auth/waitlist-gating.test.ts`
- `apps/web/tests/unit/chat/ChatPageClient.test.tsx`
- `apps/web/tests/unit/chat/ProfilePageChat.test.tsx`
- `apps/web/tests/unit/chat/confirm-edit-route.test.ts`
- `apps/web/tests/unit/components/profile/useProfileNotificationsController.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardDataContext.test.tsx`
- `apps/web/tests/unit/dashboard/HeaderProfileProgress.test.tsx`
- `apps/web/tests/unit/dashboard/ProfileCompletionCard.test.tsx`
- `apps/web/tests/unit/dashboard/RecentChats.test.tsx`
- `apps/web/tests/unit/dashboard/SmartActionCards.test.tsx`
- `apps/web/tests/unit/dashboard/dashboard-data-prefetch.test.ts`
- `apps/web/tests/unit/dashboard/presence-actions.test.ts`
- `apps/web/tests/unit/dashboard/task-gating-actions.test.ts`
- `apps/web/tests/unit/demo/demo-releases-experience.test.tsx`
- `apps/web/tests/unit/home/homepage-featured-selection.test.ts`
- `apps/web/tests/unit/inbox/inbox-utils.test.ts`
- `apps/web/tests/unit/inbox/webhook-handler.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-sync.critical.test.ts`
- `apps/web/tests/unit/lib/auth/gate.critical.test.ts`
- `apps/web/tests/unit/lib/auth/gate.test.ts`
- `apps/web/tests/unit/lib/auth/proxy-state.test.ts`
- `apps/web/tests/unit/lib/auth/session.critical.test.ts`
- `apps/web/tests/unit/lib/discography/sync-profile-genres.test.ts`
- `apps/web/tests/unit/lib/email/campaigns/processor.test.ts`
- `apps/web/tests/unit/lib/fit-scoring/service.test.ts`
- `apps/web/tests/unit/lib/ingestion/profile-enrichment.test.ts`
- `apps/web/tests/unit/lib/notifications/domain.test.ts`
- `apps/web/tests/unit/lib/services/insights/data-aggregator.test.ts`
- `apps/web/tests/unit/lib/tracking/fire-subscribe-event.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/index.test.ts`
- `apps/web/tests/unit/organisms/release-credits-action.test.ts`
- `apps/web/tests/unit/profile/PublicProfileTemplateV2.history.test.tsx`
- `apps/web/tests/unit/profile/bot-detection.test.ts`
- `apps/web/tests/unit/profile/featured-playlist-fallback.test.ts`
- `apps/web/tests/unit/profile/profile-view-api.test.ts`
- `apps/web/tests/unit/profile/public-profile-page.test.ts`
- `apps/web/tests/unit/routes/route-coverage.test.ts`

Dev Docs
- `docs/PRODUCT_CAPABILITIES.md`
- `docs/artist-profile-features.md`

User Docs
- `apps/docs/app/docs/features/profile/page.mdx`
- `apps/docs/app/docs/self-serve-guide/set-up-profile/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Releases & Smart Links</strong> — Shipped — free+</summary>

Release dashboard, public release pages, and smart-link listening surfaces for every DSP.

- Tier: P0
- Hardening rank: 3
- Flags: none
- Entitlements: `canEditSmartLinks`, `smartLinksLimit`
- Unit coverage: 48.7% across 61 files
- E2E coverage: 10 specs

Pages
- `/[username]/[slug]/[trackSlug]` — `apps/web/app/[username]/[slug]/[trackSlug]/page.tsx`
- `/[username]/[slug]` — `apps/web/app/[username]/[slug]/page.tsx`
- `/app/dashboard/links` — `apps/web/app/app/(shell)/dashboard/links/page.tsx`
- `/app/dashboard/releases` — `apps/web/app/app/(shell)/dashboard/releases/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/apple-music/search` (auth) — `apps/web/app/api/apple-music/search/route.ts`
- `/api/dashboard/releases/[releaseId]/analytics` (public) — `apps/web/app/api/dashboard/releases/[releaseId]/analytics/route.ts`
- `/api/dashboard/releases/[releaseId]/pitch` (public) — `apps/web/app/api/dashboard/releases/[releaseId]/pitch/route.ts`
- `/api/dashboard/releases/[releaseId]/tracks` (public) — `apps/web/app/api/dashboard/releases/[releaseId]/tracks/route.ts`
- `/api/link/[id]` (public) — `apps/web/app/api/link/[id]/route.ts`
- `/api/preview-url/refresh` (public) — `apps/web/app/api/preview-url/refresh/route.ts`
- `/api/spotify/search` (auth) — `apps/web/app/api/spotify/search/route.ts`

Server Actions
- `apps/web/app/app/(shell)/dashboard/releases/actions.ts`

Tables
- `artists` — `apps/web/lib/db/schema/content.ts`
- `discogRecordings` — `apps/web/lib/db/schema/content.ts`
- `discogReleases` — `apps/web/lib/db/schema/content.ts`
- `discogReleaseTracks` — `apps/web/lib/db/schema/content.ts`
- `discogTracks` — `apps/web/lib/db/schema/content.ts`
- `providerLinks` — `apps/web/lib/db/schema/content.ts`
- `recordingArtists` — `apps/web/lib/db/schema/content.ts`
- `releaseArtists` — `apps/web/lib/db/schema/content.ts`
- `smartLinkTargets` — `apps/web/lib/db/schema/content.ts`
- `trackArtists` — `apps/web/lib/db/schema/content.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/app/api/spotify/search/__tests__/helpers.test.ts`
- `apps/web/lib/discography/audio-qa.test.ts`
- `apps/web/lib/discography/preferred-dsp.test.ts`
- `apps/web/lib/dsp-enrichment/jobs/__tests__/catalog-scan.test.ts`
- `apps/web/lib/spotify/__tests__/blacklist.test.ts`
- `apps/web/lib/spotify/scoring.test.ts`
- `apps/web/tests/app/sitemap.test.ts`
- `apps/web/tests/components/dashboard/UniversalLinkInput.a11y.test.tsx`
- `apps/web/tests/components/dashboard/UniversalLinkInput.voice-recording.test.tsx`
- `apps/web/tests/components/dashboard/organisms/onboarding-complete-step.test.tsx`
- `apps/web/tests/components/dashboard/organisms/onboarding-v2-performance.test.tsx`
- `apps/web/tests/components/dashboard/organisms/releases/cells/ProviderCell.interaction.test.tsx`
- `apps/web/tests/components/organisms/PersistentAudioBar.test.tsx`
- `apps/web/tests/components/organisms/artist-search-palette/ArtistSearchCommandPalette.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseArtwork.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseDspLinks.interaction.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseLyricsSection.autosave.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseMetadata.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebar-links.interaction.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebarHeader.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebarLinks.interaction.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseTrackList.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/TrackDetailPanel.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/TrackSidebar.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/useTrackAudioPlayer.test.ts`
- `apps/web/tests/components/release-provider-matrix/AddReleaseSidebar.test.tsx`
- `apps/web/tests/components/release-provider-matrix/MobileReleaseList.test.tsx`
- `apps/web/tests/components/release-provider-matrix/ReleaseFilterDropdown.test.tsx`
- `apps/web/tests/components/release-provider-matrix/ReleaseTable.test.tsx`
- `apps/web/tests/components/release-provider-matrix/ReleaseTableSubheader.test.tsx`
- `apps/web/tests/components/release-provider-matrix/ReleasesEmptyState.test.tsx`
- `apps/web/tests/components/release-provider-matrix/SmartLinkGateBanner.test.tsx`
- `apps/web/tests/components/release-provider-matrix/TrackRow.test.tsx`
- `apps/web/tests/components/release-provider-matrix/column-renderers.test.tsx`
- `apps/web/tests/components/releases/ReleaseCell.test.tsx`
- `apps/web/tests/components/releases/ReleaseEditDialog.test.tsx`
- `apps/web/tests/components/releases/release-actions.test.tsx`
- `apps/web/tests/e2e/artist-notifications.spec.ts`
- `apps/web/tests/e2e/golden-path.spec.ts`
- `apps/web/tests/e2e/homepage.spec.ts`
- `apps/web/tests/e2e/legal.spec.ts`
- `apps/web/tests/e2e/musicfetch-coverage.spec.ts`
- `apps/web/tests/e2e/releases-dashboard.chaos.spec.ts`
- `apps/web/tests/e2e/releases-dashboard.health.spec.ts`
- `apps/web/tests/e2e/releases-dashboard.spec.ts`
- `apps/web/tests/e2e/smartlink-experience.spec.ts`
- `apps/web/tests/e2e/yc-demo.spec.ts`
- `apps/web/tests/lib/deezer-preview.test.ts`
- `apps/web/tests/lib/discography/discovery.test.ts`
- `apps/web/tests/lib/discography/provider-links-deezer.test.ts`
- `apps/web/tests/lib/discography/provider-links-musicfetch.test.ts`
- `apps/web/tests/lib/discography/release-filter-counts.test.ts`
- `apps/web/tests/lib/discography/release-search-filter.test.ts`
- `apps/web/tests/lib/discography/view-models.test.ts`
- `apps/web/tests/lib/dsp-enrichment/apple-music.test.ts`
- `apps/web/tests/lib/dsp-enrichment/extract-all-musicfetch-services.test.ts`
- `apps/web/tests/lib/dsp-enrichment/matching.test.ts`
- `apps/web/tests/lib/dsp-enrichment/musicfetch-enrichment.test.ts`
- `apps/web/tests/lib/dsp-enrichment/musicfetch-mapping.test.ts`
- `apps/web/tests/lib/dsp-enrichment/release-enrichment.test.ts`
- `apps/web/tests/lib/hooks/useAppleMusicArtistSearch.test.tsx`
- `apps/web/tests/lib/hooks/useArtistSearch.test.tsx`
- `apps/web/tests/lib/identity/publish.test.ts`
- `apps/web/tests/lib/ingestion/linktree-real-ingestion.test.ts`
- `apps/web/tests/lib/leads/route-lead.test.ts`
- `apps/web/tests/lib/musicfetch-circuit-breaker.test.ts`
- `apps/web/tests/lib/musicfetch.test.ts`
- `apps/web/tests/lib/notifications/suppression.test.ts`
- `apps/web/tests/lib/provider-links.test.ts`
- `apps/web/tests/lib/queries/gc-time-coverage.test.ts`
- `apps/web/tests/lib/queries/useReleaseTracksQuery.test.tsx`
- `apps/web/tests/performance/onboarding-performance.spec.ts`
- `apps/web/tests/unit/FeaturedCreators.test.tsx`
- `apps/web/tests/unit/TestimonialsSection.test.tsx`
- `apps/web/tests/unit/actions/releases-actions.create.nightly.test.ts`
- `apps/web/tests/unit/actions/releases-actions.publish.nightly.test.ts`
- `apps/web/tests/unit/actions/releases-actions.update.nightly.test.ts`
- `apps/web/tests/unit/api/apple-music/search.test.ts`
- `apps/web/tests/unit/api/cron/schedule-release-notifications.test.ts`
- `apps/web/tests/unit/api/cron/send-release-notifications.test.ts`
- `apps/web/tests/unit/api/link/link.test.ts`
- `apps/web/tests/unit/api/pre-save/apple.test.ts`
- `apps/web/tests/unit/api/spotify/fal-analysis.test.ts`
- `apps/web/tests/unit/api/spotify/search.test.ts`
- `apps/web/tests/unit/app/artist-notifications-page.test.tsx`
- `apps/web/tests/unit/app/artist-profiles-page.test.tsx`
- `apps/web/tests/unit/app/dashboard-metadata.test.ts`
- `apps/web/tests/unit/app/new-landing-page.test.tsx`
- `apps/web/tests/unit/app/onboarding/actions/connect-spotify.test.ts`
- `apps/web/tests/unit/app/release-tasks-page.test.tsx`
- `apps/web/tests/unit/app/surface-elevation-guardrails.test.ts`
- `apps/web/tests/unit/artists-page-config.test.ts`
- `apps/web/tests/unit/chat/tool-events.test.ts`
- `apps/web/tests/unit/components/admin/AdminProfileSidebar.test.tsx`
- `apps/web/tests/unit/components/admin/GrowthIntakeComposer.test.tsx`
- `apps/web/tests/unit/components/admin/PlatformStatsStrip.test.tsx`
- `apps/web/tests/unit/dashboard/CatalogHealthSection.test.tsx`
- `apps/web/tests/unit/dashboard/ReleaseProviderMatrix.test.tsx`
- `apps/web/tests/unit/dashboard/ReleasesClientBoundary.test.tsx`
- `apps/web/tests/unit/dashboard/TasksPageClient.test.tsx`
- `apps/web/tests/unit/dashboard/platform-category.test.ts`
- `apps/web/tests/unit/dashboard/releases-page-client.test.tsx`
- `apps/web/tests/unit/dashboard/task-gating-actions.test.ts`
- `apps/web/tests/unit/dashboard/useReleaseProviderMatrix.test.tsx`
- `apps/web/tests/unit/dashboard/useReleaseProviderMatrix.toggle.test.tsx`
- `apps/web/tests/unit/demo/demo-releases-experience.test.tsx`
- `apps/web/tests/unit/discography/artist-parser.test.ts`
- `apps/web/tests/unit/discography/formatting.test.ts`
- `apps/web/tests/unit/discography/links.test.ts`
- `apps/web/tests/unit/discography/queries.upsert-recording.test.ts`
- `apps/web/tests/unit/discography/queries.upsert-release-track.test.ts`
- `apps/web/tests/unit/discography/queries.upsert-track.test.ts`
- `apps/web/tests/unit/discography/recording-artists.test.ts`
- `apps/web/tests/unit/discography/track-provider-links.test.ts`
- `apps/web/tests/unit/extensions/fill-preview.test.ts`
- `apps/web/tests/unit/extensions/summary.test.ts`
- `apps/web/tests/unit/home/HeroSpotifySearch.test.tsx`
- `apps/web/tests/unit/home/HomeAdaptiveProfileStory.test.tsx`
- `apps/web/tests/unit/home/dashboard-demos.test.tsx`
- `apps/web/tests/unit/home/marketing-content-guardrails.test.ts`
- `apps/web/tests/unit/lib/discography/release-track-loader.test.ts`
- `apps/web/tests/unit/lib/discography/release-type.test.ts`
- `apps/web/tests/unit/lib/discography/spotify-import.test.ts`
- `apps/web/tests/unit/lib/discography/sync-profile-genres.test.ts`
- `apps/web/tests/unit/lib/email/claim-invite-template.test.ts`
- `apps/web/tests/unit/lib/entitlement-boundary-helpers.test.ts`
- `apps/web/tests/unit/lib/entitlement-registry.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/feature-flags-registry.test.ts`
- `apps/web/tests/unit/lib/fit-scoring/service.test.ts`
- `apps/web/tests/unit/lib/plan-config.test.ts`
- `apps/web/tests/unit/lib/plan-gate-edge-cases.test.tsx`
- `apps/web/tests/unit/lib/playlists/curate-tracklist.test.ts`
- `apps/web/tests/unit/lib/sentry/init-state.test.ts`
- `apps/web/tests/unit/lib/sentry/route-detector.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.misc.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.module.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.routes.test.ts`
- `apps/web/tests/unit/lib/services/insights/data-aggregator.test.ts`
- `apps/web/tests/unit/lib/submission-agent/amazon-provider.test.ts`
- `apps/web/tests/unit/onboarding/onboarding-checkout.test.tsx`
- `apps/web/tests/unit/organisms/ReleasePitchSection.test.tsx`
- `apps/web/tests/unit/organisms/release-credits-action.test.ts`
- `apps/web/tests/unit/profile/ProfilePrimaryActionCard.test.tsx`
- `apps/web/tests/unit/profile/featured-playlist-fallback-discovery.test.ts`
- `apps/web/tests/unit/profile/featured-playlist-fallback-web.test.ts`
- `apps/web/tests/unit/profile/featured-playlist-fallback.test.ts`
- `apps/web/tests/unit/profile/profile-compact-template.test.tsx`
- `apps/web/tests/unit/profile/profile-links.test.tsx`
- `apps/web/tests/unit/profile/profile-service-queries.test.ts`
- `apps/web/tests/unit/profile/view-models.test.ts`
- `apps/web/tests/unit/release/determine-release-phase.test.ts`
- `apps/web/tests/unit/release/release-landing-page.test.tsx`
- `apps/web/tests/unit/release/release-type-styles.test.ts`
- `apps/web/tests/unit/release/smart-link-metadata.test.ts`
- `apps/web/tests/unit/release/sounds-landing-page.test.tsx`
- `apps/web/tests/unit/release-tasks/catalog-task-builder-dialog.test.tsx`
- `apps/web/tests/unit/release-tasks/select-tasks.test.ts`
- `apps/web/tests/unit/routes/shell-nav-coverage.test.ts`
- `apps/web/tests/unit/table/TableSearchBar.test.tsx`
- `tests/lib/provider-links.test.ts`

Dev Docs
- `docs/PRODUCT_CAPABILITIES.md`
- `docs/TANSTACK_QUERY_INVENTORY.md`

User Docs
- `apps/docs/app/docs/features/releases/page.mdx`
- `apps/docs/app/docs/self-serve-guide/connect-dsps/page.mdx`
- `apps/docs/app/docs/self-serve-guide/share-first-link/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Billing & Subscription Management</strong> — Shipped (flagged) — free+</summary>

Checkout, portal, subscription plan changes, billing status, and billing webhook reconciliation.

- Tier: P0
- Hardening rank: 4
- Flags: `BILLING_UPGRADE_DIRECT`
- Entitlements: `trial`, `pro`, `max`
- Unit coverage: 71.7% across 34 files
- E2E coverage: 69 specs

Pages
- `/app/settings/billing` — `apps/web/app/app/(shell)/settings/billing/page.tsx`
- `/billing/cancel` — `apps/web/app/billing/cancel/page.tsx`
- `/billing` — `apps/web/app/billing/page.tsx`
- `/billing/success` — `apps/web/app/billing/success/page.tsx`
- `/onboarding/checkout` — `apps/web/app/onboarding/checkout/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/admin/set-plan` (admin) — `apps/web/app/api/admin/set-plan/route.ts`
- `/api/admin/test-user/set-plan` (admin) — `apps/web/app/api/admin/test-user/set-plan/route.ts`
- `/api/billing/health` (public) — `apps/web/app/api/billing/health/route.ts`
- `/api/billing/history` (auth) — `apps/web/app/api/billing/history/route.ts`
- `/api/billing/status` (auth) — `apps/web/app/api/billing/status/route.ts`
- `/api/cron/billing-reconciliation` (cron) — `apps/web/app/api/cron/billing-reconciliation/route.ts`
- `/api/stripe/cancel` (auth) — `apps/web/app/api/stripe/cancel/route.ts`
- `/api/stripe/checkout` (auth) — `apps/web/app/api/stripe/checkout/route.ts`
- `/api/stripe/plan-change/preview` (auth) — `apps/web/app/api/stripe/plan-change/preview/route.ts`
- `/api/stripe/plan-change` (auth) — `apps/web/app/api/stripe/plan-change/route.ts`
- `/api/stripe/portal` (auth) — `apps/web/app/api/stripe/portal/route.ts`
- `/api/stripe/pricing-options` (public) — `apps/web/app/api/stripe/pricing-options/route.ts`
- `/api/stripe/webhooks` (webhook) — `apps/web/app/api/stripe/webhooks/route.ts`

Server Actions
- none

Tables
- `billingAuditLog` — `apps/web/lib/db/schema/billing.ts`
- `stripeWebhookEvents` — `apps/web/lib/db/schema/billing.ts`

Jobs
- `/api/cron/billing-reconciliation` — callable only

Webhooks
- `/api/stripe/webhooks` — stripe

Mapped Tests
- `apps/extension/src/content-adapters.test.ts`
- `apps/web/app/api/dashboard/audience/source-links/route.test.ts`
- `apps/web/app/api/spotify/search/__tests__/helpers.test.ts`
- `apps/web/app/app/layout.test.tsx`
- `apps/web/app/billing/success/page.test.tsx`
- `apps/web/components/features/dashboard/organisms/AnalyticsSidebar.test.tsx`
- `apps/web/components/features/dashboard/organisms/profile-contact-sidebar/profileLinkShareMenu.test.ts`
- `apps/web/components/features/dashboard/tasks/task-presentation.test.ts`
- `apps/web/components/features/profile/artist-notifications-cta/hero-invariants.test.ts`
- `apps/web/components/features/profile/drawer-overlay-styles.test.ts`
- `apps/web/components/homepage/HomepageIntent.test.tsx`
- `apps/web/components/homepage/intent.test.ts`
- `apps/web/components/molecules/drawer/DrawerAnalyticsSummaryCard.spec.tsx`
- `apps/web/components/molecules/drawer/DrawerEditableTextField.test.tsx`
- `apps/web/components/molecules/drawer/DrawerInspectorCard.test.tsx`
- `apps/web/components/molecules/filters/FilterChip.test.tsx`
- `apps/web/components/molecules/filters/TableFilterDropdown.test.tsx`
- `apps/web/components/organisms/table/atoms/TableHeaderCell.test.tsx`
- `apps/web/components/organisms/table/organisms/UnifiedTableHeader.test.tsx`
- `apps/web/components/organisms/table/organisms/UnifiedTableSkeleton.test.tsx`
- `apps/web/constants/platforms/utils.fuzz.test.ts`
- `apps/web/hooks/useSequentialShortcuts.test.ts`
- `apps/web/lib/__tests__/changelog-parser.test.ts`
- `apps/web/lib/admin/reliability.test.ts`
- `apps/web/lib/canonical-surfaces.test.ts`
- `apps/web/lib/discography/audio-qa.test.ts`
- `apps/web/lib/discography/preferred-dsp.test.ts`
- `apps/web/lib/dsp-enrichment/jobs/__tests__/catalog-scan.test.ts`
- `apps/web/lib/dsp-enrichment/providers/musicbrainz.test.ts`
- `apps/web/lib/http/headers.test.ts`
- `apps/web/lib/ingestion/flows/__tests__/profile-quality-gate.test.ts`
- `apps/web/lib/ingestion/flows/reingest-flow.test.ts`
- `apps/web/lib/ingestion/flows/social-platform-flow.test.ts`
- `apps/web/lib/investors/__tests__/manifest.test.ts`
- `apps/web/lib/keyboard-shortcuts.test.ts`
- `apps/web/lib/services/onboarding/welcome-message.test.ts`
- `apps/web/lib/share/context.test.ts`
- `apps/web/lib/spotify/__tests__/blacklist.test.ts`
- `apps/web/lib/spotify/scoring.test.ts`
- `apps/web/lib/utils/map-concurrent.test.ts`
- `apps/web/lib/utils/pagination-parser.test.ts`
- `apps/web/scripts/performance-batch-queue.test.ts`
- `apps/web/scripts/performance-budgets-guard.test.ts`
- `apps/web/scripts/performance-end-user-loop.test.ts`
- `apps/web/scripts/performance-optimizer-lib.test.ts`
- `apps/web/scripts/performance-optimizer.test.ts`
- `apps/web/scripts/performance-overnight.test.ts`
- `apps/web/scripts/performance-route-manifest.test.ts`
- `apps/web/scripts/performance-route-resolvers.test.ts`
- `apps/web/tests/app/sitemap.test.ts`
- `apps/web/tests/bench/track-route.bench.test.ts`
- `apps/web/tests/components/BillingDashboard.test.tsx`
- `apps/web/tests/components/admin/CreatorProfileTableRow.test.tsx`
- `apps/web/tests/components/admin/DeleteCreatorDialog.test.tsx`
- `apps/web/tests/components/admin/creator-actions-menu/CreatorActionsMenu.interaction.test.tsx`
- `apps/web/tests/components/atoms/table-action-menu/TableActionMenu.critical.test.tsx`
- `apps/web/tests/components/auth/OtpInput.test.tsx`
- `apps/web/tests/components/auth/SsoCallbackHandler.test.tsx`
- `apps/web/tests/components/billing.test.tsx`
- `apps/web/tests/components/dashboard/DashboardNav.interaction.test.tsx`
- `apps/web/tests/components/dashboard/LinkActions.click.test.tsx`
- `apps/web/tests/components/dashboard/LinkActions.keyboard.test.tsx`
- `apps/web/tests/components/dashboard/LinkActions.negative.critical.test.tsx`
- `apps/web/tests/components/dashboard/UniversalLinkInput.a11y.test.tsx`
- `apps/web/tests/components/dashboard/UniversalLinkInput.voice-recording.test.tsx`
- `apps/web/tests/components/dashboard/atoms/DspConnectionPill.test.tsx`
- `apps/web/tests/components/dashboard/organisms/ProfileAboutTab.test.tsx`
- `apps/web/tests/components/dashboard/organisms/SettingsAppearanceSection.test.tsx`
- `apps/web/tests/components/dashboard/organisms/apple-style-onboarding/apple-style-onboarding-form.test.ts`
- `apps/web/tests/components/dashboard/organisms/apple-style-onboarding/spotify-import-copy.test.ts`
- `apps/web/tests/components/dashboard/organisms/onboarding-complete-step.test.tsx`
- `apps/web/tests/components/dashboard/organisms/onboarding-form-wrapper.test.tsx`
- `apps/web/tests/components/dashboard/organisms/onboarding-handle-step.test.tsx`
- `apps/web/tests/components/dashboard/organisms/onboarding-v2-performance.test.tsx`
- `apps/web/tests/components/dashboard/organisms/profile-review-guards.test.ts`
- `apps/web/tests/components/dashboard/organisms/releases/cells/ProviderCell.interaction.test.tsx`
- `apps/web/tests/components/dashboard/socials-form/VerificationModal.test.tsx`
- `apps/web/tests/components/dashboard/socials-form/useSocialsForm.test.tsx`
- `apps/web/tests/components/forms.test.tsx`
- `apps/web/tests/components/marketing/FaqSection.test.tsx`
- `apps/web/tests/components/molecules/GenrePicker.test.tsx`
- `apps/web/tests/components/molecules/LocationPicker.test.tsx`
- `apps/web/tests/components/molecules/drawer/DrawerHeader.critical.test.tsx`
- `apps/web/tests/components/molecules/drawer/DrawerHeader.interaction.test.tsx`
- `apps/web/tests/components/molecules/drawer/DrawerSection.test.tsx`
- `apps/web/tests/components/molecules/drawer/SidebarLinkRow.interaction.test.tsx`
- `apps/web/tests/components/organisms/MarketingSignInModal.test.tsx`
- `apps/web/tests/components/organisms/PersistentAudioBar.test.tsx`
- `apps/web/tests/components/organisms/RightDrawer.interaction.test.tsx`
- `apps/web/tests/components/organisms/artist-search-palette/ArtistSearchCommandPalette.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseArtwork.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseDspLinks.interaction.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseLyricsSection.autosave.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseMetadata.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebar-links.interaction.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebarHeader.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebarLinks.interaction.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseTrackList.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/TrackDetailPanel.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/TrackSidebar.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/useTrackAudioPlayer.test.ts`
- `apps/web/tests/components/organisms/table/ActionBar.test.tsx`
- `apps/web/tests/components/organisms/table/hooks/useRowSelection.test.ts`
- `apps/web/tests/components/profile/ClaimBanner.test.tsx`
- `apps/web/tests/components/profile-drawers-dismiss.test.tsx`
- `apps/web/tests/components/providers/ClientProviders.interaction.test.tsx`
- `apps/web/tests/components/release-provider-matrix/AddReleaseSidebar.test.tsx`
- `apps/web/tests/components/release-provider-matrix/MobileReleaseList.test.tsx`
- `apps/web/tests/components/release-provider-matrix/ReleaseFilterDropdown.test.tsx`
- `apps/web/tests/components/release-provider-matrix/ReleaseTable.test.tsx`
- `apps/web/tests/components/release-provider-matrix/ReleaseTableSubheader.test.tsx`
- `apps/web/tests/components/release-provider-matrix/ReleasesEmptyState.test.tsx`
- `apps/web/tests/components/release-provider-matrix/SmartLinkGateBanner.test.tsx`
- `apps/web/tests/components/release-provider-matrix/TrackRow.test.tsx`
- `apps/web/tests/components/release-provider-matrix/column-renderers.test.tsx`
- `apps/web/tests/components/releases/AddProviderUrlPopover.test.tsx`
- `apps/web/tests/components/releases/ReleaseCell.test.tsx`
- `apps/web/tests/components/releases/ReleaseEditDialog.test.tsx`
- `apps/web/tests/components/releases/release-actions.test.tsx`
- `apps/web/tests/components/user-button.test.tsx`
- `apps/web/tests/contracts/dashboard-apis.nightly.test.ts`
- `apps/web/tests/e2e/admin-dashboard.spec.ts`
- `apps/web/tests/e2e/admin-navigation.spec.ts`
- `apps/web/tests/e2e/admin-visual-regression.spec.ts`
- `apps/web/tests/e2e/anti-cloaking.spec.ts`
- `apps/web/tests/e2e/artist-notifications.spec.ts`
- `apps/web/tests/e2e/artist-profiles.spec.ts`
- `apps/web/tests/e2e/auth.spec.ts`
- `apps/web/tests/e2e/axe-audit.spec.ts`
- `apps/web/tests/e2e/billing.spec.ts`
- `apps/web/tests/e2e/chaos-authenticated.spec.ts`
- `apps/web/tests/e2e/chat-pitch-generation.spec.ts`
- `apps/web/tests/e2e/content-gate.spec.ts`
- `apps/web/tests/e2e/core-user-journeys.spec.ts`
- `apps/web/tests/e2e/dashboard-pages-health.spec.ts`
- `apps/web/tests/e2e/dashboard.access-control.spec.ts`
- `apps/web/tests/e2e/dashboard.profile-link-card.spec.ts`
- `apps/web/tests/e2e/demo-live-parity.spec.ts`
- `apps/web/tests/e2e/demo-qa.spec.ts`
- `apps/web/tests/e2e/drawer-profile-editing.spec.ts`
- `apps/web/tests/e2e/dropdown-parity.spec.ts`
- `apps/web/tests/e2e/golden-path-app.spec.ts`
- `apps/web/tests/e2e/golden-path.spec.ts`
- `apps/web/tests/e2e/handle-check-api.spec.ts`
- `apps/web/tests/e2e/homepage-intent.spec.ts`
- `apps/web/tests/e2e/homepage.spec.ts`
- `apps/web/tests/e2e/icon-contrast-audit.spec.ts`
- `apps/web/tests/e2e/legal.spec.ts`
- `apps/web/tests/e2e/linear-shell-parity.spec.ts`
- `apps/web/tests/e2e/musicfetch-coverage.spec.ts`
- `apps/web/tests/e2e/new-landing.spec.ts`
- `apps/web/tests/e2e/nightly/auth-flows.spec.ts`
- `apps/web/tests/e2e/nightly/full-surface-chaos.spec.ts`
- `apps/web/tests/e2e/nightly/onboarding-flow.spec.ts`
- `apps/web/tests/e2e/onboarding-completion.spec.ts`
- `apps/web/tests/e2e/onboarding-flow.spec.ts`
- `apps/web/tests/e2e/onboarding.handle-race.spec.ts`
- `apps/web/tests/e2e/onboarding.handle-taken.spec.ts`
- `apps/web/tests/e2e/onboarding.spec.ts`
- `apps/web/tests/e2e/payment-complete-flow.spec.ts`
- `apps/web/tests/e2e/presence.spec.ts`
- `apps/web/tests/e2e/pricing.spec.ts`
- `apps/web/tests/e2e/pro-feature-gates.spec.ts`
- `apps/web/tests/e2e/profile-cls-audit.spec.ts`
- `apps/web/tests/e2e/profile-drawers.spec.ts`
- `apps/web/tests/e2e/profile-performance.spec.ts`
- `apps/web/tests/e2e/profile-subscribe-e2e.spec.ts`
- `apps/web/tests/e2e/profile-visual-audit.spec.ts`
- `apps/web/tests/e2e/profile.spec.ts`
- `apps/web/tests/e2e/public-exhaustive.spec.ts`
- `apps/web/tests/e2e/public-profile-smoke.spec.ts`
- `apps/web/tests/e2e/releases-dashboard.chaos.spec.ts`
- `apps/web/tests/e2e/releases-dashboard.health.spec.ts`
- `apps/web/tests/e2e/releases-dashboard.spec.ts`
- `apps/web/tests/e2e/resilience.spec.ts`
- `apps/web/tests/e2e/responsive-golden-path.spec.ts`
- `apps/web/tests/e2e/sentry-red-lane.spec.ts`
- `apps/web/tests/e2e/sentry.spec.ts`
- `apps/web/tests/e2e/signup-funnel.smoke.spec.ts`
- `apps/web/tests/e2e/smartlink-experience.spec.ts`
- `apps/web/tests/e2e/smoke-auth.spec.ts`
- `apps/web/tests/e2e/smoke-prod-auth.spec.ts`
- `apps/web/tests/e2e/smoke-public.spec.ts`
- `apps/web/tests/e2e/synthetic-golden-path.spec.ts`
- `apps/web/tests/e2e/tasks-layout.spec.ts`
- `apps/web/tests/e2e/tim-white-profile-showcase.spec.ts`
- `apps/web/tests/e2e/tip-promo.spec.ts`
- `apps/web/tests/e2e/tipping.spec.ts`
- `apps/web/tests/e2e/visual-regression.spec.ts`
- `apps/web/tests/e2e/yc-demo.spec.ts`
- `apps/web/tests/helpers/clerk-auth.test.ts`
- `apps/web/tests/integration/admin-ingestion.test.ts`
- `apps/web/tests/integration/analytics-tracking.test.ts`
- `apps/web/tests/integration/middleware-proxy.test.ts`
- `apps/web/tests/integration/onboarding-completion.test.ts`
- `apps/web/tests/integration/rls-access-control.test.ts`
- `apps/web/tests/lib/admin/impersonation.test.ts`
- `apps/web/tests/lib/admin/mercury-metrics.test.ts`
- `apps/web/tests/lib/admin/stripe-metrics.test.ts`
- `apps/web/tests/lib/analytics/data-retention.test.ts`
- `apps/web/tests/lib/analytics/pii-encryption.test.ts`
- `apps/web/tests/lib/analytics/query-timeout.test.ts`
- `apps/web/tests/lib/analytics/tracking-token.test.ts`
- `apps/web/tests/lib/anti-cloaking.test.ts`
- `apps/web/tests/lib/billing/verified-upgrade.test.ts`
- `apps/web/tests/lib/claim/claim-flow.test.ts`
- `apps/web/tests/lib/contacts/validation.test.ts`
- `apps/web/tests/lib/database-url-validation.test.ts`
- `apps/web/tests/lib/deep-links.test.ts`
- `apps/web/tests/lib/deezer-preview.test.ts`
- `apps/web/tests/lib/discography/discovery.test.ts`
- `apps/web/tests/lib/discography/provider-links-deezer.test.ts`
- `apps/web/tests/lib/discography/provider-links-musicfetch.test.ts`
- `apps/web/tests/lib/discography/release-filter-counts.test.ts`
- `apps/web/tests/lib/discography/release-search-filter.test.ts`
- `apps/web/tests/lib/discography/view-models.test.ts`
- `apps/web/tests/lib/drizzle-config.test.ts`
- `apps/web/tests/lib/dsp/registry.test.ts`
- `apps/web/tests/lib/dsp-enrichment/apple-music.test.ts`
- `apps/web/tests/lib/dsp-enrichment/extract-all-musicfetch-services.test.ts`
- `apps/web/tests/lib/dsp-enrichment/matching.test.ts`
- `apps/web/tests/lib/dsp-enrichment/musicbrainz-circuit-breaker.test.ts`
- `apps/web/tests/lib/dsp-enrichment/musicfetch-enrichment.test.ts`
- `apps/web/tests/lib/dsp-enrichment/musicfetch-mapping.test.ts`
- `apps/web/tests/lib/dsp-enrichment/musicfetch-provider.test.ts`
- `apps/web/tests/lib/dsp-enrichment/release-enrichment.test.ts`
- `apps/web/tests/lib/dsp.test.ts`
- `apps/web/tests/lib/environment-validation.test.ts`
- `apps/web/tests/lib/errors/onboarding-errors.test.ts`
- `apps/web/tests/lib/fit-scoring/calculator.test.ts`
- `apps/web/tests/lib/footer.test.ts`
- `apps/web/tests/lib/health-checks.test.ts`
- `apps/web/tests/lib/hooks/useAppleMusicArtistSearch.test.tsx`
- `apps/web/tests/lib/hooks/useArtistSearch.test.tsx`
- `apps/web/tests/lib/hooks/useProfileSaveToasts.test.ts`
- `apps/web/tests/lib/hooks/useReducedMotion.test.ts`
- `apps/web/tests/lib/identity/publish.test.ts`
- `apps/web/tests/lib/identity/store.test.ts`
- `apps/web/tests/lib/ingestion/avatar-hosting.test.ts`
- `apps/web/tests/lib/ingestion/base.test.ts`
- `apps/web/tests/lib/ingestion/beacons.test.ts`
- `apps/web/tests/lib/ingestion/confidence.test.ts`
- `apps/web/tests/lib/ingestion/followup.test.ts`
- `apps/web/tests/lib/ingestion/jobs.test.ts`
- `apps/web/tests/lib/ingestion/laylo.test.ts`
- `apps/web/tests/lib/ingestion/linktree-real-ingestion.test.ts`
- `apps/web/tests/lib/ingestion/linktree.test.ts`
- `apps/web/tests/lib/ingestion/processor.test.ts`
- `apps/web/tests/lib/ingestion/profile.test.ts`
- `apps/web/tests/lib/ingestion/scheduler.test.ts`
- `apps/web/tests/lib/ingestion/status-manager.test.ts`
- `apps/web/tests/lib/ingestion/youtube.test.ts`
- `apps/web/tests/lib/integrations.test.ts`
- `apps/web/tests/lib/leads/approve-lead.test.ts`
- `apps/web/tests/lib/leads/auto-approve.test.ts`
- `apps/web/tests/lib/leads/discovery.test.ts`
- `apps/web/tests/lib/leads/google-cse.test.ts`
- `apps/web/tests/lib/leads/instantly-timeout.test.ts`
- `apps/web/tests/lib/leads/pipeline-health-warnings.test.ts`
- `apps/web/tests/lib/leads/process-batch.test.ts`
- `apps/web/tests/lib/leads/qualify.test.ts`
- `apps/web/tests/lib/leads/route-lead.test.ts`
- `apps/web/tests/lib/monitoring/alerts.test.ts`
- `apps/web/tests/lib/monitoring/database.test.ts`
- `apps/web/tests/lib/monitoring/regression.test.ts`
- `apps/web/tests/lib/monitoring/user-journey.test.ts`
- `apps/web/tests/lib/monitoring/web-vitals.test.ts`
- `apps/web/tests/lib/musicfetch-budget-guard.test.ts`
- `apps/web/tests/lib/musicfetch-circuit-breaker.test.ts`
- `apps/web/tests/lib/musicfetch-resilient-client.test.ts`
- `apps/web/tests/lib/musicfetch.test.ts`
- `apps/web/tests/lib/notifications/preferences.test.ts`
- `apps/web/tests/lib/notifications/providers/resend.test.ts`
- `apps/web/tests/lib/notifications/service.test.ts`
- `apps/web/tests/lib/notifications/suppression.test.ts`
- `apps/web/tests/lib/notifications/validation.test.ts`
- `apps/web/tests/lib/platform-detection.test.ts`
- `apps/web/tests/lib/profile/profile-identity.test.ts`
- `apps/web/tests/lib/provider-links.test.ts`
- `apps/web/tests/lib/queries/cache-strategies.test.ts`
- `apps/web/tests/lib/queries/fetch.test.ts`
- `apps/web/tests/lib/queries/gc-time-coverage.test.ts`
- `apps/web/tests/lib/queries/keys.test.ts`
- `apps/web/tests/lib/queries/mutation-utils.test.ts`
- `apps/web/tests/lib/queries/useBillingMutations.test.tsx`
- `apps/web/tests/lib/queries/useBillingStatusQuery.test.tsx`
- `apps/web/tests/lib/queries/useDashboardProfileQuery.test.tsx`
- `apps/web/tests/lib/queries/useDashboardSocialLinksQuery.test.tsx`
- `apps/web/tests/lib/queries/useDspEnrichmentStatusQuery.test.tsx`
- `apps/web/tests/lib/queries/useDspMatchesQuery.test.tsx`
- `apps/web/tests/lib/queries/useEnvHealthQuery.test.tsx`
- `apps/web/tests/lib/queries/useNotificationStatusQuery.test.ts`
- `apps/web/tests/lib/queries/useReleaseTracksQuery.test.tsx`
- `apps/web/tests/lib/rls-policies.test.ts`
- `apps/web/tests/lib/services/link-encryption.test.ts`
- `apps/web/tests/lib/stripe/billing-hardening.test.ts`
- `apps/web/tests/lib/utils/avatar-url.test.ts`
- `apps/web/tests/lib/utils/bot-detection.test.ts`
- `apps/web/tests/lib/utils/date.test.ts`
- `apps/web/tests/lib/utils/gravatar.test.ts`
- `apps/web/tests/lib/utils/url-encryption.test.ts`
- `apps/web/tests/lib/validation/client-username.test.ts`
- `apps/web/tests/lib/validation/wrap-link-schemas.test.ts`
- `apps/web/tests/performance/onboarding-performance.spec.ts`
- `apps/web/tests/product-screenshots/audience.spec.ts`
- `apps/web/tests/product-screenshots/catalog.spec.ts`
- `apps/web/tests/product-screenshots/insights.spec.ts`
- `apps/web/tests/product-screenshots/releases.spec.ts`
- `apps/web/tests/scripts/overnight-qa-controller-live.test.ts`
- `apps/web/tests/scripts/overnight-qa-issues.test.ts`
- `apps/web/tests/scripts/overnight-qa-ledger.test.ts`
- `apps/web/tests/scripts/overnight-qa-risk.test.ts`
- `apps/web/tests/scripts/overnight-qa-server.test.ts`
- `apps/web/tests/scripts/performance-route-resolvers.test.ts`
- `apps/web/tests/scripts/route-qa-auth-probe.test.ts`
- `apps/web/tests/scripts/route-qa.test.ts`
- `apps/web/tests/scripts/run-sql.test.ts`
- `apps/web/tests/unit/Button.test.tsx`
- `apps/web/tests/unit/CTAButton.test.tsx`
- `apps/web/tests/unit/CheckoutSuccessPage.test.tsx`
- `apps/web/tests/unit/ClaimHandleForm.test.tsx`
- `apps/web/tests/unit/Confetti.test.tsx`
- `apps/web/tests/unit/CopyToClipboardButton.test.tsx`
- `apps/web/tests/unit/DataCard.test.tsx`
- `apps/web/tests/unit/DesktopQrOverlay.test.tsx`
- `apps/web/tests/unit/Divider.test.tsx`
- `apps/web/tests/unit/DotBadge.test.tsx`
- `apps/web/tests/unit/DrawerHeaderActions.test.tsx`
- `apps/web/tests/unit/DropdownMenu.test.tsx`
- `apps/web/tests/unit/DspPresenceSummary.test.tsx`
- `apps/web/tests/unit/EmptyCell.test.tsx`
- `apps/web/tests/unit/EmptyState.test.tsx`
- `apps/web/tests/unit/EnhancedDashboardLinks.test.tsx`
- `apps/web/tests/unit/ErrorBoundary.test.tsx`
- `apps/web/tests/unit/FeaturedCreators.test.tsx`
- `apps/web/tests/unit/FlyoutItem.test.tsx`
- `apps/web/tests/unit/Form.test.tsx`
- `apps/web/tests/unit/FormField.test.tsx`
- `apps/web/tests/unit/FormStatus.test.tsx`
- `apps/web/tests/unit/GradientText.test.tsx`
- `apps/web/tests/unit/GroupedLinksManager.test.tsx`
- `apps/web/tests/unit/Header.test.tsx`
- `apps/web/tests/unit/Icon.test.tsx`
- `apps/web/tests/unit/IconBadge.test.tsx`
- `apps/web/tests/unit/InfoBox.test.tsx`
- `apps/web/tests/unit/Input.test.tsx`
- `apps/web/tests/unit/LoadingSpinner.test.tsx`
- `apps/web/tests/unit/Logo.test.tsx`
- `apps/web/tests/unit/LogoLink.test.tsx`
- `apps/web/tests/unit/OptimizedImage.test.tsx`
- `apps/web/tests/unit/PlaceholderImage.test.tsx`
- `apps/web/tests/unit/Popover.test.tsx`
- `apps/web/tests/unit/PreFooterCTA.test.tsx`
- `apps/web/tests/unit/ProblemSolutionSection.test.tsx`
- `apps/web/tests/unit/ProgressIndicator.test.tsx`
- `apps/web/tests/unit/QRCode.test.tsx`
- `apps/web/tests/unit/Separator.test.tsx`
- `apps/web/tests/unit/Sheet.test.tsx`
- `apps/web/tests/unit/SocialBar.test.tsx`
- `apps/web/tests/unit/Spacer.test.tsx`
- `apps/web/tests/unit/StatusBadge.test.tsx`
- `apps/web/tests/unit/SupportPage.test.tsx`
- `apps/web/tests/unit/TipPromo.test.tsx`
- `apps/web/tests/unit/TruncatedText.test.tsx`
- `apps/web/tests/unit/VerifiedBadge.test.tsx`
- `apps/web/tests/unit/actions/admin-actions.test.ts`
- `apps/web/tests/unit/actions/contacts-actions.test.ts`
- `apps/web/tests/unit/actions/creator-profile-actions.test.ts`
- `apps/web/tests/unit/actions/onboarding/complete-onboarding.test.ts`
- `apps/web/tests/unit/actions/onboarding/profile-setup.test.ts`
- `apps/web/tests/unit/actions/onboarding/validation.test.ts`
- `apps/web/tests/unit/actions/releases-actions.create.nightly.test.ts`
- `apps/web/tests/unit/actions/releases-actions.publish.nightly.test.ts`
- `apps/web/tests/unit/actions/releases-actions.update.nightly.test.ts`
- `apps/web/tests/unit/actions/tour-dates-actions.test.ts`
- `apps/web/tests/unit/admin/AdminConversionFunnelSection.test.tsx`
- `apps/web/tests/unit/admin/LeadTable.test.tsx`
- `apps/web/tests/unit/admin/conversion-funnel.test.ts`
- `apps/web/tests/unit/admin.OperatorBanner.test.tsx`
- `apps/web/tests/unit/api/account/delete-route.test.ts`
- `apps/web/tests/unit/api/account/email.test.ts`
- `apps/web/tests/unit/api/admin/creator-avatar.test.ts`
- `apps/web/tests/unit/api/admin/creator-ingest.test.ts`
- `apps/web/tests/unit/api/admin/creator-invite-bulk.test.ts`
- `apps/web/tests/unit/api/admin/creator-social-links.test.ts`
- `apps/web/tests/unit/api/admin/impersonate.test.ts`
- `apps/web/tests/unit/api/admin/leads-dm-sent.test.ts`
- `apps/web/tests/unit/api/admin/leads-id.test.ts`
- `apps/web/tests/unit/api/admin/leads-post.test.ts`
- `apps/web/tests/unit/api/admin/leads-route.test.ts`
- `apps/web/tests/unit/api/admin/outreach-route.test.ts`
- `apps/web/tests/unit/api/admin/overview.test.ts`
- `apps/web/tests/unit/api/admin/test-user-set-plan.test.ts`
- `apps/web/tests/unit/api/admin/waitlist-approve.test.ts`
- `apps/web/tests/unit/api/admin/waitlist-disapprove.test.ts`
- `apps/web/tests/unit/api/apple-music/search.test.ts`
- `apps/web/tests/unit/api/artist/theme.test.ts`
- `apps/web/tests/unit/api/audience/click.test.ts`
- `apps/web/tests/unit/api/audience/visit.test.ts`
- `apps/web/tests/unit/api/billing/health.test.ts`
- `apps/web/tests/unit/api/billing/history.test.ts`
- `apps/web/tests/unit/api/billing/status.test.ts`
- `apps/web/tests/unit/api/calendar-ics-route.test.ts`
- `apps/web/tests/unit/api/changelog/changelog-unsubscribe.test.ts`
- `apps/web/tests/unit/api/changelog/changelog-verify.test.ts`
- `apps/web/tests/unit/api/changelog/subscribe.test.ts`
- `apps/web/tests/unit/api/chat/confirm-edit.test.ts`
- `apps/web/tests/unit/api/chat/conversation-message-routes.test.ts`
- `apps/web/tests/unit/api/chat/conversations.test.ts`
- `apps/web/tests/unit/api/chat/usage.test.ts`
- `apps/web/tests/unit/api/clerk/webhook.test.ts`
- `apps/web/tests/unit/api/creator/creator.test.ts`
- `apps/web/tests/unit/api/cron/billing-reconciliation.test.ts`
- `apps/web/tests/unit/api/cron/cleanup-idempotency-keys.test.ts`
- `apps/web/tests/unit/api/cron/cleanup-photos.test.ts`
- `apps/web/tests/unit/api/cron/daily-maintenance.test.ts`
- `apps/web/tests/unit/api/cron/data-retention.test.ts`
- `apps/web/tests/unit/api/cron/frequent.test.ts`
- `apps/web/tests/unit/api/cron/generate-insights.test.ts`
- `apps/web/tests/unit/api/cron/generate-playlist.test.ts`
- `apps/web/tests/unit/api/cron/pixel-forwarding.test.ts`
- `apps/web/tests/unit/api/cron/process-campaigns.test.ts`
- `apps/web/tests/unit/api/cron/process-ingestion-jobs.test.ts`
- `apps/web/tests/unit/api/cron/process-pre-saves.test.ts`
- `apps/web/tests/unit/api/cron/schedule-release-notifications.test.ts`
- `apps/web/tests/unit/api/cron/send-release-notifications.test.ts`
- `apps/web/tests/unit/api/dashboard/analytics.test.ts`
- `apps/web/tests/unit/api/dashboard/contacts.test.ts`
- `apps/web/tests/unit/api/dashboard/earnings.test.ts`
- `apps/web/tests/unit/api/dashboard/press-photos.test.ts`
- `apps/web/tests/unit/api/dashboard/profile/clerk-sync.test.ts`
- `apps/web/tests/unit/api/dashboard/profile/db-operations.test.ts`
- `apps/web/tests/unit/api/dashboard/profile/profile-update-contract.test.ts`
- `apps/web/tests/unit/api/dashboard/profile/response.test.ts`
- `apps/web/tests/unit/api/dashboard/profile/route-rollback.test.ts`
- `apps/web/tests/unit/api/dashboard/shop.test.ts`
- `apps/web/tests/unit/api/dashboard/social-links-verify.test.ts`
- `apps/web/tests/unit/api/deploy/promote.test.ts`
- `apps/web/tests/unit/api/deploy/status.test.ts`
- `apps/web/tests/unit/api/dev/clear-session.test.ts`
- `apps/web/tests/unit/api/dev/test-auth-routes.test.ts`
- `apps/web/tests/unit/api/dsp-enrichment-status.test.ts`
- `apps/web/tests/unit/api/extension/action-log-route.test.ts`
- `apps/web/tests/unit/api/extension/fill-preview-route.test.ts`
- `apps/web/tests/unit/api/extension/session-status-route.test.ts`
- `apps/web/tests/unit/api/featured-creators/featured-creators.test.ts`
- `apps/web/tests/unit/api/feedback/route.test.ts`
- `apps/web/tests/unit/api/handle/check.test.ts`
- `apps/web/tests/unit/api/health/auth.critical.test.ts`
- `apps/web/tests/unit/api/health/build-info.critical.test.ts`
- `apps/web/tests/unit/api/health/comprehensive.critical.test.ts`
- `apps/web/tests/unit/api/health/db-performance.critical.test.ts`
- `apps/web/tests/unit/api/health/db.critical.test.ts`
- `apps/web/tests/unit/api/health/env.critical.test.ts`
- `apps/web/tests/unit/api/images/press-photos-delete.test.ts`
- `apps/web/tests/unit/api/images/status.test.ts`
- `apps/web/tests/unit/api/images/upload.test.ts`
- `apps/web/tests/unit/api/ingestion/jobs.test.ts`
- `apps/web/tests/unit/api/insights/generate.test.ts`
- `apps/web/tests/unit/api/insights/insight-update.test.ts`
- `apps/web/tests/unit/api/insights/route.test.ts`
- `apps/web/tests/unit/api/insights/summary.test.ts`
- `apps/web/tests/unit/api/link/link.test.ts`
- `apps/web/tests/unit/api/metadata-submissions-approve-send.test.ts`
- `apps/web/tests/unit/api/metadata-submissions-prepare.test.ts`
- `apps/web/tests/unit/api/metadata-submissions-status.test.ts`
- `apps/web/tests/unit/api/mobile/v1/me.test.ts`
- `apps/web/tests/unit/api/notifications/status.test.ts`
- `apps/web/tests/unit/api/notifications/subscribe.test.ts`
- `apps/web/tests/unit/api/onboarding/discovery.test.ts`
- `apps/web/tests/unit/api/onboarding/distribution-event.test.ts`
- `apps/web/tests/unit/api/onboarding/welcome-chat.test.ts`
- `apps/web/tests/unit/api/onboarding-discovery-route.test.ts`
- `apps/web/tests/unit/api/pre-save/apple.test.ts`
- `apps/web/tests/unit/api/revalidate/featured-creators.test.ts`
- `apps/web/tests/unit/api/spotify/fal-analysis.test.ts`
- `apps/web/tests/unit/api/spotify/search.test.ts`
- `apps/web/tests/unit/api/stripe/cancel.test.ts`
- `apps/web/tests/unit/api/stripe/checkout.test.ts`
- `apps/web/tests/unit/api/stripe/plan-change-preview.test.ts`
- `apps/web/tests/unit/api/stripe/plan-change.test.ts`
- `apps/web/tests/unit/api/stripe/portal.test.ts`
- `apps/web/tests/unit/api/stripe/pricing-options.test.ts`
- `apps/web/tests/unit/api/stripe/webhooks.delegation.test.ts`
- `apps/web/tests/unit/api/stripe/webhooks.errors.test.ts`
- `apps/web/tests/unit/api/stripe/webhooks.idempotency.test.ts`
- `apps/web/tests/unit/api/stripe/webhooks.misc.test.ts`
- `apps/web/tests/unit/api/stripe/webhooks.signature.test.ts`
- `apps/web/tests/unit/api/tip/create-tip-intent.test.ts`
- `apps/web/tests/unit/api/tour-date-analytics-route.test.ts`
- `apps/web/tests/unit/api/track/route.test.ts`
- `apps/web/tests/unit/api/track/validation.test.ts`
- `apps/web/tests/unit/api/verification/request.test.ts`
- `apps/web/tests/unit/api/waitlist/waitlist.test.ts`
- `apps/web/tests/unit/api/webhooks/linear.test.ts`
- `apps/web/tests/unit/api/webhooks/resend-inbound.test.ts`
- `apps/web/tests/unit/api/webhooks/sentry.test.ts`
- `apps/web/tests/unit/api/webhooks/stripe-connect.test.ts`
- `apps/web/tests/unit/api/webhooks/stripe-tips.test.ts`
- `apps/web/tests/unit/app/ProfileCompletionRedirect.test.tsx`
- `apps/web/tests/unit/app/[username]/claim/route.test.ts`
- `apps/web/tests/unit/app/admin/admin-load-failures.test.tsx`
- `apps/web/tests/unit/app/admin/creator-toggle-routes.test.ts`
- `apps/web/tests/unit/app/admin-platform-connections-client.test.tsx`
- `apps/web/tests/unit/app/artist-notifications-page.test.tsx`
- `apps/web/tests/unit/app/artist-profiles-page.test.tsx`
- `apps/web/tests/unit/app/auth-layout.test.tsx`
- `apps/web/tests/unit/app/auth-shell-contract-guard.test.ts`
- `apps/web/tests/unit/app/billing-success-page.test.tsx`
- `apps/web/tests/unit/app/claim-token-route.test.ts`
- `apps/web/tests/unit/app/dashboard-earnings-page.test.tsx`
- `apps/web/tests/unit/app/dashboard-metadata.test.ts`
- `apps/web/tests/unit/app/internal-shell-surface-guard.test.ts`
- `apps/web/tests/unit/app/new-landing-page.test.tsx`
- `apps/web/tests/unit/app/notifications/page.test.tsx`
- `apps/web/tests/unit/app/onboarding/actions/avatar.test.ts`
- `apps/web/tests/unit/app/onboarding/actions/connect-spotify.test.ts`
- `apps/web/tests/unit/app/onboarding/actions/index.test.ts`
- `apps/web/tests/unit/app/onboarding-page.test.tsx`
- `apps/web/tests/unit/app/out-link-page.test.ts`
- `apps/web/tests/unit/app/profile-claim-banner-state.test.ts`
- `apps/web/tests/unit/app/profile-layout.test.tsx`
- `apps/web/tests/unit/app/public-cta-guard.test.ts`
- `apps/web/tests/unit/app/public-route-container-guard.test.ts`
- `apps/web/tests/unit/app/public-surface-guardrails.test.ts`
- `apps/web/tests/unit/app/public-width-contract-guard.test.ts`
- `apps/web/tests/unit/app/release-tasks-page.test.tsx`
- `apps/web/tests/unit/app/settings-route-error-guard.test.ts`
- `apps/web/tests/unit/app/settings-scroll-mode.test.ts`
- `apps/web/tests/unit/app/signin-page.test.tsx`
- `apps/web/tests/unit/app/signup-page.test.tsx`
- `apps/web/tests/unit/app/surface-elevation-guardrails.test.ts`
- `apps/web/tests/unit/artists-page-config.test.ts`
- `apps/web/tests/unit/atoms/ArtistName.test.tsx`
- `apps/web/tests/unit/atoms/AvatarAvatar.error-handling.test.tsx`
- `apps/web/tests/unit/atoms/AvatarUploadAnnouncer.test.tsx`
- `apps/web/tests/unit/atoms/CircleIconButton.test.tsx`
- `apps/web/tests/unit/atoms/DSPButton.test.tsx`
- `apps/web/tests/unit/atoms/FooterLink.test.tsx`
- `apps/web/tests/unit/atoms/FrostedButton.test.tsx`
- `apps/web/tests/unit/atoms/HeaderIconButton.test.tsx`
- `apps/web/tests/unit/atoms/InlineIconButton.test.tsx`
- `apps/web/tests/unit/atoms/JovieLogo.test.tsx`
- `apps/web/tests/unit/atoms/LogoIcon.test.tsx`
- `apps/web/tests/unit/atoms/LogoLoader.test.tsx`
- `apps/web/tests/unit/atoms/ReleaseArtworkThumb.test.tsx`
- `apps/web/tests/unit/atoms/SkipToContent.test.tsx`
- `apps/web/tests/unit/atoms/SocialIcon.test.tsx`
- `apps/web/tests/unit/atoms/TableActionMenu.test.tsx`
- `apps/web/tests/unit/atoms/TableErrorFallback.test.tsx`
- `apps/web/tests/unit/atoms-integration.test.tsx`
- `apps/web/tests/unit/auth/AuthLayout.test.tsx`
- `apps/web/tests/unit/auth/AuthModalShell.test.tsx`
- `apps/web/tests/unit/auth/profile-completeness.test.ts`
- `apps/web/tests/unit/auth/waitlist-gating.test.ts`
- `apps/web/tests/unit/auth-client-providers.test.tsx`
- `apps/web/tests/unit/billing-providers.test.tsx`
- `apps/web/tests/unit/chat/ChatEntityRightPanelHost.test.tsx`
- `apps/web/tests/unit/chat/ChatInput.test.tsx`
- `apps/web/tests/unit/chat/ChatLoading.test.tsx`
- `apps/web/tests/unit/chat/ChatMarkdown.test.tsx`
- `apps/web/tests/unit/chat/ChatMessage.analytics-card.test.tsx`
- `apps/web/tests/unit/chat/ChatMessageSkeleton.test.tsx`
- `apps/web/tests/unit/chat/ChatPageClient.test.tsx`
- `apps/web/tests/unit/chat/ChatUsageAlert.test.tsx`
- `apps/web/tests/unit/chat/InlineChatArea.tool-rendering.test.tsx`
- `apps/web/tests/unit/chat/JovieChat.empty-state.test.tsx`
- `apps/web/tests/unit/chat/JovieChat.styling.test.tsx`
- `apps/web/tests/unit/chat/ProfileEditPreviewCard.test.tsx`
- `apps/web/tests/unit/chat/ProfilePageChat.test.tsx`
- `apps/web/tests/unit/chat/SuggestedPrompts.test.tsx`
- `apps/web/tests/unit/chat/ai-model-identifiers.test.ts`
- `apps/web/tests/unit/chat/ai-operations.test.ts`
- `apps/web/tests/unit/chat/chat-context.test.ts`
- `apps/web/tests/unit/chat/chat-title-generation.test.ts`
- `apps/web/tests/unit/chat/chat-title-sync.test.ts`
- `apps/web/tests/unit/chat/confirm-edit-route.test.ts`
- `apps/web/tests/unit/chat/greeting.test.ts`
- `apps/web/tests/unit/chat/intent-classification.test.ts`
- `apps/web/tests/unit/chat/intent-router.test.ts`
- `apps/web/tests/unit/chat/jovie-error-utils.test.ts`
- `apps/web/tests/unit/chat/knowledge-retrieval.test.ts`
- `apps/web/tests/unit/chat/message-parts.test.ts`
- `apps/web/tests/unit/chat/profile-edit-chat.test.ts`
- `apps/web/tests/unit/chat/profile-edit-tool.test.ts`
- `apps/web/tests/unit/chat/session-error-response.test.ts`
- `apps/web/tests/unit/chat/streamdown-config.test.ts`
- `apps/web/tests/unit/chat/tool-events.test.ts`
- `apps/web/tests/unit/chat/useChatConversationQuery.test.tsx`
- `apps/web/tests/unit/chat/useChatMutations.test.tsx`
- `apps/web/tests/unit/chat/useConfirmChatEditMutation.test.tsx`
- `apps/web/tests/unit/chat/useJovieChat.rate-limit.test.tsx`
- `apps/web/tests/unit/chat/useSuggestedProfiles.test.ts`
- `apps/web/tests/unit/chat-usage-resolve-plan.test.ts`
- `apps/web/tests/unit/client-providers-query.test.tsx`
- `apps/web/tests/unit/components/AuthShellWrapper.test.tsx`
- `apps/web/tests/unit/components/admin/AdminProfileSidebar.test.tsx`
- `apps/web/tests/unit/components/admin/AdminScoreboardSection.test.tsx`
- `apps/web/tests/unit/components/admin/AdminUsersTableUnified.test.tsx`
- `apps/web/tests/unit/components/admin/CampaignSettingsPanel.test.tsx`
- `apps/web/tests/unit/components/admin/GrowthIntakeComposer.test.tsx`
- `apps/web/tests/unit/components/admin/KpiCards.test.tsx`
- `apps/web/tests/unit/components/admin/PlatformStatsStrip.test.tsx`
- `apps/web/tests/unit/components/admin/ReliabilityCard.test.tsx`
- `apps/web/tests/unit/components/admin/WaitlistSettingsPanel.test.tsx`
- `apps/web/tests/unit/components/admin/WeeklyTrendChart.test.tsx`
- `apps/web/tests/unit/components/admin/admin-user-actions.test.ts`
- `apps/web/tests/unit/components/admin/csv-export.button.test.tsx`
- `apps/web/tests/unit/components/admin/csv-export.config.test.tsx`
- `apps/web/tests/unit/components/admin/csv-export.hook.test.tsx`
- `apps/web/tests/unit/components/admin/ingest-profile-input.test.ts`
- `apps/web/tests/unit/components/admin/useBulkActions.test.ts`
- `apps/web/tests/unit/components/admin/waitlist-bulk-actions.test.ts`
- `apps/web/tests/unit/components/atoms/AppIconButton.test.tsx`
- `apps/web/tests/unit/components/atoms/Avatar/Avatar.test.tsx`
- `apps/web/tests/unit/components/atoms/Badge/Badge.test.tsx`
- `apps/web/tests/unit/components/atoms/ImageWithFallback.test.tsx`
- `apps/web/tests/unit/components/dashboard/organisms/apple-style-onboarding/useHandleValidation.test.ts`
- `apps/web/tests/unit/components/feedback/sidebar-lower-shell-visual-hierarchy.test.tsx`
- `apps/web/tests/unit/components/home/SeeItInActionCarousel.test.tsx`
- `apps/web/tests/unit/components/molecules/AvatarUploadable.a11y.test.tsx`
- `apps/web/tests/unit/components/molecules/AvatarUploadable.dnd.test.tsx`
- `apps/web/tests/unit/components/molecules/AvatarUploadable.progress.test.tsx`
- `apps/web/tests/unit/components/molecules/AvatarUploadable.render.test.tsx`
- `apps/web/tests/unit/components/molecules/AvatarUploadable.validation.test.tsx`
- `apps/web/tests/unit/components/molecules/DrawerCardActionBar.test.tsx`
- `apps/web/tests/unit/components/molecules/EntitySidebarShell.test.tsx`
- `apps/web/tests/unit/components/organisms/AppShellContentPanel.test.tsx`
- `apps/web/tests/unit/components/organisms/AuthShellWrapper.test.tsx`
- `apps/web/tests/unit/components/profile/useProfileNotificationsController.test.tsx`
- `apps/web/tests/unit/components/providers/clerkAvailability.test.ts`
- `apps/web/tests/unit/components/releases/ProviderStatusDot.test.tsx`
- `apps/web/tests/unit/components/tab-bar/TabBar.test.tsx`
- `apps/web/tests/unit/components/table/PageToolbar.test.tsx`
- `apps/web/tests/unit/components/table/SocialLinksCell.test.tsx`
- `apps/web/tests/unit/constants/domains.test.ts`
- `apps/web/tests/unit/contexts/TablePanelContext.test.tsx`
- `apps/web/tests/unit/cookie-banner-fixes.test.tsx`
- `apps/web/tests/unit/cookie-banner.test.tsx`
- `apps/web/tests/unit/core-providers-route-variant.test.tsx`
- `apps/web/tests/unit/creator-profile-cap.test.tsx`
- `apps/web/tests/unit/dashboard/AddPlatformDialog.test.tsx`
- `apps/web/tests/unit/dashboard/AudienceMemberActivityFeed.test.tsx`
- `apps/web/tests/unit/dashboard/CatalogHealthSection.test.tsx`
- `apps/web/tests/unit/dashboard/CelebrationCardPreview.test.tsx`
- `apps/web/tests/unit/dashboard/ContactDetailSidebar.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardActivityFeed.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardAudienceTable.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardDataContext.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardHeader.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardNav.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardOverview.test.tsx`
- `apps/web/tests/unit/dashboard/DspPresenceSidebar.test.tsx`
- `apps/web/tests/unit/dashboard/DspPresenceView.test.tsx`
- `apps/web/tests/unit/dashboard/EarningsTabTippers.test.tsx`
- `apps/web/tests/unit/dashboard/FirstFanCelebration.test.tsx`
- `apps/web/tests/unit/dashboard/GetStartedChecklistCard.test.tsx`
- `apps/web/tests/unit/dashboard/HeaderProfileProgress.test.tsx`
- `apps/web/tests/unit/dashboard/ImportProgressBanner.test.tsx`
- `apps/web/tests/unit/dashboard/MismatchCard.test.tsx`
- `apps/web/tests/unit/dashboard/MusicImportHero.test.tsx`
- `apps/web/tests/unit/dashboard/NewReleaseHeaderAction.test.tsx`
- `apps/web/tests/unit/dashboard/PreviewPanel.test.tsx`
- `apps/web/tests/unit/dashboard/ProfileCompletionCard.test.tsx`
- `apps/web/tests/unit/dashboard/ProfileContactSidebar.scroll.test.tsx`
- `apps/web/tests/unit/dashboard/ProfileSidebarHeader.test.tsx`
- `apps/web/tests/unit/dashboard/ProfileTipsSurface.test.tsx`
- `apps/web/tests/unit/dashboard/RangeToggle.test.tsx`
- `apps/web/tests/unit/dashboard/RecentChats.test.tsx`
- `apps/web/tests/unit/dashboard/ReleaseProviderMatrix.test.tsx`
- `apps/web/tests/unit/dashboard/ReleaseTaskChecklist.test.tsx`
- `apps/web/tests/unit/dashboard/SettingsAdPixelsSection.test.tsx`
- `apps/web/tests/unit/dashboard/SettingsContactsSection.test.tsx`
- `apps/web/tests/unit/dashboard/SettingsPaySection.test.tsx`
- `apps/web/tests/unit/dashboard/SettingsPolished.test.tsx`
- `apps/web/tests/unit/dashboard/SettingsSection.test.tsx`
- `apps/web/tests/unit/dashboard/SmartActionCards.test.tsx`
- `apps/web/tests/unit/dashboard/SocialBioNudge.test.tsx`
- `apps/web/tests/unit/dashboard/SuggestedDspMatches.test.tsx`
- `apps/web/tests/unit/dashboard/TaskListRow.test.tsx`
- `apps/web/tests/unit/dashboard/TaskWorkspaceHeaderBar.test.tsx`
- `apps/web/tests/unit/dashboard/TasksPageClient.test.tsx`
- `apps/web/tests/unit/dashboard/audience-table/AudienceEngagementCell.test.tsx`
- `apps/web/tests/unit/dashboard/audience-table/AudienceLastActionCellTimestamp.test.tsx`
- `apps/web/tests/unit/dashboard/audience-table/AudienceSourceCell.test.tsx`
- `apps/web/tests/unit/dashboard/audience-table/column-renderers-platforms.test.tsx`
- `apps/web/tests/unit/dashboard/contact-row-actions.test.tsx`
- `apps/web/tests/unit/dashboard/dashboard-clerk-safe.test.tsx`
- `apps/web/tests/unit/dashboard/dashboard-data-prefetch.test.ts`
- `apps/web/tests/unit/dashboard/dashboard-shell-content.test.ts`
- `apps/web/tests/unit/dashboard/drawer-chrome.test.tsx`
- `apps/web/tests/unit/dashboard/dsp-match-surfaces.test.tsx`
- `apps/web/tests/unit/dashboard/presence-actions.test.ts`
- `apps/web/tests/unit/dashboard/profile-selection-activeProfileId.test.ts`
- `apps/web/tests/unit/dashboard/releases-page-client.test.tsx`
- `apps/web/tests/unit/dashboard/task-gating-actions.test.ts`
- `apps/web/tests/unit/dashboard/useMusicLinksForm.test.tsx`
- `apps/web/tests/unit/dashboard/useReleaseProviderMatrix.test.tsx`
- `apps/web/tests/unit/dashboard/useReleaseProviderMatrix.toggle.test.tsx`
- `apps/web/tests/unit/db/queries/press-photos.test.ts`
- `apps/web/tests/unit/demo/DemoPublicProfileSurface.test.tsx`
- `apps/web/tests/unit/demo/DemoTimWhiteProfileSurface.test.tsx`
- `apps/web/tests/unit/demo/demo-actions.test.ts`
- `apps/web/tests/unit/demo/demo-releases-experience.test.tsx`
- `apps/web/tests/unit/demo/demo-surface-boundaries.test.ts`
- `apps/web/tests/unit/demo/showcase-surfaces.test.ts`
- `apps/web/tests/unit/demo-recording.test.ts`
- `apps/web/tests/unit/dev/DevToolbar.test.tsx`
- `apps/web/tests/unit/discography/formatting.test.ts`
- `apps/web/tests/unit/discography/links.test.ts`
- `apps/web/tests/unit/discography/queries.upsert-recording.test.ts`
- `apps/web/tests/unit/discography/queries.upsert-track.test.ts`
- `apps/web/tests/unit/discography/track-provider-links.test.ts`
- `apps/web/tests/unit/e2e/e2e-helpers.test.ts`
- `apps/web/tests/unit/e2e/seed-test-data.test.ts`
- `apps/web/tests/unit/extensions/fill-preview.test.ts`
- `apps/web/tests/unit/extensions/summary.test.ts`
- `apps/web/tests/unit/feedback/ErrorBanner.test.tsx`
- `apps/web/tests/unit/home/ArtistProfileModesShowcase.test.tsx`
- `apps/web/tests/unit/home/FinalCTASection.test.tsx`
- `apps/web/tests/unit/home/HeroSpotifySearch.test.tsx`
- `apps/web/tests/unit/home/HomeAdaptiveProfileStory.test.tsx`
- `apps/web/tests/unit/home/HomePageNarrative.test.tsx`
- `apps/web/tests/unit/home/MobileProfilePreview.test.tsx`
- `apps/web/tests/unit/home/PhoneShowcase.test.tsx`
- `apps/web/tests/unit/home/ReleaseOperatingSystemShowcase.test.tsx`
- `apps/web/tests/unit/home/SeeItInActionSafe.test.tsx`
- `apps/web/tests/unit/home/dashboard-demos.test.tsx`
- `apps/web/tests/unit/home/homepage-featured-selection.test.ts`
- `apps/web/tests/unit/home/homepage-proof-manifest.test.ts`
- `apps/web/tests/unit/home/intent-store.test.ts`
- `apps/web/tests/unit/home/marketing-content-guardrails.test.ts`
- `apps/web/tests/unit/home/phone-mode-content.test.ts`
- `apps/web/tests/unit/home/tim-white-marketing-fixtures.test.ts`
- `apps/web/tests/unit/home/tim-white-profile.test.ts`
- `apps/web/tests/unit/hooks/useChunkErrorHandler.test.ts`
- `apps/web/tests/unit/hooks/useDisclosure.test.tsx`
- `apps/web/tests/unit/hooks/useFormState.test.ts`
- `apps/web/tests/unit/hooks/useIsAuthenticated.test.tsx`
- `apps/web/tests/unit/hooks/useNotifications.test.ts`
- `apps/web/tests/unit/hooks/useSequentialShortcuts.test.ts`
- `apps/web/tests/unit/hooks/useSidebarKeyboardShortcut.test.ts`
- `apps/web/tests/unit/hooks/useTourDateProximity.test.ts`
- `apps/web/tests/unit/icon-contrast.test.ts`
- `apps/web/tests/unit/inbox/inbox-utils.test.ts`
- `apps/web/tests/unit/inbox/webhook-handler.test.ts`
- `apps/web/tests/unit/ladygaga-seed.test.ts`
- `apps/web/tests/unit/landing/SharedMarketingHero.test.tsx`
- `apps/web/tests/unit/lib/accent-palette.test.ts`
- `apps/web/tests/unit/lib/admin/funnel-metrics.test.ts`
- `apps/web/tests/unit/lib/admin/payload-parsers.test.ts`
- `apps/web/tests/unit/lib/admin/platform-connections.test.ts`
- `apps/web/tests/unit/lib/ai/artist-bio-writer.test.ts`
- `apps/web/tests/unit/lib/analytics-range-clamp.test.ts`
- `apps/web/tests/unit/lib/audience/source-link-code.test.ts`
- `apps/web/tests/unit/lib/auth/build-auth-route-url.test.ts`
- `apps/web/tests/unit/lib/auth/cached.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-errors.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-identity.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-middleware-bypass.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-sync.critical.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-sync.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-webhook-handlers.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-webhook-registry.test.ts`
- `apps/web/tests/unit/lib/auth/constants.test.ts`
- `apps/web/tests/unit/lib/auth/dev-test-auth.server.regression-1.test.ts`
- `apps/web/tests/unit/lib/auth/dev-test-auth.server.test.ts`
- `apps/web/tests/unit/lib/auth/gate.critical.test.ts`
- `apps/web/tests/unit/lib/auth/gate.test.ts`
- `apps/web/tests/unit/lib/auth/plan-intent.test.ts`
- `apps/web/tests/unit/lib/auth/proxy-state.test.ts`
- `apps/web/tests/unit/lib/auth/require-auth.test.ts`
- `apps/web/tests/unit/lib/auth/session.critical.test.ts`
- `apps/web/tests/unit/lib/auth/staging-clerk-keys.test.ts`
- `apps/web/tests/unit/lib/auth/test-mode.test.ts`
- `apps/web/tests/unit/lib/billing/batch-processor.test.ts`
- `apps/web/tests/unit/lib/billing/orphaned-subscription-handler.test.ts`
- `apps/web/tests/unit/lib/billing/status-mismatch-fixer.test.ts`
- `apps/web/tests/unit/lib/billing/subscription-status-resolver.test.ts`
- `apps/web/tests/unit/lib/blog/resolveAuthor.test.ts`
- `apps/web/tests/unit/lib/cache/tags.test.ts`
- `apps/web/tests/unit/lib/chat/ai-response-plumbing.test.ts`
- `apps/web/tests/unit/lib/chat/intent-response-sse-stream.test.ts`
- `apps/web/tests/unit/lib/chat/session-context.test.ts`
- `apps/web/tests/unit/lib/chat/submit-feedback.test.ts`
- `apps/web/tests/unit/lib/chat/system-prompt.test.ts`
- `apps/web/tests/unit/lib/contact-limit-entitlements.test.ts`
- `apps/web/tests/unit/lib/contact-limit.test.ts`
- `apps/web/tests/unit/lib/content-security-policy.test.ts`
- `apps/web/tests/unit/lib/cookies/consent-regions.test.ts`
- `apps/web/tests/unit/lib/cron/auth.test.ts`
- `apps/web/tests/unit/lib/csp-reporting.test.ts`
- `apps/web/tests/unit/lib/db/client/circuit-breaker.test.ts`
- `apps/web/tests/unit/lib/db/client/connection.test.ts`
- `apps/web/tests/unit/lib/db/client/retry.test.ts`
- `apps/web/tests/unit/lib/db/errors.test.ts`
- `apps/web/tests/unit/lib/db/queries/shared.test.ts`
- `apps/web/tests/unit/lib/db-session-guard.test.ts`
- `apps/web/tests/unit/lib/discography/release-track-loader.test.ts`
- `apps/web/tests/unit/lib/discography/spotify-import.test.ts`
- `apps/web/tests/unit/lib/discography/sync-profile-genres.test.ts`
- `apps/web/tests/unit/lib/distribution/instagram-activation.test.ts`
- `apps/web/tests/unit/lib/email/campaigns/processor.test.ts`
- `apps/web/tests/unit/lib/email/claim-invite-followup-template.test.ts`
- `apps/web/tests/unit/lib/email/claim-invite-template.test.ts`
- `apps/web/tests/unit/lib/email/jobs/enqueue.test.ts`
- `apps/web/tests/unit/lib/email/opt-in-token.test.ts`
- `apps/web/tests/unit/lib/email/release-day-notification-name.test.ts`
- `apps/web/tests/unit/lib/entitlement-boundary-helpers.test.ts`
- `apps/web/tests/unit/lib/entitlement-registry.test.ts`
- `apps/web/tests/unit/lib/entitlements/creator-plan.test.ts`
- `apps/web/tests/unit/lib/entitlements-billing-negative.test.ts`
- `apps/web/tests/unit/lib/entitlements-concurrency-isolation.test.ts`
- `apps/web/tests/unit/lib/entitlements-state-transitions.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/env-public.test.ts`
- `apps/web/tests/unit/lib/feature-flags-registry.test.ts`
- `apps/web/tests/unit/lib/feature-flags-server.test.ts`
- `apps/web/tests/unit/lib/featured-creators-timeout.test.ts`
- `apps/web/tests/unit/lib/fetch/deduped-fetch.test.ts`
- `apps/web/tests/unit/lib/fetch/useDedupedFetch.hook.test.tsx`
- `apps/web/tests/unit/lib/fit-scoring/calculator.test.ts`
- `apps/web/tests/unit/lib/fit-scoring/service.test.ts`
- `apps/web/tests/unit/lib/geo.test.ts`
- `apps/web/tests/unit/lib/http/server-fetch.test.ts`
- `apps/web/tests/unit/lib/idempotency.test.ts`
- `apps/web/tests/unit/lib/images/validate-magic-bytes.test.ts`
- `apps/web/tests/unit/lib/ingestion/magic-profile-avatar.test.ts`
- `apps/web/tests/unit/lib/ingestion/profile-enrichment.test.ts`
- `apps/web/tests/unit/lib/ingestion/session.test.ts`
- `apps/web/tests/unit/lib/ingestion/soundcloud-pro-badge.test.ts`
- `apps/web/tests/unit/lib/insights/chat-presentation.test.ts`
- `apps/web/tests/unit/lib/intent-detection/handlers/link-operations.test.ts`
- `apps/web/tests/unit/lib/intent-detection/handlers/profile-bio.test.ts`
- `apps/web/tests/unit/lib/intent-detection/handlers/profile-name.test.ts`
- `apps/web/tests/unit/lib/intent-detection/intent-classification.test.ts`
- `apps/web/tests/unit/lib/intent-detection/intent-router.test.ts`
- `apps/web/tests/unit/lib/leads/funnel-events.signup.test.ts`
- `apps/web/tests/unit/lib/leads/outreach-batch.test.ts`
- `apps/web/tests/unit/lib/migrations/handleMigrationErrors.test.ts`
- `apps/web/tests/unit/lib/notifications/domain.test.ts`
- `apps/web/tests/unit/lib/onboarding-return-to.test.ts`
- `apps/web/tests/unit/lib/plan-config.test.ts`
- `apps/web/tests/unit/lib/plan-gate-edge-cases.test.tsx`
- `apps/web/tests/unit/lib/plan-gate.test.tsx`
- `apps/web/tests/unit/lib/plan-prices.test.ts`
- `apps/web/tests/unit/lib/platform-detection/environment.test.ts`
- `apps/web/tests/unit/lib/playlists/curate-tracklist.test.ts`
- `apps/web/tests/unit/lib/profile/release-visibility.test.ts`
- `apps/web/tests/unit/lib/profile/shop-settings.test.ts`
- `apps/web/tests/unit/lib/profile-monetization.test.ts`
- `apps/web/tests/unit/lib/profile-next-action.test.ts`
- `apps/web/tests/unit/lib/proxy-url-mapping.test.ts`
- `apps/web/tests/unit/lib/queries/useAccountMutations.test.tsx`
- `apps/web/tests/unit/lib/queries/useBillingMutations.test.tsx`
- `apps/web/tests/unit/lib/queries/useSettingsMutation.test.tsx`
- `apps/web/tests/unit/lib/queries/useTaskMutations.test.tsx`
- `apps/web/tests/unit/lib/rate-limit/config.test.ts`
- `apps/web/tests/unit/lib/rate-limit/limiters.test.ts`
- `apps/web/tests/unit/lib/rate-limit/plan-aware-limiter.test.ts`
- `apps/web/tests/unit/lib/rate-limit/rate-limiter.test.ts`
- `apps/web/tests/unit/lib/referrals/service.critical.test.ts`
- `apps/web/tests/unit/lib/retargeting/claim-creatives.test.ts`
- `apps/web/tests/unit/lib/security/claim-token.test.ts`
- `apps/web/tests/unit/lib/security-headers.best-practices.test.ts`
- `apps/web/tests/unit/lib/security-headers.builders.test.ts`
- `apps/web/tests/unit/lib/security-headers.constants.test.ts`
- `apps/web/tests/unit/lib/security-headers.helpers.test.ts`
- `apps/web/tests/unit/lib/sentry/init-state.test.ts`
- `apps/web/tests/unit/lib/sentry/route-detector.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-config.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.config.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.misc.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.routes.test.ts`
- `apps/web/tests/unit/lib/services/insights/data-aggregator.test.ts`
- `apps/web/tests/unit/lib/services/insights/insight-generator.test.ts`
- `apps/web/tests/unit/lib/spotify/circuit-breaker.test.ts`
- `apps/web/tests/unit/lib/stripe/checkout-helpers.test.ts`
- `apps/web/tests/unit/lib/stripe/client.cache.test.ts`
- `apps/web/tests/unit/lib/stripe/customer-sync.auth.test.ts`
- `apps/web/tests/unit/lib/stripe/customer-sync.billing-info.test.ts`
- `apps/web/tests/unit/lib/stripe/customer-sync.errors.test.ts`
- `apps/web/tests/unit/lib/stripe/customer-sync.fallback.test.ts`
- `apps/web/tests/unit/lib/stripe/customer-sync.misc.test.ts`
- `apps/web/tests/unit/lib/stripe/customer-sync.queries.test.ts`
- `apps/web/tests/unit/lib/stripe/dunning.test.ts`
- `apps/web/tests/unit/lib/stripe/plan-change.critical.test.ts`
- `apps/web/tests/unit/lib/stripe/plan-change.test.ts`
- `apps/web/tests/unit/lib/stripe/retry.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/checkout-handler.critical.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/payment-handler.critical.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/payment-handler.failure.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/payment-handler.misc.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/payment-handler.success.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/subscription-handler.created.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/subscription-handler.deleted.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/subscription-handler.errors.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/subscription-handler.misc.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/subscription-handler.updated.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/utils.test.ts`
- `apps/web/tests/unit/lib/submission-agent/allmusic-provider.test.ts`
- `apps/web/tests/unit/lib/submission-agent/amazon-provider.test.ts`
- `apps/web/tests/unit/lib/submission-agent/discovery.test.ts`
- `apps/web/tests/unit/lib/submission-agent/email-package.test.ts`
- `apps/web/tests/unit/lib/submission-agent/monitor-worker.test.ts`
- `apps/web/tests/unit/lib/submission-agent/musicbrainz-provider.test.ts`
- `apps/web/tests/unit/lib/submission-agent/provider-registry.test.ts`
- `apps/web/tests/unit/lib/submission-agent/send-worker.test.ts`
- `apps/web/tests/unit/lib/submission-agent/service.test.ts`
- `apps/web/tests/unit/lib/submission-agent/xperi-release-sheet.test.ts`
- `apps/web/tests/unit/lib/testing/test-user-provision.server.test.ts`
- `apps/web/tests/unit/lib/tracking/consent.test.ts`
- `apps/web/tests/unit/lib/tracking/fire-subscribe-event.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/facebook.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/google.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/index.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/tiktok.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/types.test.ts`
- `apps/web/tests/unit/lib/tracking/track-helpers.test.ts`
- `apps/web/tests/unit/lib/username/sync.test.ts`
- `apps/web/tests/unit/lib/username-sync.test.ts`
- `apps/web/tests/unit/lib/utils/csv.blob.test.ts`
- `apps/web/tests/unit/lib/utils/csv.conversion.test.ts`
- `apps/web/tests/unit/lib/utils/ip-extraction.test.ts`
- `apps/web/tests/unit/lib/validation/profile-mode-reserved.test.ts`
- `apps/web/tests/unit/lib/verification/notifications.test.ts`
- `apps/web/tests/unit/lib/waitlist/approval.test.ts`
- `apps/web/tests/unit/lib/webhooks/recent-dispatch.test.ts`
- `apps/web/tests/unit/links/IngestedSuggestions.accept.test.tsx`
- `apps/web/tests/unit/links/IngestedSuggestions.analytics.test.tsx`
- `apps/web/tests/unit/links/IngestedSuggestions.dismiss.test.tsx`
- `apps/web/tests/unit/links/IngestedSuggestions.edge-cases.test.tsx`
- `apps/web/tests/unit/links/QuickAddSuggestions.test.tsx`
- `apps/web/tests/unit/links/SortableLinkItem.test.tsx`
- `apps/web/tests/unit/links/buildPillLabel.test.ts`
- `apps/web/tests/unit/links/link-categorization.test.ts`
- `apps/web/tests/unit/links/useLinksManager.add.test.ts`
- `apps/web/tests/unit/links/useLinksManager.init.test.ts`
- `apps/web/tests/unit/links/useLinksManager.youtube.test.ts`
- `apps/web/tests/unit/links/useLinksPersistence.test.ts`
- `apps/web/tests/unit/links/useSuggestions.accept.test.ts`
- `apps/web/tests/unit/links/useSuggestions.analytics.test.ts`
- `apps/web/tests/unit/links/useSuggestions.dismiss.test.ts`
- `apps/web/tests/unit/links/useSuggestions.init.test.ts`
- `apps/web/tests/unit/links/useSuggestions.sync.test.ts`
- `apps/web/tests/unit/marketing/artist-profile/ArtistProfileOutcomeDuo.test.tsx`
- `apps/web/tests/unit/marketing/artist-profile/ArtistProfileOutcomesCarousel.test.ts`
- `apps/web/tests/unit/marketing/artist-profile/ArtistProfileSpecWall.test.tsx`
- `apps/web/tests/unit/marketing/static-revalidate-policy.test.ts`
- `apps/web/tests/unit/middleware/proxy-behavioral.test.ts`
- `apps/web/tests/unit/middleware/proxy-composition.critical.test.ts`
- `apps/web/tests/unit/music-discography.test.ts`
- `apps/web/tests/unit/onboarding/checkout-page.test.ts`
- `apps/web/tests/unit/onboarding/onboarding-checkout.test.tsx`
- `apps/web/tests/unit/onboarding-display-name-validation.test.ts`
- `apps/web/tests/unit/onboarding-step-navigation.test.ts`
- `apps/web/tests/unit/onboarding-verify-avatar.test.ts`
- `apps/web/tests/unit/organisms/AvatarUpload.test.tsx`
- `apps/web/tests/unit/organisms/ReleasePitchSection.test.tsx`
- `apps/web/tests/unit/organisms/TipSection.test.tsx`
- `apps/web/tests/unit/organisms/release-credits-action.test.ts`
- `apps/web/tests/unit/organisms/table/TableContextMenu.test.tsx`
- `apps/web/tests/unit/organisms/table/VirtualizedTableBody.test.tsx`
- `apps/web/tests/unit/organisms/table/VirtualizedTableRow.test.tsx`
- `apps/web/tests/unit/product-screenshots/screenshot-cleanliness.test.ts`
- `apps/web/tests/unit/product-screenshots/screenshot-registry.test.ts`
- `apps/web/tests/unit/profile/ArtistContactsButton.test.tsx`
- `apps/web/tests/unit/profile/ProfileDrawerShell.test.tsx`
- `apps/web/tests/unit/profile/ProfileFeaturedCard.test.ts`
- `apps/web/tests/unit/profile/ProfileInlineNotificationsCTA.test.tsx`
- `apps/web/tests/unit/profile/ProfileIntentPage.test.tsx`
- `apps/web/tests/unit/profile/ProfileMenuDrawer.test.tsx`
- `apps/web/tests/unit/profile/ProfileModeDrawer.test.tsx`
- `apps/web/tests/unit/profile/ProfileNotificationsButton.test.tsx`
- `apps/web/tests/unit/profile/ProfileNotificationsContext.test.tsx`
- `apps/web/tests/unit/profile/ProfilePrimaryActionCard.test.tsx`
- `apps/web/tests/unit/profile/ProfilePrimaryCTA.loading.test.tsx`
- `apps/web/tests/unit/profile/ProfilePrimaryCTA.test.tsx`
- `apps/web/tests/unit/profile/ProfileQuickActions.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.accessibility.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.dsp-preferences.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.mode-override.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.notifications.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.tour.test.tsx`
- `apps/web/tests/unit/profile/ProfileUnifiedDrawerReleases.test.tsx`
- `apps/web/tests/unit/profile/ProgressiveArtistPage.test.tsx`
- `apps/web/tests/unit/profile/PublicProfileTemplateV2.history.test.tsx`
- `apps/web/tests/unit/profile/TourModePanel.test.tsx`
- `apps/web/tests/unit/profile/TourRouteRedirect.test.tsx`
- `apps/web/tests/unit/profile/avatar-quality.test.ts`
- `apps/web/tests/unit/profile/bot-detection.test.ts`
- `apps/web/tests/unit/profile/cache-invalidation.test.ts`
- `apps/web/tests/unit/profile/completion.test.ts`
- `apps/web/tests/unit/profile/contacts-mapper.test.ts`
- `apps/web/tests/unit/profile/dsp-sync-surfaces.test.ts`
- `apps/web/tests/unit/profile/featured-playlist-fallback-discovery.test.ts`
- `apps/web/tests/unit/profile/featured-playlist-fallback-web.test.ts`
- `apps/web/tests/unit/profile/featured-playlist-fallback.test.ts`
- `apps/web/tests/unit/profile/inline-notifications-cta.test.tsx`
- `apps/web/tests/unit/profile/notifications-otp-step.test.tsx`
- `apps/web/tests/unit/profile/otp-input-comprehensive.test.tsx`
- `apps/web/tests/unit/profile/profile-card-layout.test.tsx`
- `apps/web/tests/unit/profile/profile-compact-template.test.tsx`
- `apps/web/tests/unit/profile/profile-components.test.tsx`
- `apps/web/tests/unit/profile/profile-edge-cases.test.tsx`
- `apps/web/tests/unit/profile/profile-layout-shift.test.tsx`
- `apps/web/tests/unit/profile/profile-links.test.tsx`
- `apps/web/tests/unit/profile/profile-next-action.test.ts`
- `apps/web/tests/unit/profile/profile-photo-context-menu.test.tsx`
- `apps/web/tests/unit/profile/profile-service-mutations.test.ts`
- `apps/web/tests/unit/profile/profile-service-queries.test.ts`
- `apps/web/tests/unit/profile/profile-shell-token-contract.test.ts`
- `apps/web/tests/unit/profile/profile-v2-layout.test.tsx`
- `apps/web/tests/unit/profile/profile-v2-presentation.test.ts`
- `apps/web/tests/unit/profile/profile-view-api.test.ts`
- `apps/web/tests/unit/profile/public-profile-contract-guard.test.ts`
- `apps/web/tests/unit/profile/public-profile-page.test.ts`
- `apps/web/tests/unit/profile/public-profile-template-v2.test.ts`
- `apps/web/tests/unit/profile/registry.test.ts`
- `apps/web/tests/unit/profile/social-link-limits.test.ts`
- `apps/web/tests/unit/profile/static-artist-page.test.tsx`
- `apps/web/tests/unit/profile/subscription-form-states.test.tsx`
- `apps/web/tests/unit/profile/subscription-sms-flow.test.tsx`
- `apps/web/tests/unit/profile/subscription-success-name-capture.test.tsx`
- `apps/web/tests/unit/profile/type-conversions.test.ts`
- `apps/web/tests/unit/profile/useProfileTracking.test.tsx`
- `apps/web/tests/unit/profile/useSubscriptionForm.test.tsx`
- `apps/web/tests/unit/profile/view-metadata.test.ts`
- `apps/web/tests/unit/profile/view-models.test.ts`
- `apps/web/tests/unit/profile/view-registry.test.ts`
- `apps/web/tests/unit/providers/clerk-availability.test.ts`
- `apps/web/tests/unit/public-page-error-fallback.test.tsx`
- `apps/web/tests/unit/public-surface/public-surface-shell.test.tsx`
- `apps/web/tests/unit/release/mystery-release-page.test.tsx`
- `apps/web/tests/unit/release/pre-save-actions.test.tsx`
- `apps/web/tests/unit/release/release-artist-link.test.tsx`
- `apps/web/tests/unit/release/release-landing-page.test.tsx`
- `apps/web/tests/unit/release/scheduled-release-page.test.tsx`
- `apps/web/tests/unit/release/smart-link-metadata.test.ts`
- `apps/web/tests/unit/release/smart-link-provider-button.test.tsx`
- `apps/web/tests/unit/release/smart-link-shell.test.tsx`
- `apps/web/tests/unit/release/smart-link-slug-parser.test.ts`
- `apps/web/tests/unit/release/sounds-landing-page.test.tsx`
- `apps/web/tests/unit/release-tasks/catalog-task-builder-dialog.test.tsx`
- `apps/web/tests/unit/release-tasks/classify-task-cluster.test.ts`
- `apps/web/tests/unit/release-tasks/cluster-filter-chips.test.tsx`
- `apps/web/tests/unit/release-tasks/default-template.test.ts`
- `apps/web/tests/unit/release-tasks/release-plan-wizard.test.tsx`
- `apps/web/tests/unit/release-tasks/select-tasks.test.ts`
- `apps/web/tests/unit/release-tasks/task-logic.test.ts`
- `apps/web/tests/unit/routes/route-coverage.test.ts`
- `apps/web/tests/unit/scripts/browse-auth-script.test.ts`
- `apps/web/tests/unit/seed-data-coverage.test.ts`
- `apps/web/tests/unit/services/pitch/pitch-generator.test.ts`
- `apps/web/tests/unit/services/pitch/prompts.test.ts`
- `apps/web/tests/unit/settings/SettingsBillingSection.test.tsx`
- `apps/web/tests/unit/sidebar-row-alignment.test.tsx`
- `apps/web/tests/unit/signup-claim-storage.test.ts`
- `apps/web/tests/unit/simple-tooltip.test.tsx`
- `apps/web/tests/unit/tipping/DashboardTipping.empty-state.test.tsx`
- `apps/web/tests/unit/tipping/EmptyStates.test.tsx`
- `apps/web/tests/unit/tooltip.test.tsx`
- `apps/web/tests/unit/tour-date-sidebar-analytics.test.tsx`
- `apps/web/tests/unit/tracking/instantly-pixel.test.tsx`
- `apps/web/tests/unit/tracking/useTrackingMutation.test.tsx`
- `apps/web/tests/unit/url-sanitization.test.ts`
- `apps/web/tests/unit/use-clerk-safe.test.tsx`
- `apps/web/tests/unit/useFormState.test.tsx`
- `apps/web/tests/unit/validation/career-highlights.test.ts`
- `apps/web/tests/unit/validation/payments.test.ts`
- `apps/web/tests/unit/validation/pitch-context.test.ts`
- `apps/web/tests/unit/youtube/fetch-youtube-metadata.test.ts`
- `packages/ui/atoms/alert-dialog.test.tsx`
- `packages/ui/atoms/button.test.tsx`
- `packages/ui/atoms/checkbox.test.tsx`
- `packages/ui/atoms/common-dropdown.test.tsx`
- `packages/ui/atoms/context-menu.test.tsx`
- `packages/ui/atoms/dialog.test.tsx`
- `packages/ui/atoms/dropdown-menu.test.tsx`
- `packages/ui/atoms/field.test.tsx`
- `packages/ui/atoms/form.test.tsx`
- `packages/ui/atoms/input-group.test.tsx`
- `packages/ui/atoms/input.test.tsx`
- `packages/ui/atoms/kbd.test.tsx`
- `packages/ui/atoms/label.test.tsx`
- `packages/ui/atoms/popover.test.tsx`
- `packages/ui/atoms/searchable-submenu.test.tsx`
- `packages/ui/atoms/segment-control.test.tsx`
- `packages/ui/atoms/select.test.tsx`
- `packages/ui/atoms/sheet.test.tsx`
- `packages/ui/atoms/simple-tooltip.test.tsx`
- `packages/ui/atoms/switch.test.tsx`
- `packages/ui/atoms/textarea.test.tsx`
- `packages/ui/atoms/tooltip-shortcut.test.tsx`
- `packages/ui/atoms/tooltip.test.tsx`
- `packages/ui/lib/dropdown-styles.test.ts`
- `packages/ui/lib/overlay-styles.test.ts`
- `tests/lib/listen-routing.test.ts`
- `tests/lib/provider-links.test.ts`

Dev Docs
- `docs/WEBHOOK_MAP.md`

User Docs
- `apps/docs/app/docs/plans-pricing/page.mdx`
- `apps/docs/app/docs/features/tips/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Subscribe / Follow Page</strong> — Shipped (flagged) — free+</summary>

Public subscription page, preference capture, confirmation flows, and subscribe UX experiments.

- Tier: P0
- Hardening rank: 5
- Flags: `SUBSCRIBE_TWO_STEP`, `SUBSCRIBE_CTA_EXPERIMENT`, `experiment_subscribe_cta_variant`
- Entitlements: none
- Unit coverage: 56.5% across 18 files
- E2E coverage: 13 specs

Pages
- `/artist-notifications` — `apps/web/app/(marketing)/artist-notifications/page.tsx`
- `/[username]/notifications` — `apps/web/app/[username]/notifications/page.tsx`
- `/[username]/subscribe` — `apps/web/app/[username]/subscribe/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/audience/opt-in` (public) — `apps/web/app/api/audience/opt-in/route.ts`
- `/api/audience/unsubscribe` (public) — `apps/web/app/api/audience/unsubscribe/route.ts`
- `/api/notifications/confirm` (public) — `apps/web/app/api/notifications/confirm/route.ts`
- `/api/notifications/preferences` (public) — `apps/web/app/api/notifications/preferences/route.ts`
- `/api/notifications/status` (public) — `apps/web/app/api/notifications/status/route.ts`
- `/api/notifications/subscribe` (public) — `apps/web/app/api/notifications/subscribe/route.ts`
- `/api/notifications/unsubscribe/one-click` (public) — `apps/web/app/api/notifications/unsubscribe/one-click/route.ts`
- `/api/notifications/unsubscribe` (public) — `apps/web/app/api/notifications/unsubscribe/route.ts`
- `/api/notifications/update-birthday` (public) — `apps/web/app/api/notifications/update-birthday/route.ts`
- `/api/notifications/update-name` (public) — `apps/web/app/api/notifications/update-name/route.ts`
- `/api/notifications/verify-email-otp` (public) — `apps/web/app/api/notifications/verify-email-otp/route.ts`

Server Actions
- none

Tables
- `categorySubscriptions` — `apps/web/lib/db/schema/suppression.ts`
- `notificationSubscriptions` — `apps/web/lib/db/schema/analytics.ts`
- `unsubscribeTokens` — `apps/web/lib/db/schema/suppression.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/components/features/dashboard/organisms/AnalyticsSidebar.test.tsx`
- `apps/web/lib/__tests__/changelog-parser.test.ts`
- `apps/web/tests/contracts/dashboard-apis.nightly.test.ts`
- `apps/web/tests/e2e/admin-visual-regression.spec.ts`
- `apps/web/tests/e2e/artist-notifications.spec.ts`
- `apps/web/tests/e2e/content-gate.spec.ts`
- `apps/web/tests/e2e/payment-complete-flow.spec.ts`
- `apps/web/tests/e2e/profile-cls-audit.spec.ts`
- `apps/web/tests/e2e/profile-drawers.spec.ts`
- `apps/web/tests/e2e/profile-subscribe-e2e.spec.ts`
- `apps/web/tests/e2e/profile-visual-audit.spec.ts`
- `apps/web/tests/e2e/profile.spec.ts`
- `apps/web/tests/e2e/public-profile-smoke.spec.ts`
- `apps/web/tests/e2e/smoke-public.spec.ts`
- `apps/web/tests/e2e/tim-white-profile-showcase.spec.ts`
- `apps/web/tests/e2e/yc-demo.spec.ts`
- `apps/web/tests/lib/admin/stripe-metrics.test.ts`
- `apps/web/tests/lib/hud/metrics.test.ts`
- `apps/web/tests/lib/notifications/preferences.test.ts`
- `apps/web/tests/lib/notifications/providers/resend.test.ts`
- `apps/web/tests/lib/notifications/sender-policy.test.ts`
- `apps/web/tests/lib/notifications/service.test.ts`
- `apps/web/tests/lib/notifications/suppression.test.ts`
- `apps/web/tests/lib/notifications/validation.test.ts`
- `apps/web/tests/lib/queries/query-refetch-policy.test.ts`
- `apps/web/tests/lib/queries/useBillingMutations.test.tsx`
- `apps/web/tests/lib/queries/useNotificationStatusQuery.test.ts`
- `apps/web/tests/unit/admin/AdminConversionFunnelSection.test.tsx`
- `apps/web/tests/unit/admin/conversion-funnel.test.ts`
- `apps/web/tests/unit/api/admin/outreach-route.test.ts`
- `apps/web/tests/unit/api/admin/overview.test.ts`
- `apps/web/tests/unit/api/admin/waitlist-approve.test.ts`
- `apps/web/tests/unit/api/changelog/changelog-unsubscribe.test.ts`
- `apps/web/tests/unit/api/changelog/changelog-verify.test.ts`
- `apps/web/tests/unit/api/changelog/subscribe.test.ts`
- `apps/web/tests/unit/api/cron/data-retention.test.ts`
- `apps/web/tests/unit/api/cron/frequent.test.ts`
- `apps/web/tests/unit/api/cron/process-campaigns.test.ts`
- `apps/web/tests/unit/api/cron/schedule-release-notifications.test.ts`
- `apps/web/tests/unit/api/cron/send-release-notifications.test.ts`
- `apps/web/tests/unit/api/feedback/route.test.ts`
- `apps/web/tests/unit/api/notifications/status.test.ts`
- `apps/web/tests/unit/api/notifications/subscribe.test.ts`
- `apps/web/tests/unit/api/notifications/unsubscribe.test.ts`
- `apps/web/tests/unit/api/notifications/verify-email-otp.test.ts`
- `apps/web/tests/unit/api/stripe/plan-change-preview.test.ts`
- `apps/web/tests/unit/api/unsubscribe/claim-invites.test.ts`
- `apps/web/tests/unit/api/waitlist/waitlist.test.ts`
- `apps/web/tests/unit/api/webhooks/resend-route.test.ts`
- `apps/web/tests/unit/app/artist-notifications-page.test.tsx`
- `apps/web/tests/unit/chat/ChatMessage.analytics-card.test.tsx`
- `apps/web/tests/unit/chat/greeting.test.ts`
- `apps/web/tests/unit/components/profile/useProfileNotificationsController.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardAudienceTable.test.tsx`
- `apps/web/tests/unit/dashboard/FirstFanCelebration.test.tsx`
- `apps/web/tests/unit/dashboard/dashboard-clerk-safe.test.tsx`
- `apps/web/tests/unit/demo/DemoTimWhiteProfileSurface.test.tsx`
- `apps/web/tests/unit/lib/auth/clerk-webhook-handlers.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-webhook-registry.test.ts`
- `apps/web/tests/unit/lib/chat/submit-feedback.test.ts`
- `apps/web/tests/unit/lib/email/campaigns/processor.test.ts`
- `apps/web/tests/unit/lib/email/release-day-notification-name.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/feature-flags-server.test.ts`
- `apps/web/tests/unit/lib/insights/chat-presentation.test.ts`
- `apps/web/tests/unit/lib/leads/outreach-batch.test.ts`
- `apps/web/tests/unit/lib/notifications/domain.test.ts`
- `apps/web/tests/unit/lib/queries/useBillingMutations.test.tsx`
- `apps/web/tests/unit/lib/referrals/service.critical.test.ts`
- `apps/web/tests/unit/lib/services/insights/data-aggregator.test.ts`
- `apps/web/tests/unit/lib/services/insights/insight-generator.test.ts`
- `apps/web/tests/unit/lib/stripe/dunning.test.ts`
- `apps/web/tests/unit/lib/tracking/fire-subscribe-event.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/facebook.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/types.test.ts`
- `apps/web/tests/unit/lib/validation/profile-mode-reserved.test.ts`
- `apps/web/tests/unit/lib/verification/notifications.test.ts`
- `apps/web/tests/unit/marketing/changelog-email-signup.test.tsx`
- `apps/web/tests/unit/product-screenshots/screenshot-registry.test.ts`
- `apps/web/tests/unit/profile/ProfileFeaturedCard.test.ts`
- `apps/web/tests/unit/profile/ProfileInlineNotificationsCTA.test.tsx`
- `apps/web/tests/unit/profile/ProfileMenuDrawer.test.tsx`
- `apps/web/tests/unit/profile/ProfileModeDrawer.test.tsx`
- `apps/web/tests/unit/profile/ProfileNotificationsContext.test.tsx`
- `apps/web/tests/unit/profile/ProfilePrimaryCTA.loading.test.tsx`
- `apps/web/tests/unit/profile/ProfilePrimaryCTA.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.dsp-preferences.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.mode-override.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.notifications.test.tsx`
- `apps/web/tests/unit/profile/ProfileUnifiedDrawerReleases.test.tsx`
- `apps/web/tests/unit/profile/PublicProfileTemplateV2.history.test.tsx`
- `apps/web/tests/unit/profile/TourModePanel.test.tsx`
- `apps/web/tests/unit/profile/inline-notifications-cta.test.tsx`
- `apps/web/tests/unit/profile/notifications-otp-step.test.tsx`
- `apps/web/tests/unit/profile/profile-compact-template.test.tsx`
- `apps/web/tests/unit/profile/profile-edge-cases.test.tsx`
- `apps/web/tests/unit/profile/profile-layout-shift.test.tsx`
- `apps/web/tests/unit/profile/profile-v2-presentation.test.ts`
- `apps/web/tests/unit/profile/public-profile-page.test.ts`
- `apps/web/tests/unit/profile/registry.test.ts`
- `apps/web/tests/unit/profile/subscription-form-states.test.tsx`
- `apps/web/tests/unit/profile/subscription-sms-flow.test.tsx`
- `apps/web/tests/unit/profile/subscription-success-name-capture.test.tsx`
- `apps/web/tests/unit/profile/useSubscriptionForm.test.tsx`
- `apps/web/tests/unit/profile/view-metadata.test.ts`
- `apps/web/tests/unit/profile/view-registry.test.ts`

Dev Docs
- `docs/STATSIG_FEATURE_GATES.md`

User Docs
- `apps/docs/app/docs/features/profile/page.mdx`
- `apps/docs/app/docs/features/audience/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Release Notifications</strong> — Shipped — pro+</summary>

Creator-facing notification scheduling and background delivery for release-drop emails.

- Tier: P0
- Hardening rank: 6
- Flags: none
- Entitlements: `canSendNotifications`
- Unit coverage: 23.8% across 3 files
- E2E coverage: 1 specs

Pages
- `/app/settings/notifications` — `apps/web/app/app/(shell)/settings/notifications/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/cron/schedule-release-notifications` (cron) — `apps/web/app/api/cron/schedule-release-notifications/route.ts`
- `/api/cron/send-release-notifications` (cron) — `apps/web/app/api/cron/send-release-notifications/route.ts`

Server Actions
- none

Tables
- `fanReleaseNotifications` — `apps/web/lib/db/schema/dsp-enrichment.ts`
- `notificationDeliveryLog` — `apps/web/lib/db/schema/suppression.ts`

Jobs
- `/api/cron/schedule-release-notifications` — callable only
- `/api/cron/send-release-notifications` — callable only

Webhooks
- none

Mapped Tests
- `apps/web/tests/e2e/artist-notifications.spec.ts`
- `apps/web/tests/unit/api/cron/data-retention.test.ts`
- `apps/web/tests/unit/api/cron/frequent.test.ts`
- `apps/web/tests/unit/api/cron/schedule-release-notifications.test.ts`
- `apps/web/tests/unit/api/cron/send-release-notifications.test.ts`
- `apps/web/tests/unit/lib/entitlement-registry.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/plan-config.test.ts`
- `apps/web/tests/unit/lib/plan-gate-edge-cases.test.tsx`

Dev Docs
- `docs/CRON_REGISTRY.md`

User Docs
- `apps/docs/app/docs/features/releases/page.mdx`
- `apps/docs/app/docs/features/audience/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Tips, Earnings & Stripe Connect</strong> — Shipped (flagged) — pro+ / max</summary>

Fan tipping, earnings summaries, payout onboarding, and Stripe Connect rollout plumbing.

- Tier: P0
- Hardening rank: 7
- Flags: `STRIPE_CONNECT_ENABLED`
- Entitlements: `canAccessTipping`, `canAccessStripeConnect`
- Unit coverage: 66.9% across 5 files
- E2E coverage: 10 specs

Pages
- `/[username]/pay` — `apps/web/app/[username]/pay/page.tsx`
- `/[username]/tip` — `apps/web/app/[username]/tip/page.tsx`
- `/app/dashboard/earnings` — `apps/web/app/app/(shell)/dashboard/earnings/page.tsx`
- `/app/dashboard/tipping` — `apps/web/app/app/(shell)/dashboard/tipping/page.tsx`
- `/app/settings/payments` — `apps/web/app/app/(shell)/settings/payments/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/create-tip-intent` (auth) — `apps/web/app/api/create-tip-intent/route.ts`
- `/api/dashboard/earnings` (public) — `apps/web/app/api/dashboard/earnings/route.ts`
- `/api/dashboard/monetization-summary` (public) — `apps/web/app/api/dashboard/monetization-summary/route.ts`
- `/api/stripe-connect/disconnect` (public) — `apps/web/app/api/stripe-connect/disconnect/route.ts`
- `/api/stripe-connect/onboard` (public) — `apps/web/app/api/stripe-connect/onboard/route.ts`
- `/api/stripe-connect/return` (public) — `apps/web/app/api/stripe-connect/return/route.ts`
- `/api/stripe-connect/status` (public) — `apps/web/app/api/stripe-connect/status/route.ts`
- `/api/tips/create-checkout` (public) — `apps/web/app/api/tips/create-checkout/route.ts`
- `/api/webhooks/stripe-connect` (webhook) — `apps/web/app/api/webhooks/stripe-connect/route.ts`
- `/api/webhooks/stripe-tips` (webhook) — `apps/web/app/api/webhooks/stripe-tips/route.ts`

Server Actions
- none

Tables
- `tipAudience` — `apps/web/lib/db/schema/tip-audience.ts`
- `tips` — `apps/web/lib/db/schema/analytics.ts`

Jobs
- none

Webhooks
- `/api/webhooks/stripe-connect` — stripe-connect
- `/api/webhooks/stripe-tips` — stripe-tips

Mapped Tests
- `apps/web/components/molecules/filters/TableFilterDropdown.test.tsx`
- `apps/web/lib/__tests__/changelog-parser.test.ts`
- `apps/web/lib/canonical-surfaces.test.ts`
- `apps/web/lib/keyboard-shortcuts.test.ts`
- `apps/web/scripts/performance-end-user-loop.test.ts`
- `apps/web/scripts/performance-optimizer-lib.test.ts`
- `apps/web/tests/components/dashboard/socials-form/VerificationModal.test.tsx`
- `apps/web/tests/components/release-provider-matrix/ReleaseFilterDropdown.test.tsx`
- `apps/web/tests/e2e/chaos-authenticated.spec.ts`
- `apps/web/tests/e2e/content-gate.spec.ts`
- `apps/web/tests/e2e/golden-path-app.spec.ts`
- `apps/web/tests/e2e/payment-complete-flow.spec.ts`
- `apps/web/tests/e2e/pro-feature-gates.spec.ts`
- `apps/web/tests/e2e/public-profile-smoke.spec.ts`
- `apps/web/tests/e2e/resilience.spec.ts`
- `apps/web/tests/e2e/smoke-auth.spec.ts`
- `apps/web/tests/e2e/tip-promo.spec.ts`
- `apps/web/tests/e2e/tipping.spec.ts`
- `apps/web/tests/lib/queries/query-refetch-policy.test.ts`
- `apps/web/tests/unit/TipPromo.test.tsx`
- `apps/web/tests/unit/TruncatedText.test.tsx`
- `apps/web/tests/unit/api/dashboard/earnings.test.ts`
- `apps/web/tests/unit/api/dev/test-auth-routes.test.ts`
- `apps/web/tests/unit/api/tip/create-tip-intent.test.ts`
- `apps/web/tests/unit/api/webhooks/stripe-connect.test.ts`
- `apps/web/tests/unit/api/webhooks/stripe-tips.test.ts`
- `apps/web/tests/unit/app/ProfileCompletionRedirect.test.tsx`
- `apps/web/tests/unit/app/dashboard-earnings-page.test.tsx`
- `apps/web/tests/unit/app/surface-elevation-guardrails.test.ts`
- `apps/web/tests/unit/auth/waitlist-gating.test.ts`
- `apps/web/tests/unit/chat/ChatPageClient.test.tsx`
- `apps/web/tests/unit/chat/ProfilePageChat.test.tsx`
- `apps/web/tests/unit/chat/ai-operations.test.ts`
- `apps/web/tests/unit/chat/chat-context.test.ts`
- `apps/web/tests/unit/chat/greeting.test.ts`
- `apps/web/tests/unit/chat/intent-classification.test.ts`
- `apps/web/tests/unit/components/atoms/AppIconButton.test.tsx`
- `apps/web/tests/unit/components/table/PageToolbar.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardDataContext.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardNav.test.tsx`
- `apps/web/tests/unit/dashboard/EarningsTabTippers.test.tsx`
- `apps/web/tests/unit/dashboard/HeaderProfileProgress.test.tsx`
- `apps/web/tests/unit/dashboard/ProfileCompletionCard.test.tsx`
- `apps/web/tests/unit/dashboard/ProfileTipsSurface.test.tsx`
- `apps/web/tests/unit/dashboard/RecentChats.test.tsx`
- `apps/web/tests/unit/dashboard/SettingsPaySection.test.tsx`
- `apps/web/tests/unit/dashboard/SmartActionCards.test.tsx`
- `apps/web/tests/unit/dashboard/TasksPageClient.test.tsx`
- `apps/web/tests/unit/dashboard/dashboard-data-prefetch.test.ts`
- `apps/web/tests/unit/dashboard/platform-category.test.ts`
- `apps/web/tests/unit/demo/demo-releases-experience.test.tsx`
- `apps/web/tests/unit/home/HomeAdaptiveProfileStory.test.tsx`
- `apps/web/tests/unit/lib/audience/activity-grammar.test.ts`
- `apps/web/tests/unit/lib/auth/dev-test-auth.server.test.ts`
- `apps/web/tests/unit/lib/chat/system-prompt.test.ts`
- `apps/web/tests/unit/lib/entitlement-registry.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/plan-config.test.ts`
- `apps/web/tests/unit/lib/profile-monetization.test.ts`
- `apps/web/tests/unit/lib/proxy-url-mapping.test.ts`
- `apps/web/tests/unit/lib/referrals/service.critical.test.ts`
- `apps/web/tests/unit/lib/services/insights/data-aggregator.test.ts`
- `apps/web/tests/unit/lib/services/insights/insight-generator.test.ts`
- `apps/web/tests/unit/links/link-categorization.test.ts`
- `apps/web/tests/unit/links/link-display-utils.test.ts`
- `apps/web/tests/unit/links/useLinksManager.add.test.ts`
- `apps/web/tests/unit/molecules/TipSelector.test.tsx`
- `apps/web/tests/unit/onboarding/onboarding-checkout.test.tsx`
- `apps/web/tests/unit/organisms/TipSection.test.tsx`
- `apps/web/tests/unit/profile/ProfileUnifiedDrawerReleases.test.tsx`
- `apps/web/tests/unit/profile/profile-links.test.tsx`
- `apps/web/tests/unit/simple-tooltip.test.tsx`
- `apps/web/tests/unit/tipping/DashboardTipping.empty-state.test.tsx`
- `apps/web/tests/unit/tooltip.test.tsx`
- `packages/ui/atoms/simple-tooltip.test.tsx`
- `packages/ui/atoms/tooltip-shortcut.test.tsx`
- `packages/ui/atoms/tooltip.test.tsx`

Dev Docs
- `docs/WEBHOOK_MAP.md`

User Docs
- `apps/docs/app/docs/features/tips/page.mdx`
- `apps/docs/app/docs/self-serve-guide/set-up-tipping/page.mdx`
- `apps/docs/app/docs/plans-pricing/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Webhooks, Crons & Automation</strong> — Shipped — internal</summary>

Cross-cutting webhook verification, durable dispatch, and scheduled job orchestration.

- Tier: P0
- Hardening rank: 8
- Flags: none
- Entitlements: none
- Unit coverage: 69.3% across 18 files
- E2E coverage: 6 specs

Pages
- none

Non-API Route Handlers
- none

API Route Handlers
- `/api/clerk/webhook` (webhook) — `apps/web/app/api/clerk/webhook/route.ts`
- `/api/cron/cleanup-idempotency-keys` (cron) — `apps/web/app/api/cron/cleanup-idempotency-keys/route.ts`
- `/api/cron/cleanup-photos` (cron) — `apps/web/app/api/cron/cleanup-photos/route.ts`
- `/api/cron/daily-maintenance` (cron) — `apps/web/app/api/cron/daily-maintenance/route.ts`
- `/api/cron/data-retention` (cron) — `apps/web/app/api/cron/data-retention/route.ts`
- `/api/cron/frequent` (cron) — `apps/web/app/api/cron/frequent/route.ts`
- `/api/cron/process-ingestion-jobs` (cron) — `apps/web/app/api/cron/process-ingestion-jobs/route.ts`
- `/api/cron/summarize-interviews` (cron) — `apps/web/app/api/cron/summarize-interviews/route.ts`
- `/api/user-interviews` (public) — `apps/web/app/api/user-interviews/route.ts`
- `/api/webhooks/linear` (webhook) — `apps/web/app/api/webhooks/linear/route.ts`
- `/api/webhooks/resend` (webhook) — `apps/web/app/api/webhooks/resend/route.ts`
- `/api/webhooks/sentry` (webhook) — `apps/web/app/api/webhooks/sentry/route.ts`

Server Actions
- none

Tables
- `webhookEvents` — `apps/web/lib/db/schema/suppression.ts`

Jobs
- `/api/cron/cleanup-idempotency-keys` — callable only
- `/api/cron/cleanup-photos` — callable only
- `/api/cron/daily-maintenance` — `0 0 * * *`
- `/api/cron/data-retention` — callable only
- `/api/cron/frequent` — `*/15 * * * *`
- `/api/cron/process-ingestion-jobs` — `* * * * *`
- `/api/cron/summarize-interviews` — callable only

Webhooks
- `/api/clerk/webhook` — clerk
- `/api/webhooks/linear` — linear
- `/api/webhooks/resend` — resend
- `/api/webhooks/sentry` — sentry

Mapped Tests
- `apps/web/lib/__tests__/changelog-parser.test.ts`
- `apps/web/lib/admin/reliability.test.ts`
- `apps/web/tests/app/sitemap.test.ts`
- `apps/web/tests/contracts/dashboard-apis.nightly.test.ts`
- `apps/web/tests/e2e/admin-gtm-health.spec.ts`
- `apps/web/tests/e2e/drawer-profile-editing.spec.ts`
- `apps/web/tests/e2e/musicfetch-coverage.spec.ts`
- `apps/web/tests/e2e/resilience.spec.ts`
- `apps/web/tests/e2e/sentry-red-lane.spec.ts`
- `apps/web/tests/e2e/sentry.spec.ts`
- `apps/web/tests/lib/admin/sentry-metrics.test.ts`
- `apps/web/tests/lib/discography/provider-links-deezer.test.ts`
- `apps/web/tests/lib/discography/provider-links-musicfetch.test.ts`
- `apps/web/tests/lib/dsp-enrichment/musicfetch-provider.test.ts`
- `apps/web/tests/lib/monitoring/performance.test.ts`
- `apps/web/tests/lib/monitoring/user-journey.test.ts`
- `apps/web/tests/lib/musicfetch.test.ts`
- `apps/web/tests/lib/queries/mutation-utils.test.ts`
- `apps/web/tests/lib/queries/useBillingMutations.test.tsx`
- `apps/web/tests/lib/queries/useDashboardSocialLinksQuery.test.tsx`
- `apps/web/tests/product-screenshots/catalog.spec.ts`
- `apps/web/tests/unit/ErrorBoundary.test.tsx`
- `apps/web/tests/unit/actions/onboarding/profile-setup.test.ts`
- `apps/web/tests/unit/actions/onboarding/validation.test.ts`
- `apps/web/tests/unit/api/admin/creator-invite-bulk.test.ts`
- `apps/web/tests/unit/api/billing/health.test.ts`
- `apps/web/tests/unit/api/billing/history.test.ts`
- `apps/web/tests/unit/api/billing/status.test.ts`
- `apps/web/tests/unit/api/chat/confirm-edit.test.ts`
- `apps/web/tests/unit/api/clerk/webhook.test.ts`
- `apps/web/tests/unit/api/cron/billing-reconciliation.test.ts`
- `apps/web/tests/unit/api/cron/cleanup-idempotency-keys.test.ts`
- `apps/web/tests/unit/api/cron/cleanup-photos.test.ts`
- `apps/web/tests/unit/api/cron/daily-maintenance.test.ts`
- `apps/web/tests/unit/api/cron/data-retention.test.ts`
- `apps/web/tests/unit/api/cron/frequent.test.ts`
- `apps/web/tests/unit/api/cron/generate-insights.test.ts`
- `apps/web/tests/unit/api/cron/generate-playlist.test.ts`
- `apps/web/tests/unit/api/cron/pixel-forwarding.test.ts`
- `apps/web/tests/unit/api/cron/process-campaigns.test.ts`
- `apps/web/tests/unit/api/cron/process-ingestion-jobs.test.ts`
- `apps/web/tests/unit/api/cron/process-pre-saves.test.ts`
- `apps/web/tests/unit/api/cron/purge-pixel-ips.test.ts`
- `apps/web/tests/unit/api/cron/schedule-release-notifications.test.ts`
- `apps/web/tests/unit/api/cron/send-release-notifications.test.ts`
- `apps/web/tests/unit/api/dashboard/analytics.test.ts`
- `apps/web/tests/unit/api/dashboard/earnings.test.ts`
- `apps/web/tests/unit/api/insights/generate.test.ts`
- `apps/web/tests/unit/api/insights/insight-update.test.ts`
- `apps/web/tests/unit/api/insights/route.test.ts`
- `apps/web/tests/unit/api/insights/summary.test.ts`
- `apps/web/tests/unit/api/sentry-example-api.test.ts`
- `apps/web/tests/unit/api/stripe/checkout.test.ts`
- `apps/web/tests/unit/api/tour-date-analytics-route.test.ts`
- `apps/web/tests/unit/api/waitlist/waitlist.test.ts`
- `apps/web/tests/unit/api/webhooks/linear.test.ts`
- `apps/web/tests/unit/api/webhooks/resend-inbound.test.ts`
- `apps/web/tests/unit/api/webhooks/resend-route.test.ts`
- `apps/web/tests/unit/api/webhooks/sentry.test.ts`
- `apps/web/tests/unit/api/webhooks/stripe-connect.test.ts`
- `apps/web/tests/unit/api/webhooks/stripe-tips.test.ts`
- `apps/web/tests/unit/app/onboarding/actions/avatar.test.ts`
- `apps/web/tests/unit/app/onboarding/actions/index.test.ts`
- `apps/web/tests/unit/app/onboarding-page.test.tsx`
- `apps/web/tests/unit/app/public-surface-guardrails.test.ts`
- `apps/web/tests/unit/app/settings-page.test.tsx`
- `apps/web/tests/unit/auth/waitlist-gating.test.ts`
- `apps/web/tests/unit/chat/ChatPageClient.test.tsx`
- `apps/web/tests/unit/chat/ai-model-identifiers.test.ts`
- `apps/web/tests/unit/components/admin/ReliabilityCard.test.tsx`
- `apps/web/tests/unit/components/organisms/AuthShellWrapper.test.tsx`
- `apps/web/tests/unit/dashboard/dashboard-data-prefetch.test.ts`
- `apps/web/tests/unit/hooks/useChunkErrorHandler.test.ts`
- `apps/web/tests/unit/inbox/webhook-handler.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-sync.critical.test.ts`
- `apps/web/tests/unit/lib/auth/gate.critical.test.ts`
- `apps/web/tests/unit/lib/auth/proxy-state.test.ts`
- `apps/web/tests/unit/lib/content-security-policy.test.ts`
- `apps/web/tests/unit/lib/cron/auth.test.ts`
- `apps/web/tests/unit/lib/csp-reporting.test.ts`
- `apps/web/tests/unit/lib/db/client/circuit-breaker.test.ts`
- `apps/web/tests/unit/lib/db/client/retry.test.ts`
- `apps/web/tests/unit/lib/discography/spotify-import.test.ts`
- `apps/web/tests/unit/lib/migrations/handleMigrationErrors.test.ts`
- `apps/web/tests/unit/lib/rate-limit/rate-limiter.test.ts`
- `apps/web/tests/unit/lib/sentry/init-state.test.ts`
- `apps/web/tests/unit/lib/sentry/lazy-replay.test.ts`
- `apps/web/tests/unit/lib/sentry/route-detector.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-config.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.config.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.misc.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.module.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.routes.test.ts`
- `apps/web/tests/unit/lib/sentry/set-user-context.test.ts`
- `apps/web/tests/unit/lib/spotify/circuit-breaker.test.ts`
- `apps/web/tests/unit/lib/spotify/jovie-account.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/checkout-handler.critical.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/payment-handler.critical.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/payment-handler.failure.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/payment-handler.misc.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/payment-handler.success.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/subscription-handler.created.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/subscription-handler.deleted.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/subscription-handler.errors.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/subscription-handler.misc.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/subscription-handler.updated.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/utils.test.ts`
- `apps/web/tests/unit/lib/webhooks/recent-dispatch.test.ts`
- `apps/web/tests/unit/middleware/proxy-behavioral.test.ts`
- `apps/web/tests/unit/middleware/proxy-composition.critical.test.ts`
- `apps/web/tests/unit/profile/bot-detection.test.ts`
- `apps/web/tests/unit/profile/profile-photo-context-menu.test.tsx`
- `apps/web/tests/unit/public-page-error-fallback.test.tsx`

Dev Docs
- `docs/WEBHOOK_MAP.md`
- `docs/CRON_REGISTRY.md`
- `docs/API_ROUTE_MAP.md`

User Docs
- N/A

Open Gaps
- none

</details>

<details>
<summary><strong>Homepage & Marketing Acquisition</strong> — Shipped (flagged) — public</summary>

Static acquisition pages, pricing entry points, and homepage experiments for new-user conversion.

- Tier: P1
- Hardening rank: 11
- Flags: `SHOW_EXAMPLE_PROFILES_CAROUSEL`, `SHOW_SEE_IT_IN_ACTION`, `SHOW_REPLACES_SECTION`, `SHOW_PHONE_TOUR`, `SHOW_LOGO_BAR`, `SHOW_FEATURE_SHOWCASE`, `SHOW_FINAL_CTA`, `SHOW_HOMEPAGE_SECTIONS`, `SHOW_HOMEPAGE_V2_SOCIAL_PROOF`, `SHOW_HOMEPAGE_V2_TRUST`, `SHOW_HOMEPAGE_V2_SYSTEM_OVERVIEW`, `SHOW_HOMEPAGE_V2_SPOTLIGHT`, `SHOW_HOMEPAGE_V2_CAPTURE_REACTIVATE`, `SHOW_HOMEPAGE_V2_POWER_GRID`, `SHOW_HOMEPAGE_V2_PRICING`, `SHOW_HOMEPAGE_V2_FINAL_CTA`, `SHOW_HOMEPAGE_V2_FOOTER_LINKS`
- Entitlements: none
- Unit coverage: 62.7% across 88 files
- E2E coverage: 6 specs

Pages
- `/` — `apps/web/app/(home)/page.tsx`
- `/about` — `apps/web/app/(marketing)/about/page.tsx`
- `/ai` — `apps/web/app/(marketing)/ai/page.tsx`
- `/alternatives/[slug]` — `apps/web/app/(marketing)/alternatives/[slug]/page.tsx`
- `/compare/[slug]` — `apps/web/app/(marketing)/compare/[slug]/page.tsx`
- `/launch` — `apps/web/app/(marketing)/launch/page.tsx`
- `/launch/pricing` — `apps/web/app/(marketing)/launch/pricing/page.tsx`
- `/new` — `apps/web/app/(marketing)/new/page.tsx`
- `/pay` — `apps/web/app/(marketing)/pay/page.tsx`
- `/pricing` — `apps/web/app/(marketing)/pricing/page.tsx`
- `/support` — `apps/web/app/(marketing)/support/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/featured-creators` (public) — `apps/web/app/api/featured-creators/route.ts`
- `/api/growth-access-request` (public) — `apps/web/app/api/growth-access-request/route.ts`
- `/api/max-access-request` (public) — `apps/web/app/api/max-access-request/route.ts`
- `/api/sms-access-request` (public) — `apps/web/app/api/sms-access-request/route.ts`

Server Actions
- none

Tables
- none

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/tests/components/marketing/FaqSection.test.tsx`
- `apps/web/tests/e2e/homepage-intent.spec.ts`
- `apps/web/tests/e2e/homepage.spec.ts`
- `apps/web/tests/e2e/new-landing.spec.ts`
- `apps/web/tests/e2e/pricing.spec.ts`
- `apps/web/tests/e2e/public-exhaustive.spec.ts`
- `apps/web/tests/e2e/smoke-public.spec.ts`
- `apps/web/tests/unit/SupportPage.test.tsx`
- `apps/web/tests/unit/api/featured-creators/featured-creators.test.ts`
- `apps/web/tests/unit/app/artist-notifications-page.test.tsx`
- `apps/web/tests/unit/app/artist-profiles-page.test.tsx`
- `apps/web/tests/unit/app/new-landing-page.test.tsx`
- `apps/web/tests/unit/app/public-surface-guardrails.test.ts`
- `apps/web/tests/unit/components/home/SeeItInActionCarousel.test.tsx`
- `apps/web/tests/unit/home/HomeAdaptiveProfileStory.test.tsx`
- `apps/web/tests/unit/home/HomePageNarrative.test.tsx`
- `apps/web/tests/unit/home/intent-store.test.ts`
- `apps/web/tests/unit/home/marketing-content-guardrails.test.ts`
- `apps/web/tests/unit/marketing/artist-profile/ArtistProfileOutcomeDuo.test.tsx`
- `apps/web/tests/unit/marketing/artist-profile/ArtistProfileOutcomesCarousel.test.ts`
- `apps/web/tests/unit/marketing/artist-profile/ArtistProfileSpecWall.test.tsx`
- `apps/web/tests/unit/routes/route-coverage.test.ts`

Dev Docs
- `docs/PRODUCT_CAPABILITIES.md`
- `docs/STATSIG_FEATURE_GATES.md`

User Docs
- `apps/docs/app/docs/page.mdx`
- `apps/docs/app/docs/getting-started/page.mdx`
- `apps/docs/app/docs/plans-pricing/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Onboarding & Handle Claiming</strong> — Shipped (flagged) — free+</summary>

Creator onboarding, handle checks, claim invites, and guided first-run profile setup.

- Tier: P1
- Hardening rank: 12
- Flags: `CLAIM_HANDLE`, `HERO_SPOTIFY_CLAIM_FLOW`, `SPOTIFY_OAUTH`
- Entitlements: none
- Unit coverage: 62.4% across 25 files
- E2E coverage: 11 specs

Pages
- `/artist-selection` — `apps/web/app/artist-selection/page.tsx`
- `/demo/onboarding` — `apps/web/app/demo/onboarding/page.tsx`
- `/onboarding` — `apps/web/app/onboarding/page.tsx`

Non-API Route Handlers
- `/[username]/claim` (public) — `apps/web/app/[username]/claim/route.ts`
- `/claim/[token]` (public) — `apps/web/app/claim/[token]/route.ts`

API Route Handlers
- `/api/handle/check` (public) — `apps/web/app/api/handle/check/route.ts`
- `/api/onboarding/discovery` (auth) — `apps/web/app/api/onboarding/discovery/route.ts`
- `/api/onboarding/distribution-event` (public) — `apps/web/app/api/onboarding/distribution-event/route.ts`
- `/api/onboarding/welcome-chat` (public) — `apps/web/app/api/onboarding/welcome-chat/route.ts`
- `/api/unsubscribe/claim-invites` (public) — `apps/web/app/api/unsubscribe/claim-invites/route.ts`
- `/api/verification/request` (auth) — `apps/web/app/api/verification/request/route.ts`

Server Actions
- `apps/web/app/actions/spotify.ts`
- `apps/web/app/onboarding/actions/avatar.ts`
- `apps/web/app/onboarding/actions/enrich-profile.ts`
- `apps/web/app/onboarding/actions/index.ts`
- `apps/web/app/onboarding/actions/profile-setup.ts`
- `apps/web/app/onboarding/actions/update-profile.ts`
- `apps/web/app/onboarding/actions/validation.ts`

Tables
- `creatorClaimInvites` — `apps/web/lib/db/schema/profiles.ts`
- `creatorDistributionEvents` — `apps/web/lib/db/schema/profiles.ts`
- `profileOwnershipLog` — `apps/web/lib/db/schema/profiles.ts`
- `userProfileClaims` — `apps/web/lib/db/schema/profiles.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/lib/services/onboarding/welcome-message.test.ts`
- `apps/web/tests/components/dashboard/organisms/apple-style-onboarding/analytics.test.ts`
- `apps/web/tests/components/dashboard/organisms/apple-style-onboarding/apple-style-onboarding-form.test.ts`
- `apps/web/tests/components/dashboard/organisms/apple-style-onboarding/errors.test.ts`
- `apps/web/tests/components/dashboard/organisms/apple-style-onboarding/spotify-import-copy.test.ts`
- `apps/web/tests/components/dashboard/organisms/apple-style-onboarding-navigation.test.ts`
- `apps/web/tests/components/dashboard/organisms/onboarding-complete-step.test.tsx`
- `apps/web/tests/components/dashboard/organisms/onboarding-handle-step.test.tsx`
- `apps/web/tests/components/dashboard/organisms/onboarding-v2-performance.test.tsx`
- `apps/web/tests/components/dashboard/organisms/profile-review-guards.test.ts`
- `apps/web/tests/e2e/golden-path-app.spec.ts`
- `apps/web/tests/e2e/handle-check-api.spec.ts`
- `apps/web/tests/e2e/nightly/auth-flows.spec.ts`
- `apps/web/tests/e2e/nightly/onboarding-flow.spec.ts`
- `apps/web/tests/e2e/onboarding-completion.spec.ts`
- `apps/web/tests/e2e/onboarding-flow.spec.ts`
- `apps/web/tests/e2e/onboarding.handle-race.spec.ts`
- `apps/web/tests/e2e/onboarding.handle-taken.spec.ts`
- `apps/web/tests/e2e/onboarding.spec.ts`
- `apps/web/tests/e2e/signup-funnel.smoke.spec.ts`
- `apps/web/tests/e2e/smoke-auth.spec.ts`
- `apps/web/tests/integration/onboarding-completion.test.ts`
- `apps/web/tests/lib/claim/claim-flow.test.ts`
- `apps/web/tests/scripts/overnight-qa-manifest.test.ts`
- `apps/web/tests/scripts/overnight-qa-risk.test.ts`
- `apps/web/tests/unit/ClaimHandleForm.test.tsx`
- `apps/web/tests/unit/ProblemSolutionSection.test.tsx`
- `apps/web/tests/unit/actions/admin-actions.test.ts`
- `apps/web/tests/unit/actions/onboarding/complete-onboarding.test.ts`
- `apps/web/tests/unit/actions/onboarding/profile-setup.test.ts`
- `apps/web/tests/unit/actions/onboarding/validation.test.ts`
- `apps/web/tests/unit/api/account/delete-route.test.ts`
- `apps/web/tests/unit/api/admin/creator-invite-bulk.test.ts`
- `apps/web/tests/unit/api/handle/check.test.ts`
- `apps/web/tests/unit/api/onboarding/discovery.test.ts`
- `apps/web/tests/unit/api/onboarding/distribution-event.test.ts`
- `apps/web/tests/unit/api/onboarding/welcome-chat.test.ts`
- `apps/web/tests/unit/api/onboarding-discovery-route.test.ts`
- `apps/web/tests/unit/api/unsubscribe/claim-invites.test.ts`
- `apps/web/tests/unit/api/verification/request.test.ts`
- `apps/web/tests/unit/api/waitlist/waitlist.test.ts`
- `apps/web/tests/unit/app/onboarding/actions/avatar.test.ts`
- `apps/web/tests/unit/app/onboarding/actions/connect-spotify.test.ts`
- `apps/web/tests/unit/app/onboarding/actions/index.test.ts`
- `apps/web/tests/unit/app/onboarding-page.test.tsx`
- `apps/web/tests/unit/app/surface-elevation-guardrails.test.ts`
- `apps/web/tests/unit/components/dashboard/organisms/apple-style-onboarding/useHandleValidation.test.ts`
- `apps/web/tests/unit/core-providers-route-variant.test.tsx`
- `apps/web/tests/unit/dev/DevToolbar.test.tsx`
- `apps/web/tests/unit/features/onboarding/OnboardingExperienceShell.test.tsx`
- `apps/web/tests/unit/lib/email/campaigns/processor.test.ts`
- `apps/web/tests/unit/lib/onboarding/reserved-handle.test.ts`
- `apps/web/tests/unit/lib/onboarding-return-to.test.ts`
- `apps/web/tests/unit/lib/proxy-url-mapping.test.ts`
- `apps/web/tests/unit/lib/sentry/init-state.test.ts`
- `apps/web/tests/unit/lib/sentry/route-detector.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.misc.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.routes.test.ts`
- `apps/web/tests/unit/lib/username/sync.test.ts`
- `apps/web/tests/unit/lib/username-sync.test.ts`
- `apps/web/tests/unit/onboarding/checkout-page.test.ts`
- `apps/web/tests/unit/onboarding/onboarding-checkout.test.tsx`
- `apps/web/tests/unit/onboarding-display-name-validation.test.ts`
- `apps/web/tests/unit/onboarding-step-navigation.test.ts`
- `apps/web/tests/unit/onboarding-verify-avatar.test.ts`
- `apps/web/tests/unit/tracking/instantly-pixel.test.tsx`

Dev Docs
- `docs/TESTING_STRATEGY.md`
- `docs/ADMIN_INGEST_AND_CLAIM_SYSTEM.md`

User Docs
- `apps/docs/app/docs/self-serve-guide/claim-handle/page.mdx`
- `apps/docs/app/docs/self-serve-guide/set-up-profile/page.mdx`
- `apps/docs/app/docs/self-serve-guide/connect-dsps/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Artist Bio & Social Links</strong> — Shipped — free+</summary>

Editable artist biography, avatar, socials, and theme controls across the public profile and dashboard.

- Tier: P1
- Hardening rank: 13
- Flags: none
- Entitlements: none
- Unit coverage: 56.9% across 264 files
- E2E coverage: 5 specs

Pages
- `/app/dashboard/profile` — `apps/web/app/app/(shell)/dashboard/profile/page.tsx`
- `/app/settings/appearance` — `apps/web/app/app/(shell)/settings/appearance/page.tsx`
- `/app/settings/artist-profile` — `apps/web/app/app/(shell)/settings/artist-profile/page.tsx`
- `/app/settings/profile` — `apps/web/app/app/(shell)/settings/profile/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/dashboard/press-photos` (public) — `apps/web/app/api/dashboard/press-photos/route.ts`
- `/api/dashboard/profile` (auth) — `apps/web/app/api/dashboard/profile/route.ts`
- `/api/dashboard/social-links` (public) — `apps/web/app/api/dashboard/social-links/route.ts`

Server Actions
- `apps/web/app/app/(shell)/dashboard/actions/creator-profile.ts`
- `apps/web/app/app/(shell)/dashboard/actions/settings.ts`
- `apps/web/app/app/(shell)/dashboard/actions/social-links.ts`

Tables
- `artistIdentityLinks` — `apps/web/lib/db/schema/identity.ts`
- `creatorAvatarCandidates` — `apps/web/lib/db/schema/profiles.ts`
- `socialAccounts` — `apps/web/lib/db/schema/links.ts`
- `socialLinks` — `apps/web/lib/db/schema/links.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/components/features/dashboard/organisms/AnalyticsSidebar.test.tsx`
- `apps/web/components/features/dashboard/organisms/profile-contact-sidebar/profileLinkShareMenu.test.ts`
- `apps/web/components/features/dashboard/tasks/task-presentation.test.ts`
- `apps/web/scripts/performance-optimizer-lib.test.ts`
- `apps/web/tests/components/admin/CreatorProfileTableRow.test.tsx`
- `apps/web/tests/components/admin/DeleteCreatorDialog.test.tsx`
- `apps/web/tests/components/admin/creator-actions-menu/CreatorActionsMenu.interaction.test.tsx`
- `apps/web/tests/components/dashboard/organisms/ProfileAboutTab.test.tsx`
- `apps/web/tests/components/dashboard/socials-form/VerificationModal.test.tsx`
- `apps/web/tests/components/dashboard/socials-form/useSocialsForm.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebar-links.interaction.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebarLinks.interaction.test.tsx`
- `apps/web/tests/components/profile-drawers-dismiss.test.tsx`
- `apps/web/tests/contracts/dashboard-apis.nightly.test.ts`
- `apps/web/tests/e2e/dashboard.profile-link-card.spec.ts`
- `apps/web/tests/e2e/drawer-profile-editing.spec.ts`
- `apps/web/tests/e2e/icon-contrast-audit.spec.ts`
- `apps/web/tests/e2e/profile-drawers.spec.ts`
- `apps/web/tests/e2e/tipping.spec.ts`
- `apps/web/tests/integration/admin-ingestion.test.ts`
- `apps/web/tests/lib/dsp-enrichment/musicfetch-enrichment.test.ts`
- `apps/web/tests/lib/identity/publish.test.ts`
- `apps/web/tests/lib/identity/store.test.ts`
- `apps/web/tests/lib/ingestion/linktree-real-ingestion.test.ts`
- `apps/web/tests/lib/queries/keys.test.ts`
- `apps/web/tests/lib/queries/useDashboardSocialLinksQuery.test.tsx`
- `apps/web/tests/lib/rls-policies.test.ts`
- `apps/web/tests/unit/EnhancedDashboardLinks.test.tsx`
- `apps/web/tests/unit/SocialBar.test.tsx`
- `apps/web/tests/unit/api/admin/creator-social-links.test.ts`
- `apps/web/tests/unit/api/artist/theme.test.ts`
- `apps/web/tests/unit/api/creator/creator.test.ts`
- `apps/web/tests/unit/api/dashboard/press-photos.test.ts`
- `apps/web/tests/unit/api/dashboard/profile/clerk-sync.test.ts`
- `apps/web/tests/unit/api/dashboard/profile/db-operations.test.ts`
- `apps/web/tests/unit/api/dashboard/profile/profile-update-contract.test.ts`
- `apps/web/tests/unit/api/dashboard/profile/response.test.ts`
- `apps/web/tests/unit/api/dashboard/profile/route-rollback.test.ts`
- `apps/web/tests/unit/api/dashboard/social-links-verify.test.ts`
- `apps/web/tests/unit/api/featured-creators/featured-creators.test.ts`
- `apps/web/tests/unit/api/track/route.test.ts`
- `apps/web/tests/unit/app/ProfileCompletionRedirect.test.tsx`
- `apps/web/tests/unit/app/dashboard-tasks-page.test.tsx`
- `apps/web/tests/unit/app/internal-shell-surface-guard.test.ts`
- `apps/web/tests/unit/app/notifications/page.test.tsx`
- `apps/web/tests/unit/app/release-tasks-page.test.tsx`
- `apps/web/tests/unit/chat/ChatPageClient.test.tsx`
- `apps/web/tests/unit/chat/ProfilePageChat.test.tsx`
- `apps/web/tests/unit/chat/ai-operations.test.ts`
- `apps/web/tests/unit/chat/chat-context.test.ts`
- `apps/web/tests/unit/components/admin/AdminProfileSidebar.test.tsx`
- `apps/web/tests/unit/components/admin/admin-user-actions.test.ts`
- `apps/web/tests/unit/components/admin/ingest-profile-input.test.ts`
- `apps/web/tests/unit/components/admin/useBulkActions.test.ts`
- `apps/web/tests/unit/components/releases/ProviderStatusDot.test.tsx`
- `apps/web/tests/unit/components/table/SocialLinksCell.test.tsx`
- `apps/web/tests/unit/creator-profile-cap.test.tsx`
- `apps/web/tests/unit/dashboard/CelebrationCardPreview.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardDataContext.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardHeader.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardOverview.test.tsx`
- `apps/web/tests/unit/dashboard/EarningsTabTippers.test.tsx`
- `apps/web/tests/unit/dashboard/HeaderProfileProgress.test.tsx`
- `apps/web/tests/unit/dashboard/ProfileCompletionCard.test.tsx`
- `apps/web/tests/unit/dashboard/RecentChats.test.tsx`
- `apps/web/tests/unit/dashboard/ReleaseTaskChecklist.test.tsx`
- `apps/web/tests/unit/dashboard/SettingsActionRow.test.tsx`
- `apps/web/tests/unit/dashboard/SettingsPanel.test.tsx`
- `apps/web/tests/unit/dashboard/SmartActionCards.test.tsx`
- `apps/web/tests/unit/dashboard/SuggestedDspMatches.test.tsx`
- `apps/web/tests/unit/dashboard/TaskListRow.test.tsx`
- `apps/web/tests/unit/dashboard/TaskWorkspaceHeaderBar.test.tsx`
- `apps/web/tests/unit/dashboard/TasksPageClient.test.tsx`
- `apps/web/tests/unit/dashboard/dashboard-data-prefetch.test.ts`
- `apps/web/tests/unit/dashboard/useMusicLinksForm.test.tsx`
- `apps/web/tests/unit/demo/DemoPublicProfileSurface.test.tsx`
- `apps/web/tests/unit/demo/demo-releases-experience.test.tsx`
- `apps/web/tests/unit/extensions/summary.test.ts`
- `apps/web/tests/unit/lib/cache/tags.test.ts`
- `apps/web/tests/unit/lib/chat/system-prompt.test.ts`
- `apps/web/tests/unit/lib/fit-scoring/service.test.ts`
- `apps/web/tests/unit/lib/profile-next-action.test.ts`
- `apps/web/tests/unit/links/useLinksPersistence.test.ts`
- `apps/web/tests/unit/profile/ProfileModeDrawer.test.tsx`
- `apps/web/tests/unit/profile/ProfilePrimaryCTA.loading.test.tsx`
- `apps/web/tests/unit/profile/ProfilePrimaryCTA.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.accessibility.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.dsp-preferences.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.mode-override.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.notifications.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.tour.test.tsx`
- `apps/web/tests/unit/profile/ProfileUnifiedDrawerReleases.test.tsx`
- `apps/web/tests/unit/profile/ProgressiveArtistPage.test.tsx`
- `apps/web/tests/unit/profile/PublicProfileTemplateV2.history.test.tsx`
- `apps/web/tests/unit/profile/cache-invalidation.test.ts`
- `apps/web/tests/unit/profile/profile-compact-template.test.tsx`
- `apps/web/tests/unit/profile/profile-links.test.tsx`
- `apps/web/tests/unit/profile/profile-next-action.test.ts`
- `apps/web/tests/unit/profile/profile-service-queries.test.ts`
- `apps/web/tests/unit/profile/public-profile-page.test.ts`
- `apps/web/tests/unit/profile/social-link-limits.test.ts`
- `apps/web/tests/unit/profile/static-artist-page.test.tsx`
- `apps/web/tests/unit/profile/view-models.test.ts`
- `apps/web/tests/unit/release-tasks/catalog-task-builder-dialog.test.tsx`
- `apps/web/tests/unit/release-tasks/cluster-filter-chips.test.tsx`
- `apps/web/tests/unit/release-tasks/release-plan-wizard.test.tsx`
- `apps/web/tests/unit/routes/shell-nav-coverage.test.ts`
- `apps/web/tests/unit/settings/SettingsBillingSection.test.tsx`
- `apps/web/tests/unit/tour-date-sidebar-analytics.test.tsx`
- `tests/lib/listen-routing.test.ts`

Dev Docs
- `docs/TANSTACK_QUERY_INVENTORY.md`

User Docs
- `apps/docs/app/docs/features/profile/page.mdx`
- `apps/docs/app/docs/self-serve-guide/set-up-profile/page.mdx`
- `apps/docs/app/docs/self-serve-guide/connect-dsps/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Tour Dates (Bandsintown)</strong> — Shipped — free+</summary>

Bandsintown-backed touring surfaces, dashboard sync, and public ticket pages.

- Tier: P1
- Hardening rank: 14
- Flags: none
- Entitlements: none
- Unit coverage: 73.2% across 5 files
- E2E coverage: 1 specs

Pages
- `/[username]/tour` — `apps/web/app/[username]/tour/page.tsx`
- `/app/dashboard/presence` — `apps/web/app/app/(shell)/dashboard/presence/page.tsx`
- `/app/dashboard/tour-dates` — `apps/web/app/app/(shell)/dashboard/tour-dates/page.tsx`
- `/app/settings/touring` — `apps/web/app/app/(shell)/settings/touring/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/calendar/[eventId]` (public) — `apps/web/app/api/calendar/[eventId]/route.ts`
- `/api/dashboard/tour-dates/[id]/analytics` (auth) — `apps/web/app/api/dashboard/tour-dates/[id]/analytics/route.ts`

Server Actions
- `apps/web/app/app/(shell)/dashboard/tour-dates/actions.ts`

Tables
- `tourDates` — `apps/web/lib/db/schema/tour.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/tests/e2e/presence.spec.ts`
- `apps/web/tests/unit/actions/tour-dates-actions.test.ts`
- `apps/web/tests/unit/api/calendar-ics-route.test.ts`
- `apps/web/tests/unit/api/tour-date-analytics-route.test.ts`
- `apps/web/tests/unit/app/internal-shell-surface-guard.test.ts`
- `apps/web/tests/unit/dashboard/AddPlatformDialog.test.tsx`
- `apps/web/tests/unit/dashboard/DspPresenceView.test.tsx`
- `apps/web/tests/unit/dashboard/presence-actions.test.ts`
- `apps/web/tests/unit/demo/demo-releases-experience.test.tsx`
- `apps/web/tests/unit/extensions/summary.test.ts`
- `apps/web/tests/unit/lib/services/insights/data-aggregator.test.ts`
- `apps/web/tests/unit/profile/ProfileMenuDrawer.test.tsx`
- `apps/web/tests/unit/profile/ProfilePrimaryActionCard.test.tsx`
- `apps/web/tests/unit/profile/ProfileUnifiedDrawerReleases.test.tsx`
- `apps/web/tests/unit/profile/PublicProfileTemplateV2.history.test.tsx`
- `apps/web/tests/unit/profile/TourModePanel.test.tsx`
- `apps/web/tests/unit/profile/profile-compact-template.test.tsx`
- `apps/web/tests/unit/profile/public-profile-page.test.ts`
- `apps/web/tests/unit/profile/view-registry.test.ts`
- `apps/web/tests/unit/tour-date-sidebar-analytics.test.tsx`

Dev Docs
- `docs/SCHEMA_MAP.md`

User Docs
- `apps/docs/app/docs/features/profile/page.mdx`
- `apps/docs/app/docs/self-serve-guide/connect-bandsintown/page.mdx`
- `apps/docs/app/docs/features/profile/tour-dates/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Smart Link Routing & Short Links</strong> — Shipped — free+</summary>

Redirect infrastructure, short links, source tracking links, and wrap-link style routing helpers.

- Tier: P1
- Hardening rank: 15
- Flags: `IOS_APPLE_MUSIC_PRIORITY`
- Entitlements: `canAccessUrlEncryption`
- Unit coverage: 47.3% across 17 files
- E2E coverage: 4 specs

Pages
- `/out/[id]` — `apps/web/app/out/[id]/page.tsx`
- `/r/[slug]` — `apps/web/app/r/[slug]/page.tsx`

Non-API Route Handlers
- `/go/[id]` (public) — `apps/web/app/go/[id]/route.ts`
- `/r/isrc/[isrc]` (public) — `apps/web/app/r/isrc/[isrc]/route.ts`
- `/s/[code]` (public) — `apps/web/app/s/[code]/route.ts`

API Route Handlers
- `/api/px` (public) — `apps/web/app/api/px/route.ts`
- `/api/track` (public) — `apps/web/app/api/track/route.ts`
- `/api/wrap-link` (auth) — `apps/web/app/api/wrap-link/route.ts`

Server Actions
- none

Tables
- `contentSlugRedirects` — `apps/web/lib/db/schema/content.ts`
- `dashboardIdempotencyKeys` — `apps/web/lib/db/schema/links.ts`
- `signedLinkAccess` — `apps/web/lib/db/schema/links.ts`
- `wrappedLinks` — `apps/web/lib/db/schema/links.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/app/api/dashboard/audience/source-links/route.test.ts`
- `apps/web/components/molecules/filters/TableFilterDropdown.test.tsx`
- `apps/web/hooks/useKeyboardShortcuts.test.ts`
- `apps/web/hooks/useSequentialShortcuts.test.ts`
- `apps/web/lib/keyboard-shortcuts.test.ts`
- `apps/web/lib/share/context.test.ts`
- `apps/web/lib/share/destinations.test.ts`
- `apps/web/tests/bench/track-route.bench.test.ts`
- `apps/web/tests/components/organisms/PersistentAudioBar.test.tsx`
- `apps/web/tests/components/release-provider-matrix/ReleaseFilterDropdown.test.tsx`
- `apps/web/tests/e2e/anti-cloaking.spec.ts`
- `apps/web/tests/e2e/content-gate.spec.ts`
- `apps/web/tests/e2e/dropdown-parity.spec.ts`
- `apps/web/tests/e2e/smartlink-experience.spec.ts`
- `apps/web/tests/lib/admin/sentry-metrics.test.ts`
- `apps/web/tests/lib/anti-cloaking.test.ts`
- `apps/web/tests/lib/claim/claim-flow.test.ts`
- `apps/web/tests/lib/dsp-enrichment/apple-music.test.ts`
- `apps/web/tests/lib/dsp-enrichment/musicfetch-provider.test.ts`
- `apps/web/tests/lib/hooks/useArtistSearch.test.tsx`
- `apps/web/tests/lib/ingestion/base.test.ts`
- `apps/web/tests/lib/ingestion/status-manager.test.ts`
- `apps/web/tests/lib/keyboard-shortcuts.test.ts`
- `apps/web/tests/lib/notifications/validation.test.ts`
- `apps/web/tests/lib/queries/cache-strategies.test.ts`
- `apps/web/tests/lib/utils/bot-detection.test.ts`
- `apps/web/tests/lib/utils/url-encryption.test.ts`
- `apps/web/tests/lib/utm/share-menu-items.test.ts`
- `apps/web/tests/lib/validation/client-username.test.ts`
- `apps/web/tests/lib/validation/username.test.ts`
- `apps/web/tests/lib/validation/wrap-link-schemas.test.ts`
- `apps/web/tests/unit/ClaimHandleForm.test.tsx`
- `apps/web/tests/unit/ProgressIndicator.test.tsx`
- `apps/web/tests/unit/actions/tour-dates-actions.test.ts`
- `apps/web/tests/unit/api/clerk/webhook.test.ts`
- `apps/web/tests/unit/api/cron/cleanup-idempotency-keys.test.ts`
- `apps/web/tests/unit/api/handle/check.test.ts`
- `apps/web/tests/unit/api/link/link.test.ts`
- `apps/web/tests/unit/api/track/route.test.ts`
- `apps/web/tests/unit/api/track/validation.test.ts`
- `apps/web/tests/unit/api/wrap-link/wrap-link.test.ts`
- `apps/web/tests/unit/app/admin/admin-load-failures.test.tsx`
- `apps/web/tests/unit/app/out-link-page.test.ts`
- `apps/web/tests/unit/chat/chat-title-generation.test.ts`
- `apps/web/tests/unit/chat/knowledge-retrieval.test.ts`
- `apps/web/tests/unit/components/AuthShellWrapper.test.tsx`
- `apps/web/tests/unit/components/admin/WeeklyTrendChart.test.tsx`
- `apps/web/tests/unit/components/admin/csv-export.button.test.tsx`
- `apps/web/tests/unit/components/admin/csv-export.config.test.tsx`
- `apps/web/tests/unit/components/admin/csv-export.hook.test.tsx`
- `apps/web/tests/unit/components/admin/csv-export.utils.test.tsx`
- `apps/web/tests/unit/components/atoms/AppIconButton.test.tsx`
- `apps/web/tests/unit/components/organisms/AuthShellWrapper.test.tsx`
- `apps/web/tests/unit/components/table/PageToolbar.test.tsx`
- `apps/web/tests/unit/dashboard/TasksPageClient.test.tsx`
- `apps/web/tests/unit/demo/demo-releases-experience.test.tsx`
- `apps/web/tests/unit/dev/DevToolbar.test.tsx`
- `apps/web/tests/unit/discography/artist-parser.test.ts`
- `apps/web/tests/unit/discography/links.test.ts`
- `apps/web/tests/unit/home/tim-white-marketing-fixtures.test.ts`
- `apps/web/tests/unit/hooks/useNotifications.test.ts`
- `apps/web/tests/unit/hooks/useSequentialShortcuts.test.ts`
- `apps/web/tests/unit/hooks/useSidebarKeyboardShortcut.test.ts`
- `apps/web/tests/unit/lib/audience/source-link-code.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-errors.test.ts`
- `apps/web/tests/unit/lib/cache/tags.test.ts`
- `apps/web/tests/unit/lib/entitlement-registry.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/images/validate-magic-bytes.test.ts`
- `apps/web/tests/unit/lib/leads/outreach-batch.test.ts`
- `apps/web/tests/unit/lib/plan-config.test.ts`
- `apps/web/tests/unit/lib/rate-limit/limiters.test.ts`
- `apps/web/tests/unit/lib/submission-agent/xperi-release-sheet.test.ts`
- `apps/web/tests/unit/lib/tracking/track-helpers.test.ts`
- `apps/web/tests/unit/lib/utm/build-url.test.ts`
- `apps/web/tests/unit/onboarding-validation.test.ts`
- `apps/web/tests/unit/profile/avatar-quality.test.ts`
- `apps/web/tests/unit/profile/bot-detection.test.ts`
- `apps/web/tests/unit/profile/profile-view-api.test.ts`
- `apps/web/tests/unit/release/smart-link-metadata.test.ts`
- `apps/web/tests/unit/release-tasks/catalog-task-builder-dialog.test.tsx`
- `apps/web/tests/unit/release-tasks/select-tasks.test.ts`
- `apps/web/tests/unit/services/pitch/truncation.test.ts`
- `apps/web/tests/unit/validation/onboarding.test.ts`
- `apps/web/tests/unit/validation/tip.test.ts`
- `apps/web/tests/unit/waitlist/settings.test.ts`
- `apps/web/tests/unit/youtube/parse-youtube-url.test.ts`
- `packages/ui/atoms/common-dropdown.test.tsx`
- `packages/ui/atoms/context-menu.test.tsx`
- `packages/ui/atoms/dropdown-menu.test.tsx`
- `packages/ui/atoms/kbd.test.tsx`
- `packages/ui/atoms/searchable-submenu.test.tsx`
- `packages/ui/atoms/tooltip-shortcut.test.tsx`
- `packages/ui/lib/dropdown-styles.test.ts`

Dev Docs
- `docs/API_ROUTE_MAP.md`

User Docs
- `apps/docs/app/docs/features/releases/page.mdx`
- `apps/docs/app/docs/self-serve-guide/share-first-link/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Auto Sync & DSP Linking</strong> — Shipped — free+</summary>

Spotify import, MusicFetch enrichment, cross-platform matching, and provider-link discovery.

- Tier: P1
- Hardening rank: 16
- Flags: none
- Entitlements: none
- Unit coverage: 45.9% across 117 files
- E2E coverage: 8 specs

Pages
- `/app/dashboard/catalog-scan` — `apps/web/app/app/(shell)/dashboard/catalog-scan/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/dsp/bio-sync` (auth) — `apps/web/app/api/dsp/bio-sync/route.ts`
- `/api/dsp/bio-sync/status` (auth) — `apps/web/app/api/dsp/bio-sync/status/route.ts`
- `/api/dsp/catalog-scan/mismatches/[id]` (auth) — `apps/web/app/api/dsp/catalog-scan/mismatches/[id]/route.ts`
- `/api/dsp/catalog-scan/results` (auth) — `apps/web/app/api/dsp/catalog-scan/results/route.ts`
- `/api/dsp/catalog-scan` (auth) — `apps/web/app/api/dsp/catalog-scan/route.ts`
- `/api/dsp/catalog-scan/status` (auth) — `apps/web/app/api/dsp/catalog-scan/status/route.ts`
- `/api/dsp/discover` (auth) — `apps/web/app/api/dsp/discover/route.ts`
- `/api/dsp/enrichment/status` (auth) — `apps/web/app/api/dsp/enrichment/status/route.ts`
- `/api/dsp/matches/[id]/confirm` (auth) — `apps/web/app/api/dsp/matches/[id]/confirm/route.ts`
- `/api/dsp/matches/[id]/reject` (auth) — `apps/web/app/api/dsp/matches/[id]/reject/route.ts`
- `/api/dsp/matches` (auth) — `apps/web/app/api/dsp/matches/route.ts`
- `/api/spotify/fal-analysis` (admin) — `apps/web/app/api/spotify/fal-analysis/route.ts`
- `/api/suggestions/avatars/[id]/dismiss` (auth) — `apps/web/app/api/suggestions/avatars/[id]/dismiss/route.ts`
- `/api/suggestions/avatars/[id]/select` (auth) — `apps/web/app/api/suggestions/avatars/[id]/select/route.ts`
- `/api/suggestions/playlist-fallback/[id]/approve` (public) — `apps/web/app/api/suggestions/playlist-fallback/[id]/approve/route.ts`
- `/api/suggestions/playlist-fallback/[id]/reject` (public) — `apps/web/app/api/suggestions/playlist-fallback/[id]/reject/route.ts`
- `/api/suggestions` (auth) — `apps/web/app/api/suggestions/route.ts`
- `/api/suggestions/social-links/[id]/approve` (auth) — `apps/web/app/api/suggestions/social-links/[id]/approve/route.ts`
- `/api/suggestions/social-links/[id]/reject` (auth) — `apps/web/app/api/suggestions/social-links/[id]/reject/route.ts`

Server Actions
- `apps/web/app/onboarding/actions/connect-spotify.ts`

Tables
- `dspArtistMatches` — `apps/web/lib/db/schema/dsp-enrichment.ts`
- `dspBioSyncRequests` — `apps/web/lib/db/schema/dsp-bio-sync.ts`
- `dspCatalogMismatches` — `apps/web/lib/db/schema/dsp-catalog-scan.ts`
- `dspCatalogScans` — `apps/web/lib/db/schema/dsp-catalog-scan.ts`
- `providers` — `apps/web/lib/db/schema/content.ts`
- `socialLinkSuggestions` — `apps/web/lib/db/schema/dsp-enrichment.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/app/api/spotify/search/__tests__/helpers.test.ts`
- `apps/web/app/app/layout.test.tsx`
- `apps/web/lib/discography/audio-qa.test.ts`
- `apps/web/lib/dsp-enrichment/jobs/__tests__/catalog-scan.test.ts`
- `apps/web/lib/dsp-enrichment/providers/musicbrainz.test.ts`
- `apps/web/lib/ingestion/flows/__tests__/profile-quality-gate.test.ts`
- `apps/web/lib/ingestion/flows/reingest-flow.test.ts`
- `apps/web/lib/ingestion/flows/social-platform-flow.test.ts`
- `apps/web/lib/spotify/__tests__/blacklist.test.ts`
- `apps/web/lib/spotify/scoring.test.ts`
- `apps/web/tests/bench/track-route.bench.test.ts`
- `apps/web/tests/components/dashboard/UniversalLinkInput.a11y.test.tsx`
- `apps/web/tests/components/dashboard/UniversalLinkInput.voice-recording.test.tsx`
- `apps/web/tests/components/dashboard/organisms/onboarding-complete-step.test.tsx`
- `apps/web/tests/components/dashboard/organisms/onboarding-v2-performance.test.tsx`
- `apps/web/tests/components/dashboard/organisms/releases/cells/ProviderCell.interaction.test.tsx`
- `apps/web/tests/components/dashboard/socials-form/VerificationModal.test.tsx`
- `apps/web/tests/components/organisms/MarketingSignInModal.test.tsx`
- `apps/web/tests/components/organisms/artist-search-palette/ArtistSearchCommandPalette.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseDspLinks.interaction.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseMetadata.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebar-links.interaction.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebarHeader.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebarLinks.interaction.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseTrackList.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/TrackDetailPanel.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/TrackSidebar.test.tsx`
- `apps/web/tests/components/providers/ClientProviders.interaction.test.tsx`
- `apps/web/tests/components/release-provider-matrix/AddReleaseSidebar.test.tsx`
- `apps/web/tests/components/release-provider-matrix/MobileReleaseList.test.tsx`
- `apps/web/tests/components/release-provider-matrix/TrackRow.test.tsx`
- `apps/web/tests/components/release-provider-matrix/column-renderers.test.tsx`
- `apps/web/tests/components/releases/ReleaseCell.test.tsx`
- `apps/web/tests/components/releases/ReleaseEditDialog.test.tsx`
- `apps/web/tests/components/releases/release-actions.test.tsx`
- `apps/web/tests/contracts/dashboard-apis.nightly.test.ts`
- `apps/web/tests/e2e/artist-notifications.spec.ts`
- `apps/web/tests/e2e/drawer-profile-editing.spec.ts`
- `apps/web/tests/e2e/golden-path.spec.ts`
- `apps/web/tests/e2e/homepage.spec.ts`
- `apps/web/tests/e2e/legal.spec.ts`
- `apps/web/tests/e2e/musicfetch-coverage.spec.ts`
- `apps/web/tests/e2e/onboarding.spec.ts`
- `apps/web/tests/e2e/resilience.spec.ts`
- `apps/web/tests/integration/admin-ingestion.test.ts`
- `apps/web/tests/integration/analytics-tracking.test.ts`
- `apps/web/tests/lib/deezer-preview.test.ts`
- `apps/web/tests/lib/discography/discovery.test.ts`
- `apps/web/tests/lib/discography/provider-links-deezer.test.ts`
- `apps/web/tests/lib/discography/provider-links-musicfetch.test.ts`
- `apps/web/tests/lib/discography/release-filter-counts.test.ts`
- `apps/web/tests/lib/discography/release-search-filter.test.ts`
- `apps/web/tests/lib/discography/view-models.test.ts`
- `apps/web/tests/lib/dsp/registry.test.ts`
- `apps/web/tests/lib/dsp-enrichment/apple-music.test.ts`
- `apps/web/tests/lib/dsp-enrichment/extract-all-musicfetch-services.test.ts`
- `apps/web/tests/lib/dsp-enrichment/matching.test.ts`
- `apps/web/tests/lib/dsp-enrichment/musicbrainz-circuit-breaker.test.ts`
- `apps/web/tests/lib/dsp-enrichment/musicfetch-enrichment.test.ts`
- `apps/web/tests/lib/dsp-enrichment/musicfetch-mapping.test.ts`
- `apps/web/tests/lib/dsp-enrichment/musicfetch-provider.test.ts`
- `apps/web/tests/lib/dsp-enrichment/release-enrichment.test.ts`
- `apps/web/tests/lib/hooks/useAppleMusicArtistSearch.test.tsx`
- `apps/web/tests/lib/hooks/useArtistSearch.test.tsx`
- `apps/web/tests/lib/identity/publish.test.ts`
- `apps/web/tests/lib/identity/store.test.ts`
- `apps/web/tests/lib/ingestion/avatar-hosting.test.ts`
- `apps/web/tests/lib/ingestion/base.test.ts`
- `apps/web/tests/lib/ingestion/beacons.test.ts`
- `apps/web/tests/lib/ingestion/confidence.test.ts`
- `apps/web/tests/lib/ingestion/followup.test.ts`
- `apps/web/tests/lib/ingestion/jobs.test.ts`
- `apps/web/tests/lib/ingestion/laylo.test.ts`
- `apps/web/tests/lib/ingestion/linktree-real-ingestion.test.ts`
- `apps/web/tests/lib/ingestion/linktree.test.ts`
- `apps/web/tests/lib/ingestion/processor.test.ts`
- `apps/web/tests/lib/ingestion/profile.test.ts`
- `apps/web/tests/lib/ingestion/scheduler.test.ts`
- `apps/web/tests/lib/ingestion/status-manager.test.ts`
- `apps/web/tests/lib/ingestion/youtube.test.ts`
- `apps/web/tests/lib/leads/discovery.test.ts`
- `apps/web/tests/lib/leads/qualify.test.ts`
- `apps/web/tests/lib/leads/route-lead.test.ts`
- `apps/web/tests/lib/musicfetch-budget-guard.test.ts`
- `apps/web/tests/lib/musicfetch-circuit-breaker.test.ts`
- `apps/web/tests/lib/musicfetch-resilient-client.test.ts`
- `apps/web/tests/lib/musicfetch.test.ts`
- `apps/web/tests/lib/notifications/providers/resend.test.ts`
- `apps/web/tests/lib/notifications/service.test.ts`
- `apps/web/tests/lib/notifications/suppression.test.ts`
- `apps/web/tests/lib/provider-links.test.ts`
- `apps/web/tests/lib/queries/keys.test.ts`
- `apps/web/tests/lib/queries/useDspEnrichmentStatusQuery.test.tsx`
- `apps/web/tests/lib/queries/useReleaseTracksQuery.test.tsx`
- `apps/web/tests/lib/utils/avatar-url.test.ts`
- `apps/web/tests/performance/onboarding-performance.spec.ts`
- `apps/web/tests/unit/DspPresenceSummary.test.tsx`
- `apps/web/tests/unit/FeaturedCreators.test.tsx`
- `apps/web/tests/unit/GroupedLinksManager.test.tsx`
- `apps/web/tests/unit/TestimonialsSection.test.tsx`
- `apps/web/tests/unit/actions/admin-actions.test.ts`
- `apps/web/tests/unit/actions/releases-actions.create.nightly.test.ts`
- `apps/web/tests/unit/actions/releases-actions.publish.nightly.test.ts`
- `apps/web/tests/unit/actions/releases-actions.update.nightly.test.ts`
- `apps/web/tests/unit/admin/LeadTable.test.tsx`
- `apps/web/tests/unit/api/admin/creator-ingest.test.ts`
- `apps/web/tests/unit/api/admin/creator-invite-bulk.test.ts`
- `apps/web/tests/unit/api/admin/waitlist-approve.test.ts`
- `apps/web/tests/unit/api/admin/waitlist-disapprove.test.ts`
- `apps/web/tests/unit/api/apple-music/search.test.ts`
- `apps/web/tests/unit/api/audience/click.test.ts`
- `apps/web/tests/unit/api/audience/visit.test.ts`
- `apps/web/tests/unit/api/cron/frequent.test.ts`
- `apps/web/tests/unit/api/cron/process-ingestion-jobs.test.ts`
- `apps/web/tests/unit/api/cron/schedule-release-notifications.test.ts`
- `apps/web/tests/unit/api/cron/send-release-notifications.test.ts`
- `apps/web/tests/unit/api/dsp-enrichment-status.test.ts`
- `apps/web/tests/unit/api/feedback/route.test.ts`
- `apps/web/tests/unit/api/ingestion/jobs.test.ts`
- `apps/web/tests/unit/api/pre-save/apple.test.ts`
- `apps/web/tests/unit/api/spotify/fal-analysis.test.ts`
- `apps/web/tests/unit/api/spotify/search.test.ts`
- `apps/web/tests/unit/api/track/route.test.ts`
- `apps/web/tests/unit/api/waitlist/waitlist.test.ts`
- `apps/web/tests/unit/app/artist-notifications-page.test.tsx`
- `apps/web/tests/unit/app/artist-profiles-page.test.tsx`
- `apps/web/tests/unit/app/auth-layout.test.tsx`
- `apps/web/tests/unit/app/new-landing-page.test.tsx`
- `apps/web/tests/unit/app/onboarding/actions/avatar.test.ts`
- `apps/web/tests/unit/app/onboarding/actions/connect-spotify.test.ts`
- `apps/web/tests/unit/app/profile-layout.test.tsx`
- `apps/web/tests/unit/artists-page-config.test.ts`
- `apps/web/tests/unit/auth-client-providers.test.tsx`
- `apps/web/tests/unit/billing-providers.test.tsx`
- `apps/web/tests/unit/chat/ChatEntityRightPanelHost.test.tsx`
- `apps/web/tests/unit/chat/tool-events.test.ts`
- `apps/web/tests/unit/chat/useSuggestedProfiles.test.ts`
- `apps/web/tests/unit/client-providers-query.test.tsx`
- `apps/web/tests/unit/components/admin/AdminProfileSidebar.test.tsx`
- `apps/web/tests/unit/components/admin/GrowthIntakeComposer.test.tsx`
- `apps/web/tests/unit/components/admin/PlatformStatsStrip.test.tsx`
- `apps/web/tests/unit/components/organisms/AuthShellWrapper.test.tsx`
- `apps/web/tests/unit/components/providers/clerkAvailability.test.ts`
- `apps/web/tests/unit/components/releases/ProviderStatusDot.test.tsx`
- `apps/web/tests/unit/core-providers-route-variant.test.tsx`
- `apps/web/tests/unit/dashboard/CatalogHealthSection.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardAudienceTable.test.tsx`
- `apps/web/tests/unit/dashboard/DspPresenceSidebar.test.tsx`
- `apps/web/tests/unit/dashboard/DspPresenceView.test.tsx`
- `apps/web/tests/unit/dashboard/EarningsTabTippers.test.tsx`
- `apps/web/tests/unit/dashboard/ReleaseProviderMatrix.test.tsx`
- `apps/web/tests/unit/dashboard/drawer-chrome.test.tsx`
- `apps/web/tests/unit/dashboard/platform-category.test.ts`
- `apps/web/tests/unit/dashboard/presence-actions.test.ts`
- `apps/web/tests/unit/dashboard/useReleaseProviderMatrix.test.tsx`
- `apps/web/tests/unit/dashboard/useReleaseProviderMatrix.toggle.test.tsx`
- `apps/web/tests/unit/demo/DemoPublicProfileSurface.test.tsx`
- `apps/web/tests/unit/demo/DemoTimWhiteProfileSurface.test.tsx`
- `apps/web/tests/unit/discography/artist-parser.test.ts`
- `apps/web/tests/unit/discography/recording-artists.test.ts`
- `apps/web/tests/unit/discography/track-provider-links.test.ts`
- `apps/web/tests/unit/enrichment-status-state-machine.test.ts`
- `apps/web/tests/unit/home/HeroSpotifySearch.test.tsx`
- `apps/web/tests/unit/home/HomeAdaptiveProfileStory.test.tsx`
- `apps/web/tests/unit/home/marketing-content-guardrails.test.ts`
- `apps/web/tests/unit/home/tim-white-profile.test.ts`
- `apps/web/tests/unit/icon-contrast.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-middleware-bypass.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-webhook-handlers.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-webhook-registry.test.ts`
- `apps/web/tests/unit/lib/chat/submit-feedback.test.ts`
- `apps/web/tests/unit/lib/discography/release-track-loader.test.ts`
- `apps/web/tests/unit/lib/discography/spotify-import.test.ts`
- `apps/web/tests/unit/lib/discography/sync-profile-genres.test.ts`
- `apps/web/tests/unit/lib/email/claim-invite-template.test.ts`
- `apps/web/tests/unit/lib/ingestion/flows/avatar-hosting.test.ts`
- `apps/web/tests/unit/lib/ingestion/magic-profile-avatar.test.ts`
- `apps/web/tests/unit/lib/ingestion/profile-enrichment.test.ts`
- `apps/web/tests/unit/lib/ingestion/session.test.ts`
- `apps/web/tests/unit/lib/ingestion/soundcloud-pro-badge.test.ts`
- `apps/web/tests/unit/lib/ingestion/strategies/linktree/tracking-pixels.test.ts`
- `apps/web/tests/unit/lib/notifications/domain.test.ts`
- `apps/web/tests/unit/lib/playlists/curate-tracklist.test.ts`
- `apps/web/tests/unit/lib/sentry/init-state.test.ts`
- `apps/web/tests/unit/lib/sentry/route-detector.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.misc.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.module.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.routes.test.ts`
- `apps/web/tests/unit/lib/spotify/artist-id.test.ts`
- `apps/web/tests/unit/lib/spotify/circuit-breaker.test.ts`
- `apps/web/tests/unit/lib/spotify/jovie-account.test.ts`
- `apps/web/tests/unit/lib/stripe/dunning.test.ts`
- `apps/web/tests/unit/lib/submission-agent/allmusic-provider.test.ts`
- `apps/web/tests/unit/lib/submission-agent/amazon-provider.test.ts`
- `apps/web/tests/unit/lib/submission-agent/discovery.test.ts`
- `apps/web/tests/unit/lib/submission-agent/monitor-worker.test.ts`
- `apps/web/tests/unit/lib/submission-agent/musicbrainz-provider.test.ts`
- `apps/web/tests/unit/lib/submission-agent/provider-registry.test.ts`
- `apps/web/tests/unit/lib/submission-agent/send-worker.test.ts`
- `apps/web/tests/unit/lib/verification/notifications.test.ts`
- `apps/web/tests/unit/links/SortableLinkItem.test.tsx`
- `apps/web/tests/unit/onboarding/onboarding-checkout.test.tsx`
- `apps/web/tests/unit/organisms/TipSection.test.tsx`
- `apps/web/tests/unit/organisms/release-credits-action.test.ts`
- `apps/web/tests/unit/profile/ProfilePrimaryActionCard.test.tsx`
- `apps/web/tests/unit/profile/featured-playlist-fallback-discovery.test.ts`
- `apps/web/tests/unit/profile/featured-playlist-fallback-web.test.ts`
- `apps/web/tests/unit/profile/featured-playlist-fallback.test.ts`
- `apps/web/tests/unit/profile/profile-compact-template.test.tsx`
- `apps/web/tests/unit/profile/profile-links.test.tsx`
- `apps/web/tests/unit/profile/view-models.test.ts`
- `apps/web/tests/unit/providers/clerk-availability.test.ts`
- `apps/web/tests/unit/public-page-error-fallback.test.tsx`
- `apps/web/tests/unit/release/release-artist-link.test.tsx`
- `apps/web/tests/unit/release/release-landing-page.test.tsx`
- `apps/web/tests/unit/release/smart-link-metadata.test.ts`
- `apps/web/tests/unit/release/sounds-landing-page.test.tsx`
- `apps/web/tests/unit/release-tasks/catalog-task-builder-dialog.test.tsx`
- `apps/web/tests/unit/release-tasks/select-tasks.test.ts`
- `apps/web/tests/unit/routes/shell-nav-coverage.test.ts`
- `apps/web/tests/unit/table/TableSearchBar.test.tsx`
- `apps/web/tests/unit/tracking/instantly-pixel.test.tsx`
- `tests/lib/listen-routing.test.ts`
- `tests/lib/provider-links.test.ts`

Dev Docs
- `docs/SCHEMA_MAP.md`

User Docs
- `apps/docs/app/docs/features/releases/page.mdx`
- `apps/docs/app/docs/self-serve-guide/connect-dsps/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Manual Release Creation</strong> — Shipped — free+</summary>

Manual release entry and editing for releases that are not yet fully imported from DSPs.

- Tier: P1
- Hardening rank: 17
- Flags: none
- Entitlements: `canCreateManualReleases`
- Unit coverage: no mapped coverage
- E2E coverage: 2 specs

Pages
- none

Non-API Route Handlers
- none

API Route Handlers
- none

Server Actions
- none

Tables
- none

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/tests/components/organisms/PersistentAudioBar.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseArtwork.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseDspLinks.interaction.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseLyricsSection.autosave.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseMetadata.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebar-links.interaction.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebarHeader.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebarLinks.interaction.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseTrackList.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/TrackDetailPanel.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/TrackSidebar.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/useTrackAudioPlayer.test.ts`
- `apps/web/tests/components/release-provider-matrix/AddReleaseSidebar.test.tsx`
- `apps/web/tests/components/release-provider-matrix/TrackRow.test.tsx`
- `apps/web/tests/components/releases/AddProviderUrlPopover.test.tsx`
- `apps/web/tests/components/releases/ReleaseCell.test.tsx`
- `apps/web/tests/components/releases/ReleaseEditDialog.test.tsx`
- `apps/web/tests/components/releases/release-actions.test.tsx`
- `apps/web/tests/e2e/releases-dashboard.spec.ts`
- `apps/web/tests/e2e/yc-demo.spec.ts`
- `apps/web/tests/lib/queries/gc-time-coverage.test.ts`
- `apps/web/tests/lib/queries/useReleaseTracksQuery.test.tsx`
- `apps/web/tests/unit/actions/releases-actions.create.nightly.test.ts`
- `apps/web/tests/unit/actions/releases-actions.publish.nightly.test.ts`
- `apps/web/tests/unit/actions/releases-actions.update.nightly.test.ts`
- `apps/web/tests/unit/app/dashboard-metadata.test.ts`
- `apps/web/tests/unit/app/release-tasks-page.test.tsx`
- `apps/web/tests/unit/components/releases/ProviderStatusDot.test.tsx`
- `apps/web/tests/unit/dashboard/NewReleaseHeaderAction.test.tsx`
- `apps/web/tests/unit/dashboard/ReleaseProviderMatrix.test.tsx`
- `apps/web/tests/unit/dashboard/ReleasesClientBoundary.test.tsx`
- `apps/web/tests/unit/dashboard/releases-page-client.test.tsx`
- `apps/web/tests/unit/dashboard/task-gating-actions.test.ts`
- `apps/web/tests/unit/demo/demo-releases-experience.test.tsx`
- `apps/web/tests/unit/lib/entitlement-registry.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/plan-config.test.ts`
- `apps/web/tests/unit/lib/plan-gate-edge-cases.test.tsx`
- `apps/web/tests/unit/organisms/ReleasePitchSection.test.tsx`
- `apps/web/tests/unit/organisms/release-credits-action.test.ts`

Dev Docs
- `docs/PRODUCT_CAPABILITIES.md`

User Docs
- `apps/docs/app/docs/features/releases/page.mdx`

Open Gaps
- No mapped unit/integration coverage
- Gate exists without an obvious surfaced page, route, or action

</details>

<details>
<summary><strong>Pre-save & Countdown Campaigns</strong> — Shipped (flagged) — pro+</summary>

Upcoming-release countdown pages, pre-save OAuth flows, and pre-save fulfillment automation.

- Tier: P1
- Hardening rank: 18
- Flags: `SMARTLINK_PRE_SAVE`
- Entitlements: `canAccessFutureReleases`, `canAccessPreSave`
- Unit coverage: 39.4% across 2 files
- E2E coverage: 2 specs

Pages
- none

Non-API Route Handlers
- none

API Route Handlers
- `/api/cron/process-pre-saves` (cron) — `apps/web/app/api/cron/process-pre-saves/route.ts`
- `/api/pre-save/apple` (auth) — `apps/web/app/api/pre-save/apple/route.ts`
- `/api/pre-save/spotify/callback` (auth) — `apps/web/app/api/pre-save/spotify/callback/route.ts`
- `/api/pre-save/spotify/start` (public) — `apps/web/app/api/pre-save/spotify/start/route.ts`

Server Actions
- none

Tables
- `preSaveTokens` — `apps/web/lib/db/schema/pre-save.ts`

Jobs
- `/api/cron/process-pre-saves` — callable only

Webhooks
- none

Mapped Tests
- `apps/web/tests/e2e/content-gate.spec.ts`
- `apps/web/tests/e2e/pro-feature-gates.spec.ts`
- `apps/web/tests/lib/pre-save/spotify.test.ts`
- `apps/web/tests/unit/api/account/delete-route.test.ts`
- `apps/web/tests/unit/api/cron/process-pre-saves.test.ts`
- `apps/web/tests/unit/api/pre-save/apple.test.ts`
- `apps/web/tests/unit/app/onboarding/actions/connect-spotify.test.ts`
- `apps/web/tests/unit/dashboard/ReleaseProviderMatrix.test.tsx`
- `apps/web/tests/unit/lib/entitlement-registry.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/plan-config.test.ts`
- `apps/web/tests/unit/lib/plan-gate-edge-cases.test.tsx`
- `apps/web/tests/unit/release/pre-save-actions.test.tsx`
- `apps/web/tests/unit/release/smart-link-metadata.test.ts`

Dev Docs
- `docs/STATSIG_FEATURE_GATES.md`
- `docs/CRON_REGISTRY.md`

User Docs
- `apps/docs/app/docs/features/releases/page.mdx`
- `apps/docs/app/docs/plans-pricing/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Promo Downloads</strong> — Shipped — free+</summary>

Protected promo-download gates, OTP verification, and release-level download management.

- Tier: P1
- Hardening rank: 19
- Flags: none
- Entitlements: none
- Unit coverage: no mapped coverage
- E2E coverage: 1 specs

Pages
- `/[username]/[slug]/download` — `apps/web/app/[username]/[slug]/download/page.tsx`
- `/app/dashboard/releases/[releaseId]/downloads` — `apps/web/app/app/(shell)/dashboard/releases/[releaseId]/downloads/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/promo-downloads/[id]/request-otp` (public) — `apps/web/app/api/promo-downloads/[id]/request-otp/route.ts`
- `/api/promo-downloads/[id]` (auth) — `apps/web/app/api/promo-downloads/[id]/route.ts`
- `/api/promo-downloads/[id]/verify-otp` (public) — `apps/web/app/api/promo-downloads/[id]/verify-otp/route.ts`
- `/api/promo-downloads/confirm` (auth) — `apps/web/app/api/promo-downloads/confirm/route.ts`
- `/api/promo-downloads/upload-token` (auth) — `apps/web/app/api/promo-downloads/upload-token/route.ts`

Server Actions
- none

Tables
- `promoDownloadEvents` — `apps/web/lib/db/schema/promo-downloads.ts`
- `promoDownloads` — `apps/web/lib/db/schema/promo-downloads.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/tests/e2e/tip-promo.spec.ts`
- `apps/web/tests/unit/e2e/seed-test-data.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-middleware-bypass.test.ts`

Dev Docs
- `docs/API_ROUTE_MAP.md`

User Docs
- `apps/docs/app/docs/features/releases/page.mdx`

Open Gaps
- No mapped unit/integration coverage

</details>

<details>
<summary><strong>Click Tracking & Analytics</strong> — Shipped — free+</summary>

Core analytics collection, dashboard summaries, retention windows, and activity feeds.

- Tier: P1
- Hardening rank: 20
- Flags: none
- Entitlements: `canAccessAdvancedAnalytics`, `canFilterSelfFromAnalytics`, `analyticsRetentionDays`
- Unit coverage: 64.4% across 7 files
- E2E coverage: 22 specs

Pages
- `/app/dashboard/overview` — `apps/web/app/app/(shell)/dashboard/overview/page.tsx`
- `/app/settings/analytics` — `apps/web/app/app/(shell)/settings/analytics/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/audience/click` (public) — `apps/web/app/api/audience/click/route.ts`
- `/api/audience/visit` (public) — `apps/web/app/api/audience/visit/route.ts`
- `/api/dashboard/activity/recent` (auth) — `apps/web/app/api/dashboard/activity/recent/route.ts`
- `/api/dashboard/analytics` (auth) — `apps/web/app/api/dashboard/analytics/route.ts`

Server Actions
- none

Tables
- `audienceActions` — `apps/web/lib/db/schema/analytics.ts`
- `audienceBlocks` — `apps/web/lib/db/schema/analytics.ts`
- `audienceMembers` — `apps/web/lib/db/schema/analytics.ts`
- `audienceReferrers` — `apps/web/lib/db/schema/analytics.ts`
- `clickEvents` — `apps/web/lib/db/schema/analytics.ts`
- `dailyProfileViews` — `apps/web/lib/db/schema/analytics.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/app/api/dashboard/audience/source-links/route.test.ts`
- `apps/web/app/billing/success/page.test.tsx`
- `apps/web/components/features/dashboard/organisms/AnalyticsSidebar.test.tsx`
- `apps/web/components/homepage/HomepageIntent.test.tsx`
- `apps/web/components/molecules/drawer/DrawerAnalyticsSummaryCard.spec.tsx`
- `apps/web/lib/__tests__/changelog-parser.test.ts`
- `apps/web/lib/canonical-surfaces.test.ts`
- `apps/web/tests/bench/track-route.bench.test.ts`
- `apps/web/tests/components/BillingDashboard.test.tsx`
- `apps/web/tests/components/billing.test.tsx`
- `apps/web/tests/components/dashboard/UniversalLinkInput.a11y.test.tsx`
- `apps/web/tests/components/dashboard/UniversalLinkInput.voice-recording.test.tsx`
- `apps/web/tests/components/dashboard/organisms/apple-style-onboarding/analytics.test.ts`
- `apps/web/tests/components/dashboard/organisms/onboarding-v2-performance.test.tsx`
- `apps/web/tests/components/dashboard/socials-form/useSocialsForm.test.tsx`
- `apps/web/tests/components/molecules/GenrePicker.test.tsx`
- `apps/web/tests/components/molecules/drawer/DrawerLoadingSkeleton.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebar-links.interaction.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebarLinks.interaction.test.tsx`
- `apps/web/tests/components/profile/ClaimBanner.test.tsx`
- `apps/web/tests/components/profile-drawers-dismiss.test.tsx`
- `apps/web/tests/components/release-provider-matrix/ReleaseFilterDropdown.test.tsx`
- `apps/web/tests/components/user-button.test.tsx`
- `apps/web/tests/contracts/dashboard-apis.nightly.test.ts`
- `apps/web/tests/e2e/anti-cloaking.spec.ts`
- `apps/web/tests/e2e/artist-notifications.spec.ts`
- `apps/web/tests/e2e/artist-profiles.spec.ts`
- `apps/web/tests/e2e/auth.spec.ts`
- `apps/web/tests/e2e/dashboard.access-control.spec.ts`
- `apps/web/tests/e2e/demo-live-parity.spec.ts`
- `apps/web/tests/e2e/demo-qa.spec.ts`
- `apps/web/tests/e2e/homepage.spec.ts`
- `apps/web/tests/e2e/linear-shell-parity.spec.ts`
- `apps/web/tests/e2e/new-landing.spec.ts`
- `apps/web/tests/e2e/onboarding.spec.ts`
- `apps/web/tests/e2e/profile-cls-audit.spec.ts`
- `apps/web/tests/e2e/profile-drawers.spec.ts`
- `apps/web/tests/e2e/profile-performance.spec.ts`
- `apps/web/tests/e2e/profile-subscribe-e2e.spec.ts`
- `apps/web/tests/e2e/profile-visual-audit.spec.ts`
- `apps/web/tests/e2e/profile.spec.ts`
- `apps/web/tests/e2e/smartlink-experience.spec.ts`
- `apps/web/tests/e2e/smoke-public.spec.ts`
- `apps/web/tests/e2e/synthetic-golden-path.spec.ts`
- `apps/web/tests/e2e/visual-regression.spec.ts`
- `apps/web/tests/e2e/yc-demo.spec.ts`
- `apps/web/tests/integration/analytics-tracking.test.ts`
- `apps/web/tests/lib/analytics/data-retention.test.ts`
- `apps/web/tests/lib/analytics/pii-encryption.test.ts`
- `apps/web/tests/lib/analytics/query-timeout.test.ts`
- `apps/web/tests/lib/analytics/tracking-token.test.ts`
- `apps/web/tests/lib/anti-cloaking.test.ts`
- `apps/web/tests/lib/monitoring/alerts.test.ts`
- `apps/web/tests/lib/monitoring/database.test.ts`
- `apps/web/tests/lib/monitoring/performance.test.ts`
- `apps/web/tests/lib/monitoring/regression.test.ts`
- `apps/web/tests/lib/monitoring/user-journey.test.ts`
- `apps/web/tests/lib/monitoring/web-vitals.test.ts`
- `apps/web/tests/lib/platform-detection.test.ts`
- `apps/web/tests/lib/queries/keys.test.ts`
- `apps/web/tests/lib/queries/useBillingMutations.test.tsx`
- `apps/web/tests/lib/queries/useDashboardSocialLinksQuery.test.tsx`
- `apps/web/tests/lib/rls-policies.test.ts`
- `apps/web/tests/lib/utils/bot-detection.test.ts`
- `apps/web/tests/product-screenshots/insights.spec.ts`
- `apps/web/tests/unit/CheckoutSuccessPage.test.tsx`
- `apps/web/tests/unit/ClaimHandleForm.test.tsx`
- `apps/web/tests/unit/CopyToClipboardButton.test.tsx`
- `apps/web/tests/unit/ProblemSolutionSection.test.tsx`
- `apps/web/tests/unit/SupportPage.test.tsx`
- `apps/web/tests/unit/actions/releases-actions.create.nightly.test.ts`
- `apps/web/tests/unit/actions/releases-actions.publish.nightly.test.ts`
- `apps/web/tests/unit/actions/releases-actions.update.nightly.test.ts`
- `apps/web/tests/unit/actions/tour-dates-actions.test.ts`
- `apps/web/tests/unit/api/admin/creator-invite-bulk.test.ts`
- `apps/web/tests/unit/api/audience/click.test.ts`
- `apps/web/tests/unit/api/audience/visit.test.ts`
- `apps/web/tests/unit/api/cron/daily-maintenance.test.ts`
- `apps/web/tests/unit/api/cron/data-retention.test.ts`
- `apps/web/tests/unit/api/cron/schedule-release-notifications.test.ts`
- `apps/web/tests/unit/api/cron/send-release-notifications.test.ts`
- `apps/web/tests/unit/api/dashboard/analytics.test.ts`
- `apps/web/tests/unit/api/dashboard/earnings.test.ts`
- `apps/web/tests/unit/api/dashboard/profile/db-operations.test.ts`
- `apps/web/tests/unit/api/tour-date-analytics-route.test.ts`
- `apps/web/tests/unit/api/track/route.test.ts`
- `apps/web/tests/unit/api/webhooks/stripe-tips.test.ts`
- `apps/web/tests/unit/app/billing-success-page.test.tsx`
- `apps/web/tests/unit/app/internal-shell-surface-guard.test.ts`
- `apps/web/tests/unit/app/onboarding/actions/connect-spotify.test.ts`
- `apps/web/tests/unit/app/signup-page.test.tsx`
- `apps/web/tests/unit/app/surface-elevation-guardrails.test.ts`
- `apps/web/tests/unit/billing-providers.test.tsx`
- `apps/web/tests/unit/chat/ChatMessage.analytics-card.test.tsx`
- `apps/web/tests/unit/chat/InlineChatArea.tool-rendering.test.tsx`
- `apps/web/tests/unit/chat/intent-classification.test.ts`
- `apps/web/tests/unit/chat/profile-edit-chat.test.ts`
- `apps/web/tests/unit/components/molecules/AvatarUploadable.progress.test.tsx`
- `apps/web/tests/unit/components/profile/useProfileNotificationsController.test.tsx`
- `apps/web/tests/unit/cookie-banner-fixes.test.tsx`
- `apps/web/tests/unit/dashboard/AnalyticsSidebar.test.ts`
- `apps/web/tests/unit/dashboard/CelebrationCardPreview.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardAudienceTable.test.tsx`
- `apps/web/tests/unit/dashboard/FirstFanCelebration.test.tsx`
- `apps/web/tests/unit/dashboard/GetStartedChecklistCard.test.tsx`
- `apps/web/tests/unit/dashboard/ProfileContactSidebar.scroll.test.tsx`
- `apps/web/tests/unit/dashboard/ProfileTipsSurface.test.tsx`
- `apps/web/tests/unit/dashboard/RangeToggle.test.tsx`
- `apps/web/tests/unit/dashboard/SettingsAdPixelsSection.test.tsx`
- `apps/web/tests/unit/dashboard/SettingsPolished.test.tsx`
- `apps/web/tests/unit/dashboard/SocialBioNudge.test.tsx`
- `apps/web/tests/unit/dashboard/audience-table/AudienceActionCells.test.tsx`
- `apps/web/tests/unit/dashboard/dashboard-clerk-safe.test.tsx`
- `apps/web/tests/unit/dashboard/dashboard-data-prefetch.test.ts`
- `apps/web/tests/unit/dashboard/drawer-chrome.test.tsx`
- `apps/web/tests/unit/landing/SharedMarketingHero.test.tsx`
- `apps/web/tests/unit/lib/analytics-range-clamp.test.ts`
- `apps/web/tests/unit/lib/auth/constants.test.ts`
- `apps/web/tests/unit/lib/auth/proxy-state.test.ts`
- `apps/web/tests/unit/lib/chat/system-prompt.test.ts`
- `apps/web/tests/unit/lib/content-security-policy.test.ts`
- `apps/web/tests/unit/lib/entitlement-boundary-helpers.test.ts`
- `apps/web/tests/unit/lib/entitlement-registry.test.ts`
- `apps/web/tests/unit/lib/entitlements-billing-negative.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/notifications/domain.test.ts`
- `apps/web/tests/unit/lib/plan-config.test.ts`
- `apps/web/tests/unit/lib/plan-gate-edge-cases.test.tsx`
- `apps/web/tests/unit/lib/plan-gate.test.tsx`
- `apps/web/tests/unit/lib/platform-detection/environment.test.ts`
- `apps/web/tests/unit/lib/queries/useSettingsMutation.test.tsx`
- `apps/web/tests/unit/lib/rate-limit/config.test.ts`
- `apps/web/tests/unit/lib/rate-limit/rate-limiter.test.ts`
- `apps/web/tests/unit/lib/services/insights/data-aggregator.test.ts`
- `apps/web/tests/unit/lib/services/insights/insight-generator.test.ts`
- `apps/web/tests/unit/lib/tracking/parse-consent-cookie.test.ts`
- `apps/web/tests/unit/links/IngestedSuggestions.accept.test.tsx`
- `apps/web/tests/unit/links/IngestedSuggestions.analytics.test.tsx`
- `apps/web/tests/unit/links/IngestedSuggestions.dismiss.test.tsx`
- `apps/web/tests/unit/links/IngestedSuggestions.edge-cases.test.tsx`
- `apps/web/tests/unit/links/useLinksManager.add.test.ts`
- `apps/web/tests/unit/links/useLinksManager.init.test.ts`
- `apps/web/tests/unit/links/useLinksManager.toggle-edit.test.ts`
- `apps/web/tests/unit/links/useLinksManager.youtube.test.ts`
- `apps/web/tests/unit/links/useLinksPersistence.test.ts`
- `apps/web/tests/unit/links/useSuggestions.accept.test.ts`
- `apps/web/tests/unit/links/useSuggestions.analytics.test.ts`
- `apps/web/tests/unit/links/useSuggestions.dismiss.test.ts`
- `apps/web/tests/unit/links/useSuggestions.sync.test.ts`
- `apps/web/tests/unit/marketing/artist-profile/ArtistProfileSpecWall.test.tsx`
- `apps/web/tests/unit/onboarding/onboarding-checkout.test.tsx`
- `apps/web/tests/unit/organisms/AvatarUpload.test.tsx`
- `apps/web/tests/unit/profile/ArtistContactsButton.test.tsx`
- `apps/web/tests/unit/profile/ProfileInlineNotificationsCTA.test.tsx`
- `apps/web/tests/unit/profile/ProfileModeDrawer.test.tsx`
- `apps/web/tests/unit/profile/ProfilePrimaryCTA.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.accessibility.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.mode-override.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.notifications.test.tsx`
- `apps/web/tests/unit/profile/ProfileUnifiedDrawerReleases.test.tsx`
- `apps/web/tests/unit/profile/bot-detection.test.ts`
- `apps/web/tests/unit/profile/inline-notifications-cta.test.tsx`
- `apps/web/tests/unit/profile/notifications-otp-step.test.tsx`
- `apps/web/tests/unit/profile/profile-components.test.tsx`
- `apps/web/tests/unit/profile/profile-layout-shift.test.tsx`
- `apps/web/tests/unit/profile/profile-links.test.tsx`
- `apps/web/tests/unit/profile/profile-photo-context-menu.test.tsx`
- `apps/web/tests/unit/profile/profile-view-api.test.ts`
- `apps/web/tests/unit/profile/subscription-form-states.test.tsx`
- `apps/web/tests/unit/profile/subscription-sms-flow.test.tsx`
- `apps/web/tests/unit/profile/subscription-success-name-capture.test.tsx`
- `apps/web/tests/unit/profile/useSubscriptionForm.test.tsx`
- `apps/web/tests/unit/seed-data-coverage.test.ts`
- `apps/web/tests/unit/tour-date-sidebar-analytics.test.tsx`
- `apps/web/tests/unit/tracking/instantly-pixel.test.tsx`

Dev Docs
- `docs/testing/TEST_COVERAGE_ANALYSIS.md`

User Docs
- `apps/docs/app/docs/features/analytics/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>AI-Powered Insights</strong> — Shipped — pro+</summary>

Insight generation, eligibility checks, and creator-facing AI insight delivery.

- Tier: P1
- Hardening rank: 21
- Flags: none
- Entitlements: none
- Unit coverage: 92.4% across 5 files
- E2E coverage: 1 specs

Pages
- `/app/dashboard/insights` — `apps/web/app/app/(shell)/dashboard/insights/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/cron/generate-insights` (cron) — `apps/web/app/api/cron/generate-insights/route.ts`
- `/api/insights/[id]` (public) — `apps/web/app/api/insights/[id]/route.ts`
- `/api/insights/generate` (auth) — `apps/web/app/api/insights/generate/route.ts`
- `/api/insights` (auth) — `apps/web/app/api/insights/route.ts`
- `/api/insights/summary` (auth) — `apps/web/app/api/insights/summary/route.ts`

Server Actions
- none

Tables
- `aiInsights` — `apps/web/lib/db/schema/insights.ts`
- `insightGenerationRuns` — `apps/web/lib/db/schema/insights.ts`

Jobs
- `/api/cron/generate-insights` — `0 5 * * *`

Webhooks
- none

Mapped Tests
- `apps/web/lib/canonical-surfaces.test.ts`
- `apps/web/tests/e2e/artist-profiles.spec.ts`
- `apps/web/tests/lib/queries/query-refetch-policy.test.ts`
- `apps/web/tests/product-screenshots/insights.spec.ts`
- `apps/web/tests/unit/EmptyState.test.tsx`
- `apps/web/tests/unit/api/chat/conversation-message-routes.test.ts`
- `apps/web/tests/unit/api/cron/generate-insights.test.ts`
- `apps/web/tests/unit/api/insights/generate.test.ts`
- `apps/web/tests/unit/api/insights/insight-update.test.ts`
- `apps/web/tests/unit/api/insights/route.test.ts`
- `apps/web/tests/unit/api/insights/summary.test.ts`
- `apps/web/tests/unit/chat/ChatMessage.analytics-card.test.tsx`
- `apps/web/tests/unit/chat/InlineChatArea.tool-rendering.test.tsx`
- `apps/web/tests/unit/chat/greeting.test.ts`
- `apps/web/tests/unit/chat/message-parts.test.ts`
- `apps/web/tests/unit/chat/tool-events.test.ts`
- `apps/web/tests/unit/dashboard/insights-components.test.tsx`
- `apps/web/tests/unit/lib/chat/system-prompt.test.ts`
- `apps/web/tests/unit/lib/insights/chat-presentation.test.ts`
- `apps/web/tests/unit/lib/services/insights/data-aggregator.test.ts`
- `apps/web/tests/unit/lib/services/insights/insight-generator.test.ts`
- `apps/web/tests/unit/marketing/artist-profile/ArtistProfileSpecWall.test.tsx`

Dev Docs
- `docs/CRON_REGISTRY.md`

User Docs
- `apps/docs/app/docs/features/analytics/page.mdx`
- `apps/docs/app/docs/features/analytics/ai-insights/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Fan CRM, Contacts & Audience Capture</strong> — Shipped (flagged) — free+ / pro+</summary>

Audience dashboard, contact management, export, source groups, and audience CRM plan gates.

- Tier: P1
- Hardening rank: 22
- Flags: `SHOW_AUDIENCE_CRM_SECTION`
- Entitlements: `canExportContacts`, `contactsLimit`
- Unit coverage: 63.2% across 5 files
- E2E coverage: 1 specs

Pages
- `/app/dashboard/audience` — `apps/web/app/app/(shell)/dashboard/audience/page.tsx`
- `/app/dashboard/contacts` — `apps/web/app/app/(shell)/dashboard/contacts/page.tsx`
- `/app/settings/audience` — `apps/web/app/app/(shell)/settings/audience/page.tsx`
- `/app/settings/contacts` — `apps/web/app/app/(shell)/settings/contacts/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/dashboard/audience/members` (auth) — `apps/web/app/api/dashboard/audience/members/route.ts`
- `/api/dashboard/audience/source-groups/[id]` (public) — `apps/web/app/api/dashboard/audience/source-groups/[id]/route.ts`
- `/api/dashboard/audience/source-groups` (auth) — `apps/web/app/api/dashboard/audience/source-groups/route.ts`
- `/api/dashboard/audience/source-links/[id]` (public) — `apps/web/app/api/dashboard/audience/source-links/[id]/route.ts`
- `/api/dashboard/audience/source-links` (auth) — `apps/web/app/api/dashboard/audience/source-links/route.ts`
- `/api/dashboard/audience/subscribers` (auth) — `apps/web/app/api/dashboard/audience/subscribers/route.ts`
- `/api/dashboard/contacts` (auth) — `apps/web/app/api/dashboard/contacts/route.ts`

Server Actions
- `apps/web/app/app/(shell)/dashboard/audience/actions.ts`
- `apps/web/app/app/(shell)/dashboard/contacts/actions.ts`

Tables
- `audienceSourceGroups` — `apps/web/lib/db/schema/analytics.ts`
- `audienceSourceLinks` — `apps/web/lib/db/schema/analytics.ts`
- `creatorContacts` — `apps/web/lib/db/schema/profiles.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/app/api/dashboard/audience/source-links/route.test.ts`
- `apps/web/app/api/dashboard/audience/source-route-helpers.test.ts`
- `apps/web/components/features/dashboard/organisms/profile-contact-sidebar/profileLinkShareMenu.test.ts`
- `apps/web/tests/components/dashboard/organisms/ProfileAboutTab.test.tsx`
- `apps/web/tests/contracts/dashboard-apis.nightly.test.ts`
- `apps/web/tests/e2e/dashboard-pages-health.spec.ts`
- `apps/web/tests/integration/analytics-tracking.test.ts`
- `apps/web/tests/lib/ingestion/linktree-real-ingestion.test.ts`
- `apps/web/tests/product-screenshots/audience.spec.ts`
- `apps/web/tests/unit/actions/contacts-actions.test.ts`
- `apps/web/tests/unit/api/admin/creator-invite-bulk.test.ts`
- `apps/web/tests/unit/api/dashboard/contacts.test.ts`
- `apps/web/tests/unit/app/internal-shell-surface-guard.test.ts`
- `apps/web/tests/unit/chat/ChatEntityRightPanelHost.test.tsx`
- `apps/web/tests/unit/components/AuthShellWrapper.test.tsx`
- `apps/web/tests/unit/components/organisms/AuthShellWrapper.test.tsx`
- `apps/web/tests/unit/dashboard/ProfileContactSidebar.scroll.test.tsx`
- `apps/web/tests/unit/dashboard/SuggestedDspMatches.test.tsx`
- `apps/web/tests/unit/inbox/inbox-utils.test.ts`
- `apps/web/tests/unit/lib/contact-limit-entitlements.test.ts`
- `apps/web/tests/unit/lib/contact-limit.test.ts`
- `apps/web/tests/unit/lib/entitlement-boundary-helpers.test.ts`
- `apps/web/tests/unit/lib/entitlement-registry.test.ts`
- `apps/web/tests/unit/lib/entitlements-billing-negative.test.ts`
- `apps/web/tests/unit/lib/entitlements-concurrency-isolation.test.ts`
- `apps/web/tests/unit/lib/entitlements-state-transitions.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/fit-scoring/service.test.ts`
- `apps/web/tests/unit/lib/plan-config.test.ts`
- `apps/web/tests/unit/lib/plan-gate-edge-cases.test.tsx`
- `apps/web/tests/unit/lib/plan-gate.test.tsx`
- `apps/web/tests/unit/profile/profile-links.test.tsx`

Dev Docs
- `docs/testing/TEST_COVERAGE_ANALYSIS.md`

User Docs
- `apps/docs/app/docs/features/audience/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Ad Pixels & Retargeting</strong> — Shipped — pro+</summary>

Creator pixel configuration, test events, forwarded platform events, and retargeting settings.

- Tier: P1
- Hardening rank: 23
- Flags: none
- Entitlements: `canAccessAdPixels`
- Unit coverage: 53.6% across 3 files
- E2E coverage: 3 specs

Pages
- `/app/settings/ad-pixels` — `apps/web/app/app/(shell)/settings/ad-pixels/page.tsx`
- `/app/settings/retargeting-ads` — `apps/web/app/app/(shell)/settings/retargeting-ads/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/cron/pixel-forwarding` (cron) — `apps/web/app/api/cron/pixel-forwarding/route.ts`
- `/api/cron/purge-pixel-ips` (cron) — `apps/web/app/api/cron/purge-pixel-ips/route.ts`
- `/api/dashboard/pixels/health` (public) — `apps/web/app/api/dashboard/pixels/health/route.ts`
- `/api/dashboard/pixels` (auth) — `apps/web/app/api/dashboard/pixels/route.ts`
- `/api/dashboard/pixels/test-event` (public) — `apps/web/app/api/dashboard/pixels/test-event/route.ts`
- `/api/dashboard/retargeting/ad-creative` (admin) — `apps/web/app/api/dashboard/retargeting/ad-creative/route.tsx`
- `/api/dashboard/retargeting/attribution` (public) — `apps/web/app/api/dashboard/retargeting/attribution/route.ts`

Server Actions
- none

Tables
- `creatorPixels` — `apps/web/lib/db/schema/pixels.ts`
- `pixelEvents` — `apps/web/lib/db/schema/pixels.ts`

Jobs
- `/api/cron/pixel-forwarding` — callable only
- `/api/cron/purge-pixel-ips` — `0 3 * * *`

Webhooks
- none

Mapped Tests
- `apps/web/tests/contracts/dashboard-apis.nightly.test.ts`
- `apps/web/tests/e2e/chaos-authenticated.spec.ts`
- `apps/web/tests/e2e/responsive-golden-path.spec.ts`
- `apps/web/tests/e2e/visual-regression.spec.ts`
- `apps/web/tests/unit/api/cron/data-retention.test.ts`
- `apps/web/tests/unit/api/cron/pixel-forwarding.test.ts`
- `apps/web/tests/unit/api/cron/purge-pixel-ips.test.ts`
- `apps/web/tests/unit/dashboard/SettingsAdPixelsSection.test.tsx`
- `apps/web/tests/unit/dashboard/SettingsPolished.test.tsx`
- `apps/web/tests/unit/lib/entitlement-registry.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/fit-scoring/calculator.test.ts`
- `apps/web/tests/unit/lib/ingestion/strategies/linktree/tracking-pixels.test.ts`
- `apps/web/tests/unit/lib/plan-config.test.ts`
- `apps/web/tests/unit/lib/plan-gate-edge-cases.test.tsx`
- `apps/web/tests/unit/lib/plan-gate.test.tsx`
- `apps/web/tests/unit/lib/retargeting/claim-creatives.test.ts`
- `apps/web/tests/unit/lib/tracking/fire-subscribe-event.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/facebook.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/google.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/index.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/tiktok.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/types.test.ts`
- `apps/web/tests/unit/lib/tracking/health-status.test.ts`
- `apps/web/tests/unit/lib/tracking/track-helpers.test.ts`
- `apps/web/tests/unit/profile/profile-layout-shift.test.tsx`
- `apps/web/tests/unit/routes/shell-nav-coverage.test.ts`
- `apps/web/tests/unit/tracking/instantly-pixel.test.tsx`

Dev Docs
- `docs/CRON_REGISTRY.md`

User Docs
- `apps/docs/app/docs/features/analytics/page.mdx`
- `apps/docs/app/docs/features/retargeting-ads/page.mdx`
- `apps/docs/app/docs/self-serve-guide/set-up-ad-pixels/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>AI Career Assistant, Album Art & Chat</strong> — Shipped (flagged) — free+</summary>

AI chat, conversation history, pitch generation, and album-art creation flows.

- Tier: P1
- Hardening rank: 24
- Flags: `ALBUM_ART_GENERATION`, `THREADS_ENABLED`
- Entitlements: `aiCanUseTools`, `canGenerateAlbumArt`, `aiDailyMessageLimit`, `aiPitchGenPerRelease`
- Unit coverage: 69.5% across 30 files
- E2E coverage: 3 specs

Pages
- `/app/chat/[id]` — `apps/web/app/app/(shell)/chat/[id]/page.tsx`
- `/app/chat` — `apps/web/app/app/(shell)/chat/page.tsx`
- `/app/dashboard/chat` — `apps/web/app/app/(shell)/dashboard/chat/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/canvas/generate` (auth) — `apps/web/app/api/canvas/generate/route.ts`
- `/api/chat/album-art/apply` (public) — `apps/web/app/api/chat/album-art/apply/route.ts`
- `/api/chat/album-art/create-release-and-apply` (public) — `apps/web/app/api/chat/album-art/create-release-and-apply/route.ts`
- `/api/chat/confirm-edit` (auth) — `apps/web/app/api/chat/confirm-edit/route.ts`
- `/api/chat/confirm-link` (auth) — `apps/web/app/api/chat/confirm-link/route.ts`
- `/api/chat/confirm-remove-link` (auth) — `apps/web/app/api/chat/confirm-remove-link/route.ts`
- `/api/chat/conversations/[id]/messages` (public) — `apps/web/app/api/chat/conversations/[id]/messages/route.ts`
- `/api/chat/conversations/[id]` (public) — `apps/web/app/api/chat/conversations/[id]/route.ts`
- `/api/chat/conversations` (public) — `apps/web/app/api/chat/conversations/route.ts`
- `/api/chat` (auth) — `apps/web/app/api/chat/route.ts`
- `/api/chat/usage` (auth) — `apps/web/app/api/chat/usage/route.ts`

Server Actions
- none

Tables
- `chatAuditLog` — `apps/web/lib/db/schema/chat.ts`
- `chatConversations` — `apps/web/lib/db/schema/chat.ts`
- `chatMessages` — `apps/web/lib/db/schema/chat.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/lib/chat/tokens.test.ts`
- `apps/web/lib/share/destinations.test.ts`
- `apps/web/scripts/performance-optimizer-lib.test.ts`
- `apps/web/tests/components/dashboard/DashboardNav.interaction.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseArtwork.test.tsx`
- `apps/web/tests/e2e/chat-pitch-generation.spec.ts`
- `apps/web/tests/e2e/core-user-journeys.spec.ts`
- `apps/web/tests/e2e/golden-path-app.spec.ts`
- `apps/web/tests/unit/api/chat/confirm-edit.test.ts`
- `apps/web/tests/unit/api/chat/conversation-message-routes.test.ts`
- `apps/web/tests/unit/api/chat/conversations.test.ts`
- `apps/web/tests/unit/api/chat/usage.test.ts`
- `apps/web/tests/unit/api/cron/data-retention.test.ts`
- `apps/web/tests/unit/api/extension/action-log-route.test.ts`
- `apps/web/tests/unit/api/onboarding/welcome-chat.test.ts`
- `apps/web/tests/unit/api/webhooks/resend-inbound.test.ts`
- `apps/web/tests/unit/app/dashboard-metadata.test.ts`
- `apps/web/tests/unit/auth/waitlist-gating.test.ts`
- `apps/web/tests/unit/chat/ChatEntityRightPanelHost.test.tsx`
- `apps/web/tests/unit/chat/ChatLoading.test.tsx`
- `apps/web/tests/unit/chat/ChatMessageSkeleton.test.tsx`
- `apps/web/tests/unit/chat/ChatPageClient.test.tsx`
- `apps/web/tests/unit/chat/JovieChat.empty-state.test.tsx`
- `apps/web/tests/unit/chat/JovieChat.styling.test.tsx`
- `apps/web/tests/unit/chat/ai-operations.test.ts`
- `apps/web/tests/unit/chat/chat-context.test.ts`
- `apps/web/tests/unit/chat/confirm-edit-route.test.ts`
- `apps/web/tests/unit/chat/knowledge-retrieval.test.ts`
- `apps/web/tests/unit/chat/session-error-response.test.ts`
- `apps/web/tests/unit/chat/tool-events.test.ts`
- `apps/web/tests/unit/chat/useChatConversationQuery.test.tsx`
- `apps/web/tests/unit/chat/useChatMutations.test.tsx`
- `apps/web/tests/unit/chat/useConfirmChatEditMutation.test.tsx`
- `apps/web/tests/unit/chat-usage-resolve-plan.test.ts`
- `apps/web/tests/unit/dashboard/DashboardNav.test.tsx`
- `apps/web/tests/unit/dashboard/RecentChats.test.tsx`
- `apps/web/tests/unit/dashboard/SuggestedDspMatches.test.tsx`
- `apps/web/tests/unit/dev/DevToolbar.test.tsx`
- `apps/web/tests/unit/icon-contrast.test.ts`
- `apps/web/tests/unit/inbox/inbox-utils.test.ts`
- `apps/web/tests/unit/inbox/webhook-handler.test.ts`
- `apps/web/tests/unit/lib/chat/ai-response-plumbing.test.ts`
- `apps/web/tests/unit/lib/chat/intent-response-sse-stream.test.ts`
- `apps/web/tests/unit/lib/chat/session-context.test.ts`
- `apps/web/tests/unit/lib/chat/submit-feedback.test.ts`
- `apps/web/tests/unit/lib/chat/system-prompt.test.ts`
- `apps/web/tests/unit/lib/discography/spotify-import.test.ts`
- `apps/web/tests/unit/lib/entitlement-registry.test.ts`
- `apps/web/tests/unit/lib/entitlements-state-transitions.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/feature-flags-registry.test.ts`
- `apps/web/tests/unit/lib/feature-flags-server.test.ts`
- `apps/web/tests/unit/lib/fit-scoring/calculator.test.ts`
- `apps/web/tests/unit/lib/fit-scoring/service.test.ts`
- `apps/web/tests/unit/lib/plan-config.test.ts`
- `apps/web/tests/unit/lib/plan-gate-edge-cases.test.tsx`
- `apps/web/tests/unit/lib/rate-limit/limiters.test.ts`
- `apps/web/tests/unit/routes/shell-nav-coverage.test.ts`

Dev Docs
- `docs/PRODUCT_CAPABILITIES.md`

User Docs
- `apps/docs/app/docs/features/chat-ai/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Release Planning, Tasks & Metadata Submission</strong> — Shipped (flagged) — pro+ / max</summary>

Release plan generation, task workspaces, release task catalog, and metadata submission agent APIs.

- Tier: P1
- Hardening rank: 25
- Flags: `SHOW_RELEASE_TOOLBAR_EXTRAS`
- Entitlements: `canAccessTasksWorkspace`, `canGenerateReleasePlans`, `canAccessMetadataSubmissionAgent`
- Unit coverage: 37% across 8 files
- E2E coverage: 4 specs

Pages
- `/app/dashboard/releases/[releaseId]/tasks` — `apps/web/app/app/(shell)/dashboard/releases/[releaseId]/tasks/page.tsx`
- `/app/dashboard/tasks` — `apps/web/app/app/(shell)/dashboard/tasks/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/cron/monitor-metadata-submissions` (cron) — `apps/web/app/api/cron/monitor-metadata-submissions/route.ts`
- `/api/cron/process-metadata-submissions` (cron) — `apps/web/app/api/cron/process-metadata-submissions/route.ts`
- `/api/metadata-submissions/approve-send` (admin) — `apps/web/app/api/metadata-submissions/approve-send/route.ts`
- `/api/metadata-submissions/draft-correction` (admin) — `apps/web/app/api/metadata-submissions/draft-correction/route.ts`
- `/api/metadata-submissions/prepare` (admin) — `apps/web/app/api/metadata-submissions/prepare/route.ts`
- `/api/metadata-submissions/providers` (admin) — `apps/web/app/api/metadata-submissions/providers/route.ts`
- `/api/metadata-submissions/status` (admin) — `apps/web/app/api/metadata-submissions/status/route.ts`

Server Actions
- `apps/web/app/app/(shell)/dashboard/releases/catalog-task-actions.ts`
- `apps/web/app/app/(shell)/dashboard/releases/task-actions.ts`
- `apps/web/app/app/(shell)/dashboard/tasks/task-actions.ts`

Tables
- `customTaskTelemetry` — `apps/web/lib/db/schema/release-tasks.ts`
- `metadataSubmissionArtifacts` — `apps/web/lib/db/schema/metadata-submissions.ts`
- `metadataSubmissionIssues` — `apps/web/lib/db/schema/metadata-submissions.ts`
- `metadataSubmissionRequests` — `apps/web/lib/db/schema/metadata-submissions.ts`
- `metadataSubmissionSnapshots` — `apps/web/lib/db/schema/metadata-submissions.ts`
- `metadataSubmissionTargets` — `apps/web/lib/db/schema/metadata-submissions.ts`
- `releaseSkillClusters` — `apps/web/lib/db/schema/release-tasks.ts`
- `releaseTaskCatalog` — `apps/web/lib/db/schema/release-tasks.ts`
- `releaseTasks` — `apps/web/lib/db/schema/release-tasks.ts`
- `releaseTaskSnapshots` — `apps/web/lib/db/schema/release-tasks.ts`
- `releaseTaskTemplateItems` — `apps/web/lib/db/schema/release-tasks.ts`
- `releaseTaskTemplates` — `apps/web/lib/db/schema/release-tasks.ts`
- `tasks` — `apps/web/lib/db/schema/tasks.ts`

Jobs
- `/api/cron/monitor-metadata-submissions` — callable only
- `/api/cron/process-metadata-submissions` — callable only

Webhooks
- none

Mapped Tests
- `apps/web/components/features/dashboard/tasks/task-presentation.test.ts`
- `apps/web/components/molecules/ReleaseDueBadge.test.tsx`
- `apps/web/components/molecules/filters/TableFilterDropdown.test.tsx`
- `apps/web/scripts/performance-route-resolvers.test.ts`
- `apps/web/tests/components/dashboard/DashboardNav.interaction.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebar-links.interaction.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebarLinks.interaction.test.tsx`
- `apps/web/tests/components/user-button.test.tsx`
- `apps/web/tests/e2e/releases-dashboard.chaos.spec.ts`
- `apps/web/tests/e2e/releases-dashboard.spec.ts`
- `apps/web/tests/e2e/tasks-layout.spec.ts`
- `apps/web/tests/e2e/yc-demo.spec.ts`
- `apps/web/tests/product-screenshots/releases.spec.ts`
- `apps/web/tests/scripts/performance-route-resolvers.test.ts`
- `apps/web/tests/unit/api/metadata-submissions-approve-send.test.ts`
- `apps/web/tests/unit/api/metadata-submissions-prepare.test.ts`
- `apps/web/tests/unit/api/metadata-submissions-status.test.ts`
- `apps/web/tests/unit/app/dashboard-tasks-page.test.tsx`
- `apps/web/tests/unit/app/release-tasks-page.test.tsx`
- `apps/web/tests/unit/app/shell-route-matches.test.ts`
- `apps/web/tests/unit/app/surface-elevation-guardrails.test.ts`
- `apps/web/tests/unit/components/molecules/AvatarUploadable.a11y.test.tsx`
- `apps/web/tests/unit/components/molecules/AvatarUploadable.progress.test.tsx`
- `apps/web/tests/unit/components/molecules/DrawerTabs.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardNav.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardOverview.test.tsx`
- `apps/web/tests/unit/dashboard/ReleaseProviderMatrix.test.tsx`
- `apps/web/tests/unit/dashboard/ReleaseTaskChecklist.test.tsx`
- `apps/web/tests/unit/dashboard/TaskListRow.test.tsx`
- `apps/web/tests/unit/dashboard/TaskWorkspaceHeaderBar.test.tsx`
- `apps/web/tests/unit/dashboard/TasksPageClient.test.tsx`
- `apps/web/tests/unit/dashboard/task-gating-actions.test.ts`
- `apps/web/tests/unit/dashboard/useReleaseProviderMatrix.test.tsx`
- `apps/web/tests/unit/dashboard/useReleaseProviderMatrix.toggle.test.tsx`
- `apps/web/tests/unit/demo/demo-releases-experience.test.tsx`
- `apps/web/tests/unit/home/BentoFeatureGrid.test.tsx`
- `apps/web/tests/unit/home/ReleaseOperatingSystemShowcase.test.tsx`
- `apps/web/tests/unit/lib/entitlement-registry.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/feature-flags-registry.test.ts`
- `apps/web/tests/unit/lib/plan-config.test.ts`
- `apps/web/tests/unit/lib/plan-gate.test.tsx`
- `apps/web/tests/unit/lib/queries/useTaskMutations.test.tsx`
- `apps/web/tests/unit/lib/submission-agent/monitor-worker.test.ts`
- `apps/web/tests/unit/lib/submission-agent/send-worker.test.ts`
- `apps/web/tests/unit/links/useSuggestions.analytics.test.ts`
- `apps/web/tests/unit/release-tasks/catalog-task-builder-dialog.test.tsx`
- `apps/web/tests/unit/release-tasks/classify-task-cluster.test.ts`
- `apps/web/tests/unit/release-tasks/cluster-filter-chips.test.tsx`
- `apps/web/tests/unit/release-tasks/default-template.test.ts`
- `apps/web/tests/unit/release-tasks/normalize-task-text.test.ts`
- `apps/web/tests/unit/release-tasks/release-plan-wizard.test.tsx`
- `apps/web/tests/unit/release-tasks/select-tasks.test.ts`
- `apps/web/tests/unit/release-tasks/task-logic.test.ts`
- `apps/web/tests/unit/routes/shell-nav-coverage.test.ts`

Dev Docs
- `docs/SCHEMA_MAP.md`

User Docs
- `apps/docs/app/docs/features/releases/page.mdx`
- `apps/docs/app/docs/plans-pricing/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Waitlist & Access Requests</strong> — Shipped — public + admin</summary>

Public waitlist capture and internal approval flows for gated programs and plan access requests.

- Tier: P2
- Hardening rank: 31
- Flags: none
- Entitlements: none
- Unit coverage: 70.5% across 5 files
- E2E coverage: 4 specs

Pages
- `/app/admin/waitlist` — `apps/web/app/app/(shell)/admin/waitlist/page.tsx`
- `/waitlist` — `apps/web/app/waitlist/page.tsx`

Non-API Route Handlers
- `/app/admin/waitlist/approve` (admin) — `apps/web/app/app/(shell)/admin/waitlist/approve/route.ts`
- `/app/admin/waitlist/disapprove` (admin) — `apps/web/app/app/(shell)/admin/waitlist/disapprove/route.ts`
- `/app/admin/waitlist/settings` (admin) — `apps/web/app/app/(shell)/admin/waitlist/settings/route.ts`
- `/app/admin/waitlist/update-status` (admin) — `apps/web/app/app/(shell)/admin/waitlist/update-status/route.ts`

API Route Handlers
- `/api/admin/waitlist` (admin) — `apps/web/app/api/admin/waitlist/route.ts`
- `/api/dev/unwaitlist` (auth) — `apps/web/app/api/dev/unwaitlist/route.ts`
- `/api/waitlist` (auth) — `apps/web/app/api/waitlist/route.ts`

Server Actions
- none

Tables
- `waitlistEntries` — `apps/web/lib/db/schema/waitlist.ts`
- `waitlistInvites` — `apps/web/lib/db/schema/waitlist.ts`
- `waitlistSettings` — `apps/web/lib/db/schema/waitlist.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/tests/e2e/chaos-authenticated.spec.ts`
- `apps/web/tests/e2e/golden-path.spec.ts`
- `apps/web/tests/e2e/nightly/auth-flows.spec.ts`
- `apps/web/tests/e2e/onboarding-flow.spec.ts`
- `apps/web/tests/lib/footer.test.ts`
- `apps/web/tests/unit/WaitlistPage.test.tsx`
- `apps/web/tests/unit/adminWaitlistStorage.test.ts`
- `apps/web/tests/unit/api/admin/overview.test.ts`
- `apps/web/tests/unit/api/admin/waitlist-approve.test.ts`
- `apps/web/tests/unit/api/admin/waitlist-disapprove.test.ts`
- `apps/web/tests/unit/api/admin/waitlist-settings.test.ts`
- `apps/web/tests/unit/api/waitlist/waitlist.test.ts`
- `apps/web/tests/unit/app/onboarding-page.test.tsx`
- `apps/web/tests/unit/app/surface-elevation-guardrails.test.ts`
- `apps/web/tests/unit/auth/waitlist-gating.test.ts`
- `apps/web/tests/unit/auth-client-providers.test.tsx`
- `apps/web/tests/unit/components/admin/KpiCards.test.tsx`
- `apps/web/tests/unit/components/admin/WaitlistSettingsPanel.test.tsx`
- `apps/web/tests/unit/components/admin/csv-export.config.test.tsx`
- `apps/web/tests/unit/components/admin/waitlist-bulk-actions.test.ts`
- `apps/web/tests/unit/components/admin/waitlist-column-renderers.test.tsx`
- `apps/web/tests/unit/core-providers-route-variant.test.tsx`
- `apps/web/tests/unit/demo/demo-releases-experience.test.tsx`
- `apps/web/tests/unit/lib/auth/clerk-sync.critical.test.ts`
- `apps/web/tests/unit/lib/auth/gate.critical.test.ts`
- `apps/web/tests/unit/lib/auth/gate.test.ts`
- `apps/web/tests/unit/lib/auth/proxy-state.test.ts`
- `apps/web/tests/unit/lib/proxy-url-mapping.test.ts`
- `apps/web/tests/unit/lib/sentry/init-state.test.ts`
- `apps/web/tests/unit/lib/sentry/route-detector.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.misc.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.routes.test.ts`
- `apps/web/tests/unit/lib/waitlist/approval.test.ts`
- `apps/web/tests/unit/middleware/proxy-behavioral.test.ts`
- `apps/web/tests/unit/middleware/proxy-composition.critical.test.ts`
- `apps/web/tests/unit/waitlist/settings.test.ts`

Dev Docs
- `docs/SCHEMA_MAP.md`

User Docs
- `apps/docs/app/docs/plans-pricing/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Contact Page</strong> — Shipped — free+</summary>

Public contact surface and creator contact record management.

- Tier: P2
- Hardening rank: 32
- Flags: none
- Entitlements: none
- Unit coverage: 89.5% across 1 files
- E2E coverage: 3 specs

Pages
- `/[username]/contact` — `apps/web/app/[username]/contact/page.tsx`
- `/app/contact` — `apps/web/app/app/(shell)/contact/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/feedback` (auth) — `apps/web/app/api/feedback/route.ts`

Server Actions
- none

Tables
- `feedbackItems` — `apps/web/lib/db/schema/feedback.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/lib/chat/tokens.test.ts`
- `apps/web/tests/components/auth/OtpInput.hero.test.tsx`
- `apps/web/tests/components/auth/OtpInput.test.tsx`
- `apps/web/tests/e2e/billing.spec.ts`
- `apps/web/tests/e2e/drawer-profile-editing.spec.ts`
- `apps/web/tests/e2e/profile-visual-audit.spec.ts`
- `apps/web/tests/lib/ingestion/linktree-real-ingestion.test.ts`
- `apps/web/tests/unit/actions/contacts-actions.test.ts`
- `apps/web/tests/unit/api/account/delete-route.test.ts`
- `apps/web/tests/unit/api/admin/creator-invite-bulk.test.ts`
- `apps/web/tests/unit/api/dashboard/contacts.test.ts`
- `apps/web/tests/unit/api/feedback/route.test.ts`
- `apps/web/tests/unit/app/settings-page.test.tsx`
- `apps/web/tests/unit/chat/ChatEntityRightPanelHost.test.tsx`
- `apps/web/tests/unit/chat/SuggestedPrompts.test.tsx`
- `apps/web/tests/unit/chat/tool-events.test.ts`
- `apps/web/tests/unit/chat/useJovieChat.rate-limit.test.tsx`
- `apps/web/tests/unit/components/AuthShellWrapper.test.tsx`
- `apps/web/tests/unit/components/feedback/sidebar-lower-shell-visual-hierarchy.test.tsx`
- `apps/web/tests/unit/components/organisms/AuthShellWrapper.test.tsx`
- `apps/web/tests/unit/dashboard/ProfileContactSidebar.scroll.test.tsx`
- `apps/web/tests/unit/dashboard/SmartActionCards.test.tsx`
- `apps/web/tests/unit/dashboard/releases-page-client.test.tsx`
- `apps/web/tests/unit/dev/DevToolbar.test.tsx`
- `apps/web/tests/unit/feedback/ErrorBanner.test.tsx`
- `apps/web/tests/unit/feedback/StarterEmptyState.test.tsx`
- `apps/web/tests/unit/inbox/inbox-utils.test.ts`
- `apps/web/tests/unit/lib/chat/submit-feedback.test.ts`
- `apps/web/tests/unit/lib/feedback.test.ts`
- `apps/web/tests/unit/lib/fit-scoring/service.test.ts`
- `apps/web/tests/unit/lib/verification/notifications.test.ts`
- `apps/web/tests/unit/profile/otp-input-comprehensive.test.tsx`

Dev Docs
- `docs/PRODUCT_CAPABILITIES.md`

User Docs
- `apps/docs/app/docs/features/profile/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>About Page</strong> — Shipped — free+</summary>

Extended public biography and artist background surface.

- Tier: P2
- Hardening rank: 33
- Flags: none
- Entitlements: none
- Unit coverage: no mapped coverage
- E2E coverage: 2 specs

Pages
- `/[username]/about` — `apps/web/app/[username]/about/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- none

Server Actions
- none

Tables
- none

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/tests/e2e/artist-profiles.spec.ts`
- `apps/web/tests/e2e/profile.spec.ts`

Dev Docs
- `docs/PRODUCT_CAPABILITIES.md`

User Docs
- `apps/docs/app/docs/features/profile/page.mdx`

Open Gaps
- No mapped unit/integration coverage

</details>

<details>
<summary><strong>Verified Badge</strong> — Shipped — pro+</summary>

Plan-gated verification signal shown on public profiles and related profile surfaces.

- Tier: P2
- Hardening rank: 34
- Flags: none
- Entitlements: `canBeVerified`
- Unit coverage: no mapped coverage
- E2E coverage: 3 specs

Pages
- none

Non-API Route Handlers
- none

API Route Handlers
- none

Server Actions
- none

Tables
- none

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/tests/components/admin/CreatorProfileTableRow.test.tsx`
- `apps/web/tests/components/admin/DeleteCreatorDialog.test.tsx`
- `apps/web/tests/components/admin/creator-actions-menu/CreatorActionsMenu.interaction.test.tsx`
- `apps/web/tests/components/dashboard/socials-form/VerificationModal.test.tsx`
- `apps/web/tests/components/dashboard/socials-form/useSocialsForm.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseTrackList.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/TrackSidebar.test.tsx`
- `apps/web/tests/components/profile/ClaimBanner.test.tsx`
- `apps/web/tests/components/user-button.test.tsx`
- `apps/web/tests/contracts/dashboard-apis.nightly.test.ts`
- `apps/web/tests/e2e/anti-cloaking.spec.ts`
- `apps/web/tests/e2e/synthetic-golden-path.spec.ts`
- `apps/web/tests/e2e/tipping.spec.ts`
- `apps/web/tests/lib/billing/verified-upgrade.test.ts`
- `apps/web/tests/lib/dsp.test.ts`
- `apps/web/tests/lib/footer.test.ts`
- `apps/web/tests/lib/ingestion/confidence.test.ts`
- `apps/web/tests/lib/ingestion/linktree-real-ingestion.test.ts`
- `apps/web/tests/lib/leads/process-batch.test.ts`
- `apps/web/tests/lib/leads/qualify.test.ts`
- `apps/web/tests/unit/BrandingBadge.test.tsx`
- `apps/web/tests/unit/EnhancedDashboardLinks.test.tsx`
- `apps/web/tests/unit/VerifiedBadge.test.tsx`
- `apps/web/tests/unit/actions/admin-actions.test.ts`
- `apps/web/tests/unit/api/account/email.test.ts`
- `apps/web/tests/unit/api/clerk/webhook.test.ts`
- `apps/web/tests/unit/api/creator/creator.test.ts`
- `apps/web/tests/unit/api/dashboard/social-links-verify.test.ts`
- `apps/web/tests/unit/api/notifications/verify-email-otp.test.ts`
- `apps/web/tests/unit/api/verification/request.test.ts`
- `apps/web/tests/unit/app/admin/creator-toggle-routes.test.ts`
- `apps/web/tests/unit/app/notifications/page.test.tsx`
- `apps/web/tests/unit/atoms/ArtistName.test.tsx`
- `apps/web/tests/unit/atoms-integration.test.tsx`
- `apps/web/tests/unit/chat/intent-router.test.ts`
- `apps/web/tests/unit/components/admin/AdminProfileSidebar.test.tsx`
- `apps/web/tests/unit/components/admin/csv-export.config.test.tsx`
- `apps/web/tests/unit/components/admin/csv-export.hook.test.tsx`
- `apps/web/tests/unit/components/admin/ingest-profile-input.test.ts`
- `apps/web/tests/unit/components/admin/useBulkActions.test.ts`
- `apps/web/tests/unit/components/feedback/sidebar-lower-shell-visual-hierarchy.test.tsx`
- `apps/web/tests/unit/components/profile/useProfileNotificationsController.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardOverview.test.tsx`
- `apps/web/tests/unit/dashboard/DspPresenceSidebar.test.tsx`
- `apps/web/tests/unit/dashboard/SettingsContactsSection.test.tsx`
- `apps/web/tests/unit/dashboard/SuggestedDspMatches.test.tsx`
- `apps/web/tests/unit/dashboard/drawer-chrome.test.tsx`
- `apps/web/tests/unit/dashboard/releases-page-client.test.tsx`
- `apps/web/tests/unit/dashboard/useMusicLinksForm.test.tsx`
- `apps/web/tests/unit/home/HeroSpotifySearch.test.tsx`
- `apps/web/tests/unit/lib/admin/payload-parsers.test.ts`
- `apps/web/tests/unit/lib/audience/activity-grammar.test.ts`
- `apps/web/tests/unit/lib/auth/cached.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-webhook-handlers.test.ts`
- `apps/web/tests/unit/lib/auth/gate.critical.test.ts`
- `apps/web/tests/unit/lib/auth/gate.test.ts`
- `apps/web/tests/unit/lib/blog/resolveAuthor.test.ts`
- `apps/web/tests/unit/lib/email/claim-invite-followup-template.test.ts`
- `apps/web/tests/unit/lib/email/claim-invite-template.test.ts`
- `apps/web/tests/unit/lib/entitlement-registry.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/fit-scoring/calculator.test.ts`
- `apps/web/tests/unit/lib/fit-scoring/service.test.ts`
- `apps/web/tests/unit/lib/ingestion/soundcloud-pro-badge.test.ts`
- `apps/web/tests/unit/lib/plan-config.test.ts`
- `apps/web/tests/unit/lib/plan-gate-edge-cases.test.tsx`
- `apps/web/tests/unit/lib/testing/test-user-provision.server.test.ts`
- `apps/web/tests/unit/links/SortableLinkItem.test.tsx`
- `apps/web/tests/unit/profile/ProfileInlineNotificationsCTA.test.tsx`
- `apps/web/tests/unit/profile/ProfileModeDrawer.test.tsx`
- `apps/web/tests/unit/profile/ProfilePrimaryActionCard.test.tsx`
- `apps/web/tests/unit/profile/ProfilePrimaryCTA.loading.test.tsx`
- `apps/web/tests/unit/profile/ProfilePrimaryCTA.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.accessibility.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.dsp-preferences.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.mode-override.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.notifications.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.tour.test.tsx`
- `apps/web/tests/unit/profile/ProfileUnifiedDrawerReleases.test.tsx`
- `apps/web/tests/unit/profile/ProgressiveArtistPage.test.tsx`
- `apps/web/tests/unit/profile/TourModePanel.test.tsx`
- `apps/web/tests/unit/profile/inline-notifications-cta.test.tsx`
- `apps/web/tests/unit/profile/notifications-otp-step.test.tsx`
- `apps/web/tests/unit/profile/profile-compact-template.test.tsx`
- `apps/web/tests/unit/profile/profile-layout-shift.test.tsx`
- `apps/web/tests/unit/profile/profile-links.test.tsx`
- `apps/web/tests/unit/profile/profile-service-queries.test.ts`
- `apps/web/tests/unit/profile/public-profile-page.test.ts`
- `apps/web/tests/unit/profile/static-artist-page.test.tsx`
- `apps/web/tests/unit/profile/subscription-form-states.test.tsx`
- `apps/web/tests/unit/profile/subscription-sms-flow.test.tsx`
- `apps/web/tests/unit/profile/type-conversions.test.ts`
- `apps/web/tests/unit/profile/useSubscriptionForm.test.tsx`
- `apps/web/tests/unit/profile/view-models.test.ts`
- `apps/web/tests/unit/release/pre-save-actions.test.tsx`
- `apps/web/tests/unit/release/release-landing-page.test.tsx`

Dev Docs
- `docs/PRODUCT_CAPABILITIES.md`

User Docs
- `apps/docs/app/docs/features/profile/page.mdx`
- `apps/docs/app/docs/features/profile/verified-badge/page.mdx`

Open Gaps
- No mapped unit/integration coverage
- Gate exists without an obvious surfaced page, route, or action

</details>

<details>
<summary><strong>Remove Jovie Branding</strong> — Shipped — max</summary>

White-label branding controls for public profile surfaces and related billing upsell entry points.

- Tier: P2
- Hardening rank: 35
- Flags: none
- Entitlements: `canAccessWhiteLabel`
- Unit coverage: no mapped coverage
- E2E coverage: 7 specs

Pages
- `/app/settings/branding` — `apps/web/app/app/(shell)/settings/branding/page.tsx`
- `/app/settings/remove-branding` — `apps/web/app/app/(shell)/settings/remove-branding/page.tsx`
- `/billing/remove-branding` — `apps/web/app/billing/remove-branding/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- none

Server Actions
- none

Tables
- none

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/app/billing/success/page.test.tsx`
- `apps/web/lib/__tests__/changelog-parser.test.ts`
- `apps/web/scripts/performance-route-manifest.test.ts`
- `apps/web/tests/components/BillingDashboard.test.tsx`
- `apps/web/tests/components/billing.test.tsx`
- `apps/web/tests/components/user-button.test.tsx`
- `apps/web/tests/e2e/billing.spec.ts`
- `apps/web/tests/e2e/chaos-authenticated.spec.ts`
- `apps/web/tests/e2e/chat-pitch-generation.spec.ts`
- `apps/web/tests/e2e/content-gate.spec.ts`
- `apps/web/tests/e2e/golden-path.spec.ts`
- `apps/web/tests/e2e/payment-complete-flow.spec.ts`
- `apps/web/tests/e2e/pro-feature-gates.spec.ts`
- `apps/web/tests/lib/admin/sentry-metrics.test.ts`
- `apps/web/tests/lib/billing/verified-upgrade.test.ts`
- `apps/web/tests/lib/integrations.test.ts`
- `apps/web/tests/lib/queries/cache-strategies.test.ts`
- `apps/web/tests/lib/queries/keys.test.ts`
- `apps/web/tests/lib/queries/query-refetch-policy.test.ts`
- `apps/web/tests/lib/queries/useBillingMutations.test.tsx`
- `apps/web/tests/lib/queries/useBillingStatusQuery.test.tsx`
- `apps/web/tests/lib/stripe/billing-hardening.test.ts`
- `apps/web/tests/scripts/overnight-qa-ledger.test.ts`
- `apps/web/tests/scripts/overnight-qa-manifest.test.ts`
- `apps/web/tests/scripts/overnight-qa-risk.test.ts`
- `apps/web/tests/unit/BrandingBadge.test.tsx`
- `apps/web/tests/unit/CheckoutSuccessPage.test.tsx`
- `apps/web/tests/unit/actions/contacts-actions.test.ts`
- `apps/web/tests/unit/api/admin/waitlist-settings.test.ts`
- `apps/web/tests/unit/api/billing/health.test.ts`
- `apps/web/tests/unit/api/billing/history.test.ts`
- `apps/web/tests/unit/api/billing/status.test.ts`
- `apps/web/tests/unit/api/chat/usage.test.ts`
- `apps/web/tests/unit/api/cron/billing-reconciliation.test.ts`
- `apps/web/tests/unit/api/cron/daily-maintenance.test.ts`
- `apps/web/tests/unit/api/cron/data-retention.test.ts`
- `apps/web/tests/unit/api/cron/send-release-notifications.test.ts`
- `apps/web/tests/unit/api/stripe/cancel.test.ts`
- `apps/web/tests/unit/api/stripe/checkout.test.ts`
- `apps/web/tests/unit/api/stripe/portal.test.ts`
- `apps/web/tests/unit/app/admin/creator-toggle-routes.test.ts`
- `apps/web/tests/unit/app/billing-success-page.test.tsx`
- `apps/web/tests/unit/auth/waitlist-gating.test.ts`
- `apps/web/tests/unit/billing-providers.test.tsx`
- `apps/web/tests/unit/components/feedback/sidebar-lower-shell-visual-hierarchy.test.tsx`
- `apps/web/tests/unit/core-providers-route-variant.test.tsx`
- `apps/web/tests/unit/dashboard/SettingsActionRow.test.tsx`
- `apps/web/tests/unit/dashboard/SettingsPolished.test.tsx`
- `apps/web/tests/unit/dev/DevToolbar.test.tsx`
- `apps/web/tests/unit/lib/auth/build-app-shell-signin-url.test.ts`
- `apps/web/tests/unit/lib/billing/batch-processor.test.ts`
- `apps/web/tests/unit/lib/billing/orphaned-subscription-handler.test.ts`
- `apps/web/tests/unit/lib/billing/status-mismatch-fixer.test.ts`
- `apps/web/tests/unit/lib/billing/subscription-error-classifier.test.ts`
- `apps/web/tests/unit/lib/billing/subscription-status-resolver.test.ts`
- `apps/web/tests/unit/lib/cache/tags.test.ts`
- `apps/web/tests/unit/lib/contact-limit-entitlements.test.ts`
- `apps/web/tests/unit/lib/entitlement-registry.test.ts`
- `apps/web/tests/unit/lib/entitlements-billing-negative.test.ts`
- `apps/web/tests/unit/lib/entitlements-concurrency-isolation.test.ts`
- `apps/web/tests/unit/lib/entitlements-state-transitions.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/onboarding-return-to.test.ts`
- `apps/web/tests/unit/lib/plan-config.test.ts`
- `apps/web/tests/unit/lib/plan-gate-edge-cases.test.tsx`
- `apps/web/tests/unit/lib/plan-gate.test.tsx`
- `apps/web/tests/unit/lib/proxy-url-mapping.test.ts`
- `apps/web/tests/unit/lib/queries/useAccountMutations.test.tsx`
- `apps/web/tests/unit/lib/queries/useBillingMutations.test.tsx`
- `apps/web/tests/unit/lib/queries/useSettingsMutation.test.tsx`
- `apps/web/tests/unit/lib/sentry/init-state.test.ts`
- `apps/web/tests/unit/lib/sentry/route-detector.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.misc.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.routes.test.ts`
- `apps/web/tests/unit/lib/stripe/checkout-helpers.test.ts`
- `apps/web/tests/unit/lib/stripe/customer-sync.auth.test.ts`
- `apps/web/tests/unit/lib/stripe/customer-sync.billing-info.test.ts`
- `apps/web/tests/unit/lib/stripe/customer-sync.errors.test.ts`
- `apps/web/tests/unit/lib/stripe/customer-sync.fallback.test.ts`
- `apps/web/tests/unit/lib/stripe/customer-sync.misc.test.ts`
- `apps/web/tests/unit/lib/stripe/customer-sync.queries.test.ts`
- `apps/web/tests/unit/lib/stripe/dunning.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/checkout-handler.critical.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/payment-handler.critical.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/payment-handler.failure.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/payment-handler.misc.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/payment-handler.success.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/subscription-handler.created.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/subscription-handler.deleted.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/subscription-handler.errors.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/subscription-handler.misc.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/subscription-handler.updated.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/utils.test.ts`
- `apps/web/tests/unit/links/useLinksPersistence.test.ts`
- `apps/web/tests/unit/onboarding/onboarding-checkout.test.tsx`
- `apps/web/tests/unit/settings/SettingsBillingSection.test.tsx`
- `apps/web/tests/unit/tracking/instantly-pixel.test.tsx`

Dev Docs
- `docs/artist-profile-features.md`

User Docs
- `apps/docs/app/docs/features/profile/page.mdx`
- `apps/docs/app/docs/plans-pricing/page.mdx`

Open Gaps
- No mapped unit/integration coverage

</details>

<details>
<summary><strong>Use This Sound Pages</strong> — Shipped — free+</summary>

Release-level short-form video landing pages for TikTok, Reels, and Shorts.

- Tier: P2
- Hardening rank: 36
- Flags: none
- Entitlements: none
- Unit coverage: no mapped coverage
- E2E coverage: 2 specs

Pages
- `/[username]/[slug]/sounds` — `apps/web/app/[username]/[slug]/sounds/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- none

Server Actions
- none

Tables
- none

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/tests/e2e/smartlink-experience.spec.ts`
- `apps/web/tests/e2e/tim-white-profile-showcase.spec.ts`

Dev Docs
- `docs/PRODUCT_CAPABILITIES.md`

User Docs
- `apps/docs/app/docs/features/releases/page.mdx`
- `apps/docs/app/docs/features/profile/page.mdx`

Open Gaps
- No mapped unit/integration coverage

</details>

<details>
<summary><strong>Shop Links & Storefront Redirects</strong> — Shipped — free+</summary>

Creator-managed Shopify links that power the public shop button and outbound storefront redirects.

- Tier: P2
- Hardening rank: 37
- Flags: none
- Entitlements: none
- Unit coverage: 59.5% across 3 files
- E2E coverage: 1 specs

Pages
- `/[username]/shop` — `apps/web/app/[username]/shop/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/dashboard/shop` (auth) — `apps/web/app/api/dashboard/shop/route.ts`

Server Actions
- none

Tables
- none

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/tests/e2e/profile.spec.ts`
- `apps/web/tests/unit/api/dashboard/shop.test.ts`
- `apps/web/tests/unit/lib/profile/shop-settings.test.ts`
- `apps/web/tests/unit/lib/profile-next-action.test.ts`
- `apps/web/tests/unit/profile/ProfilePrimaryCTA.loading.test.tsx`
- `apps/web/tests/unit/profile/ProfilePrimaryCTA.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.accessibility.test.tsx`
- `apps/web/tests/unit/profile/profile-next-action.test.ts`

Dev Docs
- `docs/PRODUCT_CAPABILITIES.md`

User Docs
- N/A

Open Gaps
- none

</details>

<details>
<summary><strong>Spotify OAuth & Platform Connections</strong> — In rollout — flagged</summary>

Spotify OAuth sign-in rollout and admin platform connection tooling.

- Tier: P2
- Hardening rank: 37
- Flags: `SPOTIFY_OAUTH`
- Entitlements: none
- Unit coverage: 55.4% across 3 files
- E2E coverage: 4 specs

Pages
- `/app/admin/platform-connections` — `apps/web/app/app/(shell)/admin/platform-connections/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/dev/sync-clerk` (auth) — `apps/web/app/api/dev/sync-clerk/route.ts`

Server Actions
- `apps/web/app/app/(shell)/admin/platform-connections/actions.ts`

Tables
- none

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/app/api/spotify/search/__tests__/helpers.test.ts`
- `apps/web/tests/e2e/auth.spec.ts`
- `apps/web/tests/e2e/billing.spec.ts`
- `apps/web/tests/e2e/smoke-auth.spec.ts`
- `apps/web/tests/e2e/smoke-prod-auth.spec.ts`
- `apps/web/tests/unit/api/cron/generate-playlist.test.ts`
- `apps/web/tests/unit/api/spotify/search.test.ts`
- `apps/web/tests/unit/app/admin-platform-connections-client.test.tsx`
- `apps/web/tests/unit/lib/admin/platform-connections.test.ts`
- `apps/web/tests/unit/lib/spotify/jovie-account.test.ts`

Dev Docs
- `docs/STATSIG_FEATURE_GATES.md`

User Docs
- `apps/docs/app/docs/self-serve-guide/connect-dsps/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Playlists & Share Studio</strong> — Shipped (flagged) — mixed</summary>

Public playlist pages, admin playlist tooling, and share-studio content packaging.

- Tier: P2
- Hardening rank: 38
- Flags: `PLAYLIST_ENGINE`
- Entitlements: none
- Unit coverage: 100% across 1 files
- E2E coverage: 6 specs

Pages
- `/playlists/[slug]` — `apps/web/app/(dynamic)/playlists/[slug]/page.tsx`
- `/playlists/genre/[genre]` — `apps/web/app/(dynamic)/playlists/genre/[genre]/page.tsx`
- `/playlists/mood/[mood]` — `apps/web/app/(dynamic)/playlists/mood/[mood]/page.tsx`
- `/playlists` — `apps/web/app/(dynamic)/playlists/page.tsx`
- `/app/admin/playlists` — `apps/web/app/app/(shell)/admin/playlists/page.tsx`
- `/app/admin/share-studio` — `apps/web/app/app/(shell)/admin/share-studio/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/cron/generate-playlist` (cron) — `apps/web/app/api/cron/generate-playlist/route.ts`
- `/api/share/story/blog` (public) — `apps/web/app/api/share/story/blog/route.tsx`
- `/api/share/story/playlist` (public) — `apps/web/app/api/share/story/playlist/route.tsx`
- `/api/share/story/profile` (public) — `apps/web/app/api/share/story/profile/route.tsx`
- `/api/share/story/release` (public) — `apps/web/app/api/share/story/release/route.tsx`

Server Actions
- `apps/web/app/actions/spotify-playlist.ts`

Tables
- `joviePlaylists` — `apps/web/lib/db/schema/playlists.ts`
- `joviePlaylistTracks` — `apps/web/lib/db/schema/playlists.ts`

Jobs
- `/api/cron/generate-playlist` — callable only

Webhooks
- none

Mapped Tests
- `apps/web/components/homepage/HomepageIntent.test.tsx`
- `apps/web/components/homepage/intent.test.ts`
- `apps/web/lib/__tests__/changelog-parser.test.ts`
- `apps/web/lib/share/context.test.ts`
- `apps/web/tests/app/sitemap.test.ts`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseSidebar-links.interaction.test.tsx`
- `apps/web/tests/e2e/chat-pitch-generation.spec.ts`
- `apps/web/tests/e2e/dropdown-parity.spec.ts`
- `apps/web/tests/e2e/homepage-intent.spec.ts`
- `apps/web/tests/e2e/homepage.spec.ts`
- `apps/web/tests/e2e/tim-white-profile-showcase.spec.ts`
- `apps/web/tests/e2e/yc-demo.spec.ts`
- `apps/web/tests/lib/ingestion/youtube.test.ts`
- `apps/web/tests/unit/api/cron/generate-playlist.test.ts`
- `apps/web/tests/unit/app/admin-platform-connections-client.test.tsx`
- `apps/web/tests/unit/app/admin-playlists-surface-guard.test.ts`
- `apps/web/tests/unit/app/internal-shell-surface-guard.test.ts`
- `apps/web/tests/unit/app/onboarding/actions/connect-spotify.test.ts`
- `apps/web/tests/unit/chat/intent-router.test.ts`
- `apps/web/tests/unit/chat/knowledge-retrieval.test.ts`
- `apps/web/tests/unit/chat/useSuggestedProfiles.test.ts`
- `apps/web/tests/unit/components/admin/AdminProfileSidebar.test.tsx`
- `apps/web/tests/unit/dashboard/ReleaseProviderMatrix.test.tsx`
- `apps/web/tests/unit/dashboard/ReleaseTaskChecklist.test.tsx`
- `apps/web/tests/unit/dashboard/useReleaseProviderMatrix.test.tsx`
- `apps/web/tests/unit/dashboard/useReleaseProviderMatrix.toggle.test.tsx`
- `apps/web/tests/unit/demo/demo-releases-experience.test.tsx`
- `apps/web/tests/unit/lib/admin/platform-connections.test.ts`
- `apps/web/tests/unit/lib/playlists/curate-tracklist.test.ts`
- `apps/web/tests/unit/lib/playlists/extract-json-payload.test.ts`
- `apps/web/tests/unit/lib/spotify/jovie-account.test.ts`
- `apps/web/tests/unit/product-screenshots/screenshot-registry.test.ts`
- `apps/web/tests/unit/profile/ProfilePrimaryActionCard.test.tsx`
- `apps/web/tests/unit/profile/featured-playlist-fallback-discovery.test.ts`
- `apps/web/tests/unit/profile/featured-playlist-fallback-web.test.ts`
- `apps/web/tests/unit/profile/featured-playlist-fallback.test.ts`
- `apps/web/tests/unit/profile/profile-compact-template.test.tsx`
- `apps/web/tests/unit/profile/public-profile-page.test.ts`
- `apps/web/tests/unit/profile/static-artist-page.test.tsx`
- `apps/web/tests/unit/profile/view-models.test.ts`
- `apps/web/tests/unit/routes/shell-nav-coverage.test.ts`
- `apps/web/tests/unit/services/pitch/prompts.test.ts`

Dev Docs
- `docs/CRON_REGISTRY.md`

User Docs
- `apps/docs/app/docs/features/releases/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Admin Creator Ops & Ingestion</strong> — Shipped — admin</summary>

Admin creator management, ingestion queues, profile invites, and release moderation tools.

- Tier: P2
- Hardening rank: 39
- Flags: none
- Entitlements: none
- Unit coverage: 74.7% across 13 files
- E2E coverage: 4 specs

Pages
- `/app/admin/creators` — `apps/web/app/app/(shell)/admin/creators/page.tsx`
- `/app/admin/ingest` — `apps/web/app/app/(shell)/admin/ingest/page.tsx`
- `/app/admin/releases` — `apps/web/app/app/(shell)/admin/releases/page.tsx`

Non-API Route Handlers
- `/app/admin/creators/bulk-feature` (admin) — `apps/web/app/app/(shell)/admin/creators/bulk-feature/route.ts`
- `/app/admin/creators/bulk-refresh` (admin) — `apps/web/app/app/(shell)/admin/creators/bulk-refresh/route.ts`
- `/app/admin/creators/bulk-verify` (admin) — `apps/web/app/app/(shell)/admin/creators/bulk-verify/route.ts`
- `/app/admin/creators/delete` (admin) — `apps/web/app/app/(shell)/admin/creators/delete/route.ts`
- `/app/admin/creators/toggle-featured` (admin) — `apps/web/app/app/(shell)/admin/creators/toggle-featured/route.ts`
- `/app/admin/creators/toggle-marketing` (admin) — `apps/web/app/app/(shell)/admin/creators/toggle-marketing/route.ts`
- `/app/admin/creators/toggle-verify` (admin) — `apps/web/app/app/(shell)/admin/creators/toggle-verify/route.ts`
- `/app/admin/users/ban` (admin) — `apps/web/app/app/(shell)/admin/users/ban/route.ts`
- `/app/admin/users/delete` (admin) — `apps/web/app/app/(shell)/admin/users/delete/route.ts`
- `/app/admin/users/toggle-featured` (admin) — `apps/web/app/app/(shell)/admin/users/toggle-featured/route.ts`
- `/app/admin/users/toggle-marketing` (admin) — `apps/web/app/app/(shell)/admin/users/toggle-marketing/route.ts`
- `/app/admin/users/toggle-verify` (admin) — `apps/web/app/app/(shell)/admin/users/toggle-verify/route.ts`
- `/app/admin/users/unban` (admin) — `apps/web/app/app/(shell)/admin/users/unban/route.ts`

API Route Handlers
- `/api/admin/batch-ingest` (admin) — `apps/web/app/api/admin/batch-ingest/route.ts`
- `/api/admin/creator-avatar` (admin) — `apps/web/app/api/admin/creator-avatar/route.ts`
- `/api/admin/creator-ingest/rerun` (admin) — `apps/web/app/api/admin/creator-ingest/rerun/route.ts`
- `/api/admin/creator-ingest` (admin) — `apps/web/app/api/admin/creator-ingest/route.ts`
- `/api/admin/creator-invite/bulk` (admin) — `apps/web/app/api/admin/creator-invite/bulk/route.ts`
- `/api/admin/creator-invite/bulk/stats` (admin) — `apps/web/app/api/admin/creator-invite/bulk/stats/route.ts`
- `/api/admin/creator-invite` (admin) — `apps/web/app/api/admin/creator-invite/route.ts`
- `/api/admin/creator-social-links` (admin) — `apps/web/app/api/admin/creator-social-links/route.ts`
- `/api/admin/creators` (admin) — `apps/web/app/api/admin/creators/route.ts`
- `/api/admin/ingestion-health` (admin) — `apps/web/app/api/admin/ingestion-health/route.ts`
- `/api/admin/re-enrich` (admin) — `apps/web/app/api/admin/re-enrich/route.ts`
- `/api/admin/releases` (admin) — `apps/web/app/api/admin/releases/route.ts`
- `/api/ingestion/jobs` (cron) — `apps/web/app/api/ingestion/jobs/route.ts`

Server Actions
- `apps/web/app/app/(shell)/admin/actions.ts`

Tables
- `ingestAuditLogs` — `apps/web/lib/db/schema/audit.ts`
- `ingestionJobs` — `apps/web/lib/db/schema/ingestion.ts`
- `scraperConfigs` — `apps/web/lib/db/schema/ingestion.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/tests/components/admin/CreatorProfileTableRow.test.tsx`
- `apps/web/tests/components/admin/DeleteCreatorDialog.test.tsx`
- `apps/web/tests/e2e/admin-dashboard.spec.ts`
- `apps/web/tests/e2e/admin-navigation.spec.ts`
- `apps/web/tests/e2e/admin-visual-regression.spec.ts`
- `apps/web/tests/e2e/musicfetch-coverage.spec.ts`
- `apps/web/tests/integration/admin-ingestion.test.ts`
- `apps/web/tests/lib/ingestion/followup.test.ts`
- `apps/web/tests/lib/ingestion/linktree-real-ingestion.test.ts`
- `apps/web/tests/unit/api/admin/creator-avatar.test.ts`
- `apps/web/tests/unit/api/admin/creator-ingest.test.ts`
- `apps/web/tests/unit/api/admin/creator-invite-bulk.test.ts`
- `apps/web/tests/unit/api/admin/creator-social-links.test.ts`
- `apps/web/tests/unit/api/cron/data-retention.test.ts`
- `apps/web/tests/unit/api/ingestion/jobs.test.ts`
- `apps/web/tests/unit/app/admin/creator-toggle-routes.test.ts`
- `apps/web/tests/unit/lib/email/campaigns/processor.test.ts`
- `apps/web/tests/unit/url-sanitization.test.ts`

Dev Docs
- `docs/ADMIN_INGEST_AND_CLAIM_SYSTEM.md`

User Docs
- N/A

Open Gaps
- none

</details>

<details>
<summary><strong>Referrals & Affiliate Program</strong> — In rollout — free+ / internal</summary>

Referral code issuance, paid conversion attribution, and commission tracking for creator growth loops.

- Tier: P2
- Hardening rank: 39
- Flags: none
- Entitlements: none
- Unit coverage: 89.7% across 2 files
- E2E coverage: no mapped specs

Pages
- none

Non-API Route Handlers
- none

API Route Handlers
- `/api/referrals/apply` (auth) — `apps/web/app/api/referrals/apply/route.ts`
- `/api/referrals/code` (auth) — `apps/web/app/api/referrals/code/route.ts`
- `/api/referrals/stats` (auth) — `apps/web/app/api/referrals/stats/route.ts`

Server Actions
- none

Tables
- `referralCodes` — `apps/web/lib/db/schema/referrals.ts`
- `referralCommissions` — `apps/web/lib/db/schema/referrals.ts`
- `referrals` — `apps/web/lib/db/schema/referrals.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/tests/unit/lib/referrals/service.critical.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/checkout-handler.critical.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/payment-handler.critical.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/payment-handler.failure.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/payment-handler.misc.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/payment-handler.success.test.ts`
- `apps/web/tests/unit/settings/referral-page.test.ts`

Dev Docs
- `docs/SCHEMA_MAP.md`

User Docs
- N/A

Open Gaps
- none

</details>

<details>
<summary><strong>Creator Inbox & Email Campaigns</strong> — In rollout — max / internal</summary>

Inbound email threading, campaign enrollment data, suppression, and delivery tracking plumbing.

- Tier: P2
- Hardening rank: 40
- Flags: none
- Entitlements: `canAccessInbox`, `canAccessFanSubscriptions`, `canAccessEmailCampaigns`
- Unit coverage: 63.4% across 22 files
- E2E coverage: 11 specs

Pages
- none

Non-API Route Handlers
- none

API Route Handlers
- `/api/cron/process-campaigns` (cron) — `apps/web/app/api/cron/process-campaigns/route.ts`
- `/api/email/track/click` (public) — `apps/web/app/api/email/track/click/route.ts`
- `/api/email/track/open` (public) — `apps/web/app/api/email/track/open/route.ts`
- `/api/webhooks/resend-inbound` (webhook) — `apps/web/app/api/webhooks/resend-inbound/route.ts`

Server Actions
- none

Tables
- `campaignEnrollments` — `apps/web/lib/db/schema/email-engagement.ts`
- `campaignSequences` — `apps/web/lib/db/schema/email-engagement.ts`
- `creatorEmailQuotas` — `apps/web/lib/db/schema/sender.ts`
- `creatorSendingReputation` — `apps/web/lib/db/schema/sender.ts`
- `emailEngagement` — `apps/web/lib/db/schema/email-engagement.ts`
- `emailSendAttribution` — `apps/web/lib/db/schema/sender.ts`
- `emailSuppressions` — `apps/web/lib/db/schema/suppression.ts`
- `emailThreads` — `apps/web/lib/db/schema/inbox.ts`
- `inboundEmails` — `apps/web/lib/db/schema/inbox.ts`
- `outboundReplies` — `apps/web/lib/db/schema/inbox.ts`

Jobs
- `/api/cron/process-campaigns` — callable only

Webhooks
- `/api/webhooks/resend-inbound` — resend-inbound

Mapped Tests
- `apps/web/app/api/dashboard/audience/source-links/route.test.ts`
- `apps/web/app/api/dashboard/audience/source-route-helpers.test.ts`
- `apps/web/components/features/profile/artist-notifications-cta/hero-invariants.test.ts`
- `apps/web/lib/admin/reliability.test.ts`
- `apps/web/lib/email/extraction.test.ts`
- `apps/web/tests/e2e/admin-visual-regression.spec.ts`
- `apps/web/tests/e2e/artist-notifications.spec.ts`
- `apps/web/tests/e2e/chaos-authenticated.spec.ts`
- `apps/web/tests/e2e/content-gate.spec.ts`
- `apps/web/tests/e2e/homepage.spec.ts`
- `apps/web/tests/e2e/profile-cls-audit.spec.ts`
- `apps/web/tests/e2e/profile-drawers.spec.ts`
- `apps/web/tests/e2e/profile-subscribe-e2e.spec.ts`
- `apps/web/tests/e2e/profile-visual-audit.spec.ts`
- `apps/web/tests/e2e/profile.spec.ts`
- `apps/web/tests/e2e/yc-demo.spec.ts`
- `apps/web/tests/lib/leads/instantly-timeout.test.ts`
- `apps/web/tests/lib/notifications/preferences.test.ts`
- `apps/web/tests/lib/notifications/providers/resend.test.ts`
- `apps/web/tests/lib/notifications/sender-policy.test.ts`
- `apps/web/tests/lib/notifications/service.test.ts`
- `apps/web/tests/lib/notifications/suppression.test.ts`
- `apps/web/tests/lib/notifications/validation.test.ts`
- `apps/web/tests/lib/queries/cache-strategies.test.ts`
- `apps/web/tests/lib/queries/campaign-query-keys.test.ts`
- `apps/web/tests/lib/queries/keys.test.ts`
- `apps/web/tests/lib/queries/query-refetch-policy.test.ts`
- `apps/web/tests/lib/queries/useNotificationStatusQuery.test.ts`
- `apps/web/tests/unit/CheckoutSuccessPage.test.tsx`
- `apps/web/tests/unit/api/account/delete-route.test.ts`
- `apps/web/tests/unit/api/admin/creator-invite-bulk.test.ts`
- `apps/web/tests/unit/api/admin/outreach-route.test.ts`
- `apps/web/tests/unit/api/admin/waitlist-approve.test.ts`
- `apps/web/tests/unit/api/billing/health.test.ts`
- `apps/web/tests/unit/api/changelog/subscribe.test.ts`
- `apps/web/tests/unit/api/cron/data-retention.test.ts`
- `apps/web/tests/unit/api/cron/frequent.test.ts`
- `apps/web/tests/unit/api/cron/process-campaigns.test.ts`
- `apps/web/tests/unit/api/cron/schedule-release-notifications.test.ts`
- `apps/web/tests/unit/api/cron/send-release-notifications.test.ts`
- `apps/web/tests/unit/api/feedback/route.test.ts`
- `apps/web/tests/unit/api/notifications/status.test.ts`
- `apps/web/tests/unit/api/notifications/subscribe.test.ts`
- `apps/web/tests/unit/api/notifications/unsubscribe.test.ts`
- `apps/web/tests/unit/api/notifications/verify-email-otp.test.ts`
- `apps/web/tests/unit/api/unsubscribe/claim-invites.test.ts`
- `apps/web/tests/unit/api/verification/request.test.ts`
- `apps/web/tests/unit/api/waitlist/waitlist.test.ts`
- `apps/web/tests/unit/api/webhooks/resend-inbound.test.ts`
- `apps/web/tests/unit/api/webhooks/resend-route.test.ts`
- `apps/web/tests/unit/app/artist-notifications-page.test.tsx`
- `apps/web/tests/unit/app/notifications/page.test.tsx`
- `apps/web/tests/unit/atoms-integration.test.tsx`
- `apps/web/tests/unit/chat/ChatPageClient.test.tsx`
- `apps/web/tests/unit/chat/intent-classification.test.ts`
- `apps/web/tests/unit/chat/intent-router.test.ts`
- `apps/web/tests/unit/components/admin/CampaignSettingsPanel.test.tsx`
- `apps/web/tests/unit/components/admin/csv-export.button.test.tsx`
- `apps/web/tests/unit/components/admin/csv-export.hook.test.tsx`
- `apps/web/tests/unit/components/profile/useProfileNotificationsController.test.tsx`
- `apps/web/tests/unit/dashboard/DashboardAudienceTable.test.tsx`
- `apps/web/tests/unit/dashboard/RecentChats.test.tsx`
- `apps/web/tests/unit/dashboard/SmartActionCards.test.tsx`
- `apps/web/tests/unit/dashboard/SocialBioNudge.test.tsx`
- `apps/web/tests/unit/dashboard/dashboard-clerk-safe.test.tsx`
- `apps/web/tests/unit/extensions/summary.test.ts`
- `apps/web/tests/unit/home/HomeAdaptiveProfileStory.test.tsx`
- `apps/web/tests/unit/home/MobileProfilePreview.test.tsx`
- `apps/web/tests/unit/home/marketing-content-guardrails.test.ts`
- `apps/web/tests/unit/hooks/useNotifications.test.ts`
- `apps/web/tests/unit/inbox/inbox-utils.test.ts`
- `apps/web/tests/unit/inbox/webhook-handler.test.ts`
- `apps/web/tests/unit/lib/audience/source-link-code.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-webhook-handlers.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-webhook-registry.test.ts`
- `apps/web/tests/unit/lib/chat/submit-feedback.test.ts`
- `apps/web/tests/unit/lib/db-session-guard.test.ts`
- `apps/web/tests/unit/lib/distribution/instagram-activation.test.ts`
- `apps/web/tests/unit/lib/email/campaigns/processor.test.ts`
- `apps/web/tests/unit/lib/email/claim-invite-followup-template.test.ts`
- `apps/web/tests/unit/lib/email/claim-invite-template.test.ts`
- `apps/web/tests/unit/lib/email/jobs/enqueue.test.ts`
- `apps/web/tests/unit/lib/email/opt-in-token.test.ts`
- `apps/web/tests/unit/lib/email/release-day-notification-name.test.ts`
- `apps/web/tests/unit/lib/entitlement-registry.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/intent-detection/intent-classification.test.ts`
- `apps/web/tests/unit/lib/leads/funnel-events.signup.test.ts`
- `apps/web/tests/unit/lib/leads/outreach-batch.test.ts`
- `apps/web/tests/unit/lib/notifications/domain.test.ts`
- `apps/web/tests/unit/lib/plan-config.test.ts`
- `apps/web/tests/unit/lib/plan-gate-edge-cases.test.tsx`
- `apps/web/tests/unit/lib/profile/shop-settings.test.ts`
- `apps/web/tests/unit/lib/queries/useSettingsMutation.test.tsx`
- `apps/web/tests/unit/lib/sentry/sentry-config.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-init.config.test.ts`
- `apps/web/tests/unit/lib/services/insights/data-aggregator.test.ts`
- `apps/web/tests/unit/lib/stripe/dunning.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/google.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/types.test.ts`
- `apps/web/tests/unit/lib/utm/build-url.test.ts`
- `apps/web/tests/unit/lib/verification/notifications.test.ts`
- `apps/web/tests/unit/product-screenshots/screenshot-cleanliness.test.ts`
- `apps/web/tests/unit/profile/ProfileInlineNotificationsCTA.test.tsx`
- `apps/web/tests/unit/profile/ProfileMenuDrawer.test.tsx`
- `apps/web/tests/unit/profile/ProfileModeDrawer.test.tsx`
- `apps/web/tests/unit/profile/ProfileNotificationsButton.test.tsx`
- `apps/web/tests/unit/profile/ProfileNotificationsContext.test.tsx`
- `apps/web/tests/unit/profile/ProfilePrimaryCTA.loading.test.tsx`
- `apps/web/tests/unit/profile/ProfilePrimaryCTA.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.accessibility.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.dsp-preferences.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.mode-override.test.tsx`
- `apps/web/tests/unit/profile/ProfileShell.notifications.test.tsx`
- `apps/web/tests/unit/profile/ProfileUnifiedDrawerReleases.test.tsx`
- `apps/web/tests/unit/profile/PublicProfileTemplateV2.history.test.tsx`
- `apps/web/tests/unit/profile/TourModePanel.test.tsx`
- `apps/web/tests/unit/profile/contacts-mapper.test.ts`
- `apps/web/tests/unit/profile/inline-notifications-cta.test.tsx`
- `apps/web/tests/unit/profile/notifications-otp-step.test.tsx`
- `apps/web/tests/unit/profile/profile-compact-template.test.tsx`
- `apps/web/tests/unit/profile/profile-edge-cases.test.tsx`
- `apps/web/tests/unit/profile/profile-layout-shift.test.tsx`
- `apps/web/tests/unit/profile/public-profile-page.test.ts`
- `apps/web/tests/unit/profile/subscription-form-states.test.tsx`
- `apps/web/tests/unit/profile/subscription-sms-flow.test.tsx`
- `apps/web/tests/unit/profile/subscription-success-name-capture.test.tsx`
- `apps/web/tests/unit/profile/useSubscriptionForm.test.tsx`
- `apps/web/tests/unit/profile/view-registry.test.ts`
- `apps/web/tests/unit/release/mystery-release-page.test.tsx`
- `apps/web/tests/unit/release/pre-save-actions.test.tsx`
- `apps/web/tests/unit/release/release-artist-link.test.tsx`
- `apps/web/tests/unit/release/scheduled-release-page.test.tsx`
- `packages/ui/atoms/common-dropdown.test.tsx`
- `packages/ui/atoms/switch.test.tsx`

Dev Docs
- `docs/WEBHOOK_MAP.md`
- `docs/SCHEMA_MAP.md`

User Docs
- N/A

Open Gaps
- none

</details>

<details>
<summary><strong>Experiments, A/B Testing & Latent Max Features</strong> — Planned — max / flagged</summary>

Plan/flagged features that exist in entitlements, pricing, or experiments but do not yet expose a broad shipped surface.

- Tier: P2
- Hardening rank: 41
- Flags: `ENABLE_LIGHT_MODE`, `PWA_INSTALL_BANNER`
- Entitlements: `canAccessApiKeys`, `canAccessTeamManagement`, `canAccessWebhooks`, `canAccessAbTesting`
- Unit coverage: 57.5% across 1 files
- E2E coverage: no mapped specs

Pages
- none

Non-API Route Handlers
- `/.well-known/vercel/flags` (public) — `apps/web/app/.well-known/vercel/flags/route.ts`

API Route Handlers
- none

Server Actions
- none

Tables
- none

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/tests/unit/chat-usage-resolve-plan.test.ts`
- `apps/web/tests/unit/lib/entitlement-registry.test.ts`
- `apps/web/tests/unit/lib/entitlements.server.test.ts`
- `apps/web/tests/unit/lib/feature-flags-server.test.ts`
- `apps/web/tests/unit/lib/plan-config.test.ts`
- `apps/web/tests/unit/lib/plan-gate-edge-cases.test.tsx`
- `apps/web/tests/unit/lib/plan-gate.test.tsx`

Dev Docs
- `docs/STATSIG_FEATURE_GATES.md`

User Docs
- `apps/docs/app/docs/plans-pricing/page.mdx`
- `apps/docs/app/docs/features/analytics/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Blog & Changelog Publishing</strong> — Shipped — public</summary>

Static publishing surfaces for blog posts, changelog entries, and changelog subscriptions.

- Tier: P3
- Hardening rank: 46
- Flags: none
- Entitlements: none
- Unit coverage: 69.8% across 4 files
- E2E coverage: 2 specs

Pages
- `/blog/[slug]` — `apps/web/app/(marketing)/blog/[slug]/page.tsx`
- `/blog/category/[slug]` — `apps/web/app/(marketing)/blog/category/[slug]/page.tsx`
- `/blog` — `apps/web/app/(marketing)/blog/page.tsx`
- `/changelog` — `apps/web/app/(marketing)/changelog/page.tsx`

Non-API Route Handlers
- `/changelog/feed.xml` (public) — `apps/web/app/(marketing)/changelog/feed.xml/route.ts`

API Route Handlers
- `/api/changelog/subscribe` (public) — `apps/web/app/api/changelog/subscribe/route.ts`
- `/api/changelog/unsubscribe` (public) — `apps/web/app/api/changelog/unsubscribe/route.ts`
- `/api/changelog/verify` (public) — `apps/web/app/api/changelog/verify/route.ts`

Server Actions
- none

Tables
- `productUpdateSubscribers` — `apps/web/lib/db/schema/product-update-subscribers.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/lib/__tests__/changelog-parser.test.ts`
- `apps/web/lib/share/context.test.ts`
- `apps/web/tests/app/sitemap.test.ts`
- `apps/web/tests/e2e/content-gate.spec.ts`
- `apps/web/tests/e2e/homepage.spec.ts`
- `apps/web/tests/unit/api/changelog/changelog-unsubscribe.test.ts`
- `apps/web/tests/unit/api/changelog/changelog-verify.test.ts`
- `apps/web/tests/unit/api/changelog/subscribe.test.ts`
- `apps/web/tests/unit/core-providers-route-variant.test.tsx`
- `apps/web/tests/unit/lib/blog/resolveAuthor.test.ts`
- `apps/web/tests/unit/links/link-display-utils.test.ts`
- `apps/web/tests/unit/marketing/changelog-email-signup.test.tsx`

Dev Docs
- `docs/API_ROUTE_MAP.md`

User Docs
- `apps/docs/app/docs/page.mdx`

Open Gaps
- none

</details>

<details>
<summary><strong>Legal & Compliance Pages</strong> — Shipped — public</summary>

Static legal pages and related compliance-facing public content.

- Tier: P3
- Hardening rank: 47
- Flags: none
- Entitlements: none
- Unit coverage: no mapped coverage
- E2E coverage: 1 specs

Pages
- `/legal/cookies` — `apps/web/app/(dynamic)/legal/cookies/page.tsx`
- `/legal/dmca` — `apps/web/app/(dynamic)/legal/dmca/page.tsx`
- `/legal/privacy` — `apps/web/app/(dynamic)/legal/privacy/page.tsx`
- `/legal/terms` — `apps/web/app/(dynamic)/legal/terms/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- none

Server Actions
- none

Tables
- none

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/tests/e2e/legal.spec.ts`

Dev Docs
- `docs/PRODUCT_CAPABILITIES.md`

User Docs
- `apps/docs/app/docs/page.mdx`

Open Gaps
- No mapped unit/integration coverage

</details>

<details>
<summary><strong>Browser Extension Workflow</strong> — Shipped — dev-only</summary>

Extension session, action logging, flags, and AI-assisted browser sidecar APIs.

- Tier: P3
- Hardening rank: 48
- Flags: none
- Entitlements: none
- Unit coverage: 67.3% across 3 files
- E2E coverage: no mapped specs

Pages
- none

Non-API Route Handlers
- none

API Route Handlers
- `/api/extension/action-log` (public) — `apps/web/app/api/extension/action-log/route.ts`
- `/api/extension/actions/fill-preview` (public) — `apps/web/app/api/extension/actions/fill-preview/route.ts`
- `/api/extension/flags` (public) — `apps/web/app/api/extension/flags/route.ts`
- `/api/extension/session/status` (public) — `apps/web/app/api/extension/session/status/route.ts`
- `/api/extension/summary` (public) — `apps/web/app/api/extension/summary/route.ts`

Server Actions
- none

Tables
- none

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/extension/src/content-adapters.test.ts`
- `apps/web/tests/scripts/run-sql.test.ts`
- `apps/web/tests/unit/api/extension/action-log-route.test.ts`
- `apps/web/tests/unit/api/extension/fill-preview-route.test.ts`
- `apps/web/tests/unit/api/extension/session-status-route.test.ts`
- `apps/web/tests/unit/dev/DevToolbar.test.tsx`
- `apps/web/tests/unit/extensions/fill-preview.test.ts`
- `apps/web/tests/unit/extensions/summary.test.ts`
- `apps/web/tests/unit/lib/feature-flags-registry.test.ts`
- `apps/web/tests/unit/lib/sentry/sentry-config.test.ts`
- `apps/web/tests/unit/lib/submission-agent/attachment-validation.test.ts`
- `apps/web/tests/unit/marketing/static-revalidate-policy.test.ts`
- `apps/web/tests/unit/product-screenshots/screenshot-cleanliness.test.ts`

Dev Docs
- `docs/chrome-extension-office-hours.md`

User Docs
- N/A

Open Gaps
- none

</details>

<details>
<summary><strong>Admin Growth, Leads & Campaigns</strong> — Shipped — admin</summary>

Internal growth workspaces for creator discovery, outreach, invite campaigns, and YC metrics.

- Tier: P3
- Hardening rank: 49
- Flags: none
- Entitlements: none
- Unit coverage: 72.3% across 25 files
- E2E coverage: 3 specs

Pages
- `/app/admin/campaigns` — `apps/web/app/app/(shell)/admin/campaigns/page.tsx`
- `/app/admin/growth` — `apps/web/app/app/(shell)/admin/growth/page.tsx`
- `/app/admin/growth/yc-metrics` — `apps/web/app/app/(shell)/admin/growth/yc-metrics/page.tsx`
- `/app/admin/leads` — `apps/web/app/app/(shell)/admin/leads/page.tsx`
- `/app/admin/outreach/dm` — `apps/web/app/app/(shell)/admin/outreach/dm/page.tsx`
- `/app/admin/outreach/email` — `apps/web/app/app/(shell)/admin/outreach/email/page.tsx`
- `/app/admin/outreach` — `apps/web/app/app/(shell)/admin/outreach/page.tsx`
- `/app/admin/outreach/review` — `apps/web/app/app/(shell)/admin/outreach/review/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/admin/campaigns/invites` (admin) — `apps/web/app/api/admin/campaigns/invites/route.ts`
- `/api/admin/campaigns/settings` (admin) — `apps/web/app/api/admin/campaigns/settings/route.ts`
- `/api/admin/campaigns/stats` (admin) — `apps/web/app/api/admin/campaigns/stats/route.ts`
- `/api/admin/fit-scores` (admin) — `apps/web/app/api/admin/fit-scores/route.ts`
- `/api/admin/leads/[id]/dm-sent` (admin) — `apps/web/app/api/admin/leads/[id]/dm-sent/route.ts`
- `/api/admin/leads/[id]` (admin) — `apps/web/app/api/admin/leads/[id]/route.ts`
- `/api/admin/leads/[id]/skip` (admin) — `apps/web/app/api/admin/leads/[id]/skip/route.ts`
- `/api/admin/leads/discover` (admin) — `apps/web/app/api/admin/leads/discover/route.ts`
- `/api/admin/leads/funnel` (admin) — `apps/web/app/api/admin/leads/funnel/route.ts`
- `/api/admin/leads/keywords` (admin) — `apps/web/app/api/admin/leads/keywords/route.ts`
- `/api/admin/leads/qualify` (admin) — `apps/web/app/api/admin/leads/qualify/route.ts`
- `/api/admin/leads` (admin) — `apps/web/app/api/admin/leads/route.ts`
- `/api/admin/leads/seed` (admin) — `apps/web/app/api/admin/leads/seed/route.ts`
- `/api/admin/leads/settings` (admin) — `apps/web/app/api/admin/leads/settings/route.ts`
- `/api/admin/outreach/debug` (admin) — `apps/web/app/api/admin/outreach/debug/route.ts`
- `/api/admin/outreach` (admin) — `apps/web/app/api/admin/outreach/route.ts`
- `/api/admin/outreach/settings` (admin) — `apps/web/app/api/admin/outreach/settings/route.ts`
- `/api/admin/overview` (admin) — `apps/web/app/api/admin/overview/route.ts`

Server Actions
- none

Tables
- `campaignSettings` — `apps/web/lib/db/schema/admin.ts`
- `discoveryKeywords` — `apps/web/lib/db/schema/leads.ts`
- `leadFunnelEvents` — `apps/web/lib/db/schema/leads.ts`
- `leadPipelineSettings` — `apps/web/lib/db/schema/leads.ts`
- `leads` — `apps/web/lib/db/schema/leads.ts`
- `leadSearchResults` — `apps/web/lib/db/schema/leads.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/components/molecules/menus/ToolbarMenuPrimitives.test.tsx`
- `apps/web/lib/utils/pagination-parser.test.ts`
- `apps/web/tests/components/dashboard/organisms/onboarding-v2-performance.test.tsx`
- `apps/web/tests/components/molecules/CopyableUrlRow.test.tsx`
- `apps/web/tests/components/organisms/release-sidebar/ReleaseMetadata.test.tsx`
- `apps/web/tests/components/release-provider-matrix/MobileReleaseList.test.tsx`
- `apps/web/tests/e2e/admin-gtm-health.spec.ts`
- `apps/web/tests/e2e/admin-navigation.spec.ts`
- `apps/web/tests/e2e/admin-visual-regression.spec.ts`
- `apps/web/tests/lib/anti-cloaking.test.ts`
- `apps/web/tests/lib/fit-scoring/calculator.test.ts`
- `apps/web/tests/lib/leads/approve-lead.test.ts`
- `apps/web/tests/lib/leads/auto-approve.test.ts`
- `apps/web/tests/lib/leads/discovery.test.ts`
- `apps/web/tests/lib/leads/email-filter.test.ts`
- `apps/web/tests/lib/leads/google-cse.test.ts`
- `apps/web/tests/lib/leads/instantly-timeout.test.ts`
- `apps/web/tests/lib/leads/lead-schemas.test.ts`
- `apps/web/tests/lib/leads/management-filter.test.ts`
- `apps/web/tests/lib/leads/pipeline-health-warnings.test.ts`
- `apps/web/tests/lib/leads/priority-score.test.ts`
- `apps/web/tests/lib/leads/process-batch.test.ts`
- `apps/web/tests/lib/leads/qualify.test.ts`
- `apps/web/tests/lib/leads/route-lead.test.ts`
- `apps/web/tests/lib/leads/url-intake.test.ts`
- `apps/web/tests/lib/profile/profile-identity.test.ts`
- `apps/web/tests/lib/queries/campaign-query-keys.test.ts`
- `apps/web/tests/scripts/overnight-qa-issues.test.ts`
- `apps/web/tests/unit/GroupedLinksManager.test.tsx`
- `apps/web/tests/unit/actions/onboarding/complete-onboarding.test.ts`
- `apps/web/tests/unit/admin/LeadTable.test.tsx`
- `apps/web/tests/unit/api/admin/leads-dm-sent.test.ts`
- `apps/web/tests/unit/api/admin/leads-id.test.ts`
- `apps/web/tests/unit/api/admin/leads-post.test.ts`
- `apps/web/tests/unit/api/admin/leads-route.test.ts`
- `apps/web/tests/unit/api/admin/outreach-route.test.ts`
- `apps/web/tests/unit/api/admin/overview.test.ts`
- `apps/web/tests/unit/api/cron/frequent.test.ts`
- `apps/web/tests/unit/app/[username]/claim/route.test.ts`
- `apps/web/tests/unit/app/admin/admin-load-failures.test.tsx`
- `apps/web/tests/unit/app/claim-token-route.test.ts`
- `apps/web/tests/unit/app/onboarding/actions/index.test.ts`
- `apps/web/tests/unit/atoms/HeaderText.test.tsx`
- `apps/web/tests/unit/auth/AuthModalShell.test.tsx`
- `apps/web/tests/unit/chat/chat-title-generation.test.ts`
- `apps/web/tests/unit/chat/profile-edit-chat.test.ts`
- `apps/web/tests/unit/components/admin/CampaignSettingsPanel.test.tsx`
- `apps/web/tests/unit/components/admin/GrowthIntakeComposer.test.tsx`
- `apps/web/tests/unit/dashboard/useReleaseProviderMatrix.test.tsx`
- `apps/web/tests/unit/discography/links.test.ts`
- `apps/web/tests/unit/inbox/inbox-utils.test.ts`
- `apps/web/tests/unit/lib/admin/funnel-metrics.test.ts`
- `apps/web/tests/unit/lib/email/campaigns/processor.test.ts`
- `apps/web/tests/unit/lib/fit-scoring/calculator.test.ts`
- `apps/web/tests/unit/lib/fit-scoring/service.test.ts`
- `apps/web/tests/unit/lib/leads/funnel-events.signup.test.ts`
- `apps/web/tests/unit/lib/leads/outreach-batch.test.ts`
- `apps/web/tests/unit/lib/lyrics/format-lyrics-for-apple-music.test.ts`
- `apps/web/tests/unit/lib/stripe/webhooks/handlers/checkout-handler.critical.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/facebook.test.ts`
- `apps/web/tests/unit/lib/tracking/forwarding/google.test.ts`
- `apps/web/tests/unit/lib/utils/csv.blob.test.ts`
- `apps/web/tests/unit/links/useLinksManager.add.test.ts`
- `apps/web/tests/unit/links/useLinksManager.youtube.test.ts`
- `apps/web/tests/unit/links/useLinksPersistence.test.ts`
- `apps/web/tests/unit/onboarding-validation.test.ts`
- `apps/web/tests/unit/profile/featured-playlist-fallback-discovery.test.ts`
- `apps/web/tests/unit/tracking/instantly-pixel.test.tsx`
- `packages/ui/atoms/common-dropdown.test.tsx`
- `packages/ui/atoms/input-group.test.tsx`
- `packages/ui/atoms/kbd.test.tsx`
- `packages/ui/atoms/label.test.tsx`
- `packages/ui/lib/dropdown-styles.test.ts`

Dev Docs
- `docs/SCHEMA_MAP.md`

User Docs
- N/A

Open Gaps
- none

</details>

<details>
<summary><strong>Admin People, Roles & Feedback</strong> — Shipped — admin</summary>

Internal admin pages for users, roles, feedback, audit activity, screenshots, and moderation support.

- Tier: P3
- Hardening rank: 50
- Flags: none
- Entitlements: none
- Unit coverage: 79.4% across 3 files
- E2E coverage: 3 specs

Pages
- `/app/admin/activity` — `apps/web/app/app/(shell)/admin/activity/page.tsx`
- `/app/admin/algorithm-health` — `apps/web/app/app/(shell)/admin/algorithm-health/page.tsx`
- `/app/admin/feedback` — `apps/web/app/app/(shell)/admin/feedback/page.tsx`
- `/app/admin/interviews` — `apps/web/app/app/(shell)/admin/interviews/page.tsx`
- `/app/admin` — `apps/web/app/app/(shell)/admin/page.tsx`
- `/app/admin/people` — `apps/web/app/app/(shell)/admin/people/page.tsx`
- `/app/admin/screenshots` — `apps/web/app/app/(shell)/admin/screenshots/page.tsx`
- `/app/admin/users` — `apps/web/app/app/(shell)/admin/users/page.tsx`
- `/app/settings/admin` — `apps/web/app/app/(shell)/settings/admin/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/admin/feedback/[id]/dismiss` (admin) — `apps/web/app/api/admin/feedback/[id]/dismiss/route.ts`
- `/api/admin/feedback` (admin) — `apps/web/app/api/admin/feedback/route.ts`
- `/api/admin/impersonate` (admin) — `apps/web/app/api/admin/impersonate/route.ts`
- `/api/admin/roles` (admin) — `apps/web/app/api/admin/roles/route.ts`
- `/api/admin/screenshots/[filename]` (admin) — `apps/web/app/api/admin/screenshots/[filename]/route.ts`
- `/api/admin/users` (admin) — `apps/web/app/api/admin/users/route.ts`

Server Actions
- none

Tables
- `adminAuditLog` — `apps/web/lib/db/schema/admin.ts`
- `adminSystemSettings` — `apps/web/lib/db/schema/admin.ts`
- `userInterviews` — `apps/web/lib/db/schema/user-interviews.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/tests/e2e/admin-dashboard.spec.ts`
- `apps/web/tests/e2e/admin-navigation.spec.ts`
- `apps/web/tests/e2e/admin-visual-regression.spec.ts`
- `apps/web/tests/lib/admin/impersonation.test.ts`
- `apps/web/tests/lib/admin/roles.test.ts`
- `apps/web/tests/unit/actions/admin-actions.test.ts`
- `apps/web/tests/unit/admin/AdminActivityLoading.test.tsx`
- `apps/web/tests/unit/api/account/delete-route.test.ts`
- `apps/web/tests/unit/api/admin/impersonate.test.ts`
- `apps/web/tests/unit/api/admin/roles.test.ts`
- `apps/web/tests/unit/api/admin/waitlist-approve.test.ts`
- `apps/web/tests/unit/api/admin/waitlist-disapprove.test.ts`
- `apps/web/tests/unit/api/admin/waitlist-settings.test.ts`
- `apps/web/tests/unit/api/cron/data-retention.test.ts`
- `apps/web/tests/unit/lib/admin/platform-connections.test.ts`
- `apps/web/tests/unit/lib/auth/clerk-sync.critical.test.ts`

Dev Docs
- `docs/testing/TEST_COVERAGE_ANALYSIS.md`

User Docs
- N/A

Open Gaps
- none

</details>

<details>
<summary><strong>Investor Portal & Pipeline</strong> — Shipped — mixed</summary>

Investor-facing portal links plus internal investor pipeline and settings surfaces.

- Tier: P3
- Hardening rank: 51
- Flags: none
- Entitlements: none
- Unit coverage: 5.4% across 8 files
- E2E coverage: 3 specs

Pages
- `/investors` — `apps/web/app/(marketing)/investors/page.tsx`
- `/app/admin/investors/links` — `apps/web/app/app/(shell)/admin/investors/links/page.tsx`
- `/app/admin/investors` — `apps/web/app/app/(shell)/admin/investors/page.tsx`
- `/app/admin/investors/settings` — `apps/web/app/app/(shell)/admin/investors/settings/page.tsx`
- `/investor-portal/[slug]` — `apps/web/app/investor-portal/[slug]/page.tsx`
- `/investor-portal` — `apps/web/app/investor-portal/page.tsx`
- `/investor-portal/respond` — `apps/web/app/investor-portal/respond/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/admin/investors/links/[id]` (admin) — `apps/web/app/api/admin/investors/links/[id]/route.ts`
- `/api/admin/investors/links` (admin) — `apps/web/app/api/admin/investors/links/route.ts`
- `/api/admin/investors/settings` (admin) — `apps/web/app/api/admin/investors/settings/route.ts`
- `/api/investors/track` (public) — `apps/web/app/api/investors/track/route.ts`

Server Actions
- none

Tables
- `investorLinks` — `apps/web/lib/db/schema/investors.ts`
- `investorSettings` — `apps/web/lib/db/schema/investors.ts`
- `investorViews` — `apps/web/lib/db/schema/investors.ts`

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/lib/canonical-surfaces.test.ts`
- `apps/web/lib/investors/__tests__/manifest.test.ts`
- `apps/web/tests/app/sitemap.test.ts`
- `apps/web/tests/e2e/admin-navigation.spec.ts`
- `apps/web/tests/e2e/admin-visual-regression.spec.ts`
- `apps/web/tests/e2e/content-gate.spec.ts`
- `apps/web/tests/unit/api/dev/clear-session.test.ts`
- `apps/web/tests/unit/app/public-surface-guardrails.test.ts`
- `apps/web/tests/unit/components/admin/PlatformStatsStrip.test.tsx`
- `apps/web/tests/unit/lib/proxy-url-mapping.test.ts`
- `apps/web/tests/unit/middleware/proxy-behavioral.test.ts`
- `apps/web/tests/unit/routes/shell-nav-coverage.test.ts`

Dev Docs
- `docs/SCHEMA_MAP.md`

User Docs
- N/A

Open Gaps
- none

</details>

<details>
<summary><strong>Health Monitoring, HUD & Deploy</strong> — Shipped — dev-only</summary>

Operational dashboards, health endpoints, deploy promotion helpers, and runtime observability surfaces.

- Tier: P3
- Hardening rank: 52
- Flags: none
- Entitlements: none
- Unit coverage: 69.7% across 26 files
- E2E coverage: 3 specs

Pages
- `/hud` — `apps/web/app/hud/page.tsx`
- `/sentry-example-page` — `apps/web/app/sentry-example-page/page.tsx`
- `/unavailable` — `apps/web/app/unavailable/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/deploy/promote` (admin) — `apps/web/app/api/deploy/promote/route.ts`
- `/api/deploy/status` (admin) — `apps/web/app/api/deploy/status/route.ts`
- `/api/health/auth` (auth) — `apps/web/app/api/health/auth/route.ts`
- `/api/health/build-info` (public) — `apps/web/app/api/health/build-info/route.ts`
- `/api/health/comprehensive` (public) — `apps/web/app/api/health/comprehensive/route.ts`
- `/api/health/db/performance` (public) — `apps/web/app/api/health/db/performance/route.ts`
- `/api/health/db` (public) — `apps/web/app/api/health/db/route.ts`
- `/api/health/deploy` (public) — `apps/web/app/api/health/deploy/route.ts`
- `/api/health/env` (public) — `apps/web/app/api/health/env/route.ts`
- `/api/health/homepage` (public) — `apps/web/app/api/health/homepage/route.ts`
- `/api/health/keys` (public) — `apps/web/app/api/health/keys/route.ts`
- `/api/health/redis` (public) — `apps/web/app/api/health/redis/route.ts`
- `/api/health` (public) — `apps/web/app/api/health/route.ts`
- `/api/hud/metrics` (public) — `apps/web/app/api/hud/metrics/route.ts`
- `/api/revalidate/featured-creators` (public) — `apps/web/app/api/revalidate/featured-creators/route.ts`
- `/api/sentry-example-api` (public) — `apps/web/app/api/sentry-example-api/route.ts`

Server Actions
- none

Tables
- none

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/tests/e2e/onboarding-flow.spec.ts`
- `apps/web/tests/e2e/sentry-red-lane.spec.ts`
- `apps/web/tests/e2e/sentry.spec.ts`
- `apps/web/tests/lib/health-checks.test.ts`
- `apps/web/tests/lib/hud/metrics.test.ts`
- `apps/web/tests/lib/monitoring/alerts.test.ts`
- `apps/web/tests/lib/monitoring/database.test.ts`
- `apps/web/tests/lib/monitoring/performance.test.ts`
- `apps/web/tests/lib/monitoring/regression.test.ts`
- `apps/web/tests/lib/monitoring/user-journey.test.ts`
- `apps/web/tests/lib/monitoring/web-vitals.test.ts`
- `apps/web/tests/lib/queries/useEnvHealthQuery.test.tsx`
- `apps/web/tests/performance/onboarding-performance.spec.ts`
- `apps/web/tests/unit/api/deploy/promote.test.ts`
- `apps/web/tests/unit/api/deploy/status.test.ts`
- `apps/web/tests/unit/api/health/auth.critical.test.ts`
- `apps/web/tests/unit/api/health/build-info.critical.test.ts`
- `apps/web/tests/unit/api/health/comprehensive.critical.test.ts`
- `apps/web/tests/unit/api/health/db-performance.critical.test.ts`
- `apps/web/tests/unit/api/health/db.critical.test.ts`
- `apps/web/tests/unit/api/health/deploy.critical.test.ts`
- `apps/web/tests/unit/api/health/env.critical.test.ts`
- `apps/web/tests/unit/api/health/homepage.critical.test.ts`
- `apps/web/tests/unit/api/health/keys.critical.test.ts`
- `apps/web/tests/unit/api/health/main.critical.test.ts`
- `apps/web/tests/unit/api/health/redis.critical.test.ts`
- `apps/web/tests/unit/api/hud-metrics-route.test.ts`
- `apps/web/tests/unit/api/revalidate/featured-creators.test.ts`
- `apps/web/tests/unit/api/sentry-example-api.test.ts`

Dev Docs
- `docs/TESTING_STRATEGY.md`
- `docs/SYNTHETIC_MONITORING.md`

User Docs
- N/A

Open Gaps
- none

</details>

<details>
<summary><strong>Demo, UI Gallery & Sandbox</strong> — Shipped — dev-only</summary>

Demo routes, design-system galleries, sandbox pages, and screenshot-oriented visual evaluation surfaces.

- Tier: P3
- Hardening rank: 53
- Flags: none
- Entitlements: none
- Unit coverage: 71.8% across 23 files
- E2E coverage: 13 specs

Pages
- `/demo/video` — `apps/web/app/(marketing)/demo/video/page.tsx`
- `/renders/[state]` — `apps/web/app/(marketing)/renders/[state]/page.tsx`
- `/renders` — `apps/web/app/(marketing)/renders/page.tsx`
- `/renders/surfaces/[surface]` — `apps/web/app/(marketing)/renders/surfaces/[surface]/page.tsx`
- `/demo/audience` — `apps/web/app/demo/audience/page.tsx`
- `/demo/dropdowns` — `apps/web/app/demo/dropdowns/page.tsx`
- `/demo` — `apps/web/app/demo/page.tsx`
- `/demo/showcase/[surface]` — `apps/web/app/demo/showcase/[surface]/page.tsx`
- `/dev/smart-links` — `apps/web/app/dev/smart-links/page.tsx`
- `/sandbox` — `apps/web/app/sandbox/page.tsx`
- `/spinner-test` — `apps/web/app/spinner-test/page.tsx`
- `/ui/avatars` — `apps/web/app/ui/avatars/page.tsx`
- `/ui/badges` — `apps/web/app/ui/badges/page.tsx`
- `/ui/buttons` — `apps/web/app/ui/buttons/page.tsx`
- `/ui/checkboxes` — `apps/web/app/ui/checkboxes/page.tsx`
- `/ui/dialogs` — `apps/web/app/ui/dialogs/page.tsx`
- `/ui/dropdowns` — `apps/web/app/ui/dropdowns/page.tsx`
- `/ui/inputs` — `apps/web/app/ui/inputs/page.tsx`
- `/ui` — `apps/web/app/ui/page.tsx`
- `/ui/selects` — `apps/web/app/ui/selects/page.tsx`
- `/ui/switches` — `apps/web/app/ui/switches/page.tsx`
- `/ui/tooltips` — `apps/web/app/ui/tooltips/page.tsx`

Non-API Route Handlers
- none

API Route Handlers
- `/api/demo/download` (public) — `apps/web/app/api/demo/download/route.ts`
- `/api/images/artwork/upload` (auth) — `apps/web/app/api/images/artwork/upload/route.ts`
- `/api/images/press-photos/[photoId]` (public) — `apps/web/app/api/images/press-photos/[photoId]/route.ts`
- `/api/images/status/[id]` (auth) — `apps/web/app/api/images/status/[id]/route.ts`
- `/api/images/upload` (public) — `apps/web/app/api/images/upload/route.ts`

Server Actions
- none

Tables
- none

Jobs
- none

Webhooks
- none

Mapped Tests
- `apps/web/lib/canonical-surfaces.test.ts`
- `apps/web/tests/app/sitemap.test.ts`
- `apps/web/tests/components/dashboard/DashboardNav.interaction.test.tsx`
- `apps/web/tests/components/release-provider-matrix/AddReleaseSidebar.test.tsx`
- `apps/web/tests/e2e/admin-visual-regression.spec.ts`
- `apps/web/tests/e2e/axe-audit.spec.ts`
- `apps/web/tests/e2e/demo-live-parity.spec.ts`
- `apps/web/tests/e2e/demo-qa.spec.ts`
- `apps/web/tests/e2e/dropdown-parity.spec.ts`
- `apps/web/tests/e2e/icon-contrast-audit.spec.ts`
- `apps/web/tests/e2e/linear-shell-parity.spec.ts`
- `apps/web/tests/e2e/profile-visual-audit.spec.ts`
- `apps/web/tests/e2e/releases-dashboard.health.spec.ts`
- `apps/web/tests/e2e/responsive-golden-path.spec.ts`
- `apps/web/tests/e2e/tim-white-profile-showcase.spec.ts`
- `apps/web/tests/e2e/visual-regression.spec.ts`
- `apps/web/tests/e2e/yc-demo.spec.ts`
- `apps/web/tests/product-screenshots/audience.spec.ts`
- `apps/web/tests/product-screenshots/insights.spec.ts`
- `apps/web/tests/unit/api/images/press-photos-delete.test.ts`
- `apps/web/tests/unit/api/images/status.test.ts`
- `apps/web/tests/unit/api/images/upload.test.ts`
- `apps/web/tests/unit/app/onboarding/actions/avatar.test.ts`
- `apps/web/tests/unit/app/public-surface-guardrails.test.ts`
- `apps/web/tests/unit/app/surface-elevation-guardrails.test.ts`
- `apps/web/tests/unit/chat/breadcrumb-uuid.test.ts`
- `apps/web/tests/unit/components/feedback/sidebar-lower-shell-visual-hierarchy.test.tsx`
- `apps/web/tests/unit/constants/routes.test.ts`
- `apps/web/tests/unit/dashboard/DashboardNav.test.tsx`
- `apps/web/tests/unit/dashboard/HeaderChatUsageIndicator.test.tsx`
- `apps/web/tests/unit/demo/DemoPublicProfileSurface.test.tsx`
- `apps/web/tests/unit/demo/DemoTimWhiteProfileSurface.test.tsx`
- `apps/web/tests/unit/demo/demo-actions.test.ts`
- `apps/web/tests/unit/demo/demo-releases-experience.test.tsx`
- `apps/web/tests/unit/demo/demo-surface-boundaries.test.ts`
- `apps/web/tests/unit/demo/mock-release-data.test.ts`
- `apps/web/tests/unit/demo/showcase-surfaces.test.ts`
- `apps/web/tests/unit/home/dashboard-demos.test.tsx`
- `apps/web/tests/unit/home/tim-white-marketing-fixtures.test.ts`
- `apps/web/tests/unit/home/tim-white-profile.test.ts`
- `apps/web/tests/unit/icon-contrast.test.ts`
- `apps/web/tests/unit/lib/accent-palette.test.ts`
- `apps/web/tests/unit/routes/route-coverage.test.ts`
- `apps/web/tests/unit/simple-tooltip.test.tsx`
- `apps/web/tests/unit/tooltip.test.tsx`
- `packages/ui/atoms/alert-dialog.test.tsx`
- `packages/ui/atoms/badge.test.tsx`
- `packages/ui/atoms/button.test.tsx`
- `packages/ui/atoms/card.test.tsx`
- `packages/ui/atoms/checkbox.test.tsx`
- `packages/ui/atoms/close-button.test.tsx`
- `packages/ui/atoms/common-dropdown.test.tsx`
- `packages/ui/atoms/context-menu.test.tsx`
- `packages/ui/atoms/dialog.test.tsx`
- `packages/ui/atoms/dropdown-menu.test.tsx`
- `packages/ui/atoms/field.test.tsx`
- `packages/ui/atoms/form.test.tsx`
- `packages/ui/atoms/input-group.test.tsx`
- `packages/ui/atoms/input.test.tsx`
- `packages/ui/atoms/kbd.test.tsx`
- `packages/ui/atoms/label.test.tsx`
- `packages/ui/atoms/popover.test.tsx`
- `packages/ui/atoms/radio-group.test.tsx`
- `packages/ui/atoms/searchable-submenu.test.tsx`
- `packages/ui/atoms/segment-control.test.tsx`
- `packages/ui/atoms/select.test.tsx`
- `packages/ui/atoms/separator.test.tsx`
- `packages/ui/atoms/sheet.test.tsx`
- `packages/ui/atoms/simple-tooltip.test.tsx`
- `packages/ui/atoms/skeleton.test.tsx`
- `packages/ui/atoms/switch.test.tsx`
- `packages/ui/atoms/textarea.test.tsx`
- `packages/ui/atoms/tooltip-shortcut.test.tsx`
- `packages/ui/atoms/tooltip.test.tsx`
- `packages/ui/lib/dropdown-styles.test.ts`
- `packages/ui/lib/overlay-styles.test.ts`
- `packages/ui/lib/utils.test.ts`

Dev Docs
- `docs/testing/TEST_COVERAGE_ANALYSIS.md`
- `docs/JOV-1605-screenshot-parity-ledger.md`

User Docs
- N/A

Open Gaps
- none

</details>

## Orphans

- none

## Ambiguities

- pages: `apps/web/app/(marketing)/artist-notifications/page.tsx` matched `subscribe-follow-page`, `homepage-marketing-acquisition`
- pages: `apps/web/app/(marketing)/artist-profile/page.tsx` matched `public-profile-page`, `homepage-marketing-acquisition`
- pages: `apps/web/app/(marketing)/artist-profiles/page.tsx` matched `public-profile-page`, `homepage-marketing-acquisition`
- pages: `apps/web/app/app/(shell)/dashboard/releases/page.tsx` matched `releases-smart-links`, `manual-release-creation`
- pages: `apps/web/app/billing/success/page.tsx` matched `billing-subscription-management`, `onboarding-handle-claiming`
- publicRoutes: `apps/web/app/app/(shell)/admin/users/ban/route.ts` matched `admin-creator-ops-ingestion`, `admin-people-roles-feedback`
- publicRoutes: `apps/web/app/app/(shell)/admin/users/delete/route.ts` matched `admin-creator-ops-ingestion`, `admin-people-roles-feedback`
- publicRoutes: `apps/web/app/app/(shell)/admin/users/toggle-featured/route.ts` matched `admin-creator-ops-ingestion`, `admin-people-roles-feedback`
- publicRoutes: `apps/web/app/app/(shell)/admin/users/toggle-marketing/route.ts` matched `admin-creator-ops-ingestion`, `admin-people-roles-feedback`
- publicRoutes: `apps/web/app/app/(shell)/admin/users/toggle-verify/route.ts` matched `admin-creator-ops-ingestion`, `admin-people-roles-feedback`
- publicRoutes: `apps/web/app/app/(shell)/admin/users/unban/route.ts` matched `admin-creator-ops-ingestion`, `admin-people-roles-feedback`
- publicRoutes: `apps/web/app/app/(shell)/admin/waitlist/approve/route.ts` matched `waitlist-access-requests`, `admin-people-roles-feedback`
- publicRoutes: `apps/web/app/app/(shell)/admin/waitlist/disapprove/route.ts` matched `waitlist-access-requests`, `admin-people-roles-feedback`
- publicRoutes: `apps/web/app/app/(shell)/admin/waitlist/settings/route.ts` matched `waitlist-access-requests`, `admin-people-roles-feedback`
- publicRoutes: `apps/web/app/app/(shell)/admin/waitlist/update-status/route.ts` matched `waitlist-access-requests`, `admin-people-roles-feedback`
- apiRoutes: `apps/web/app/api/artist/theme/route.ts` matched `public-profile-page`, `artist-bio-social-links`
- apiRoutes: `apps/web/app/api/dashboard/releases/[releaseId]/analytics/route.ts` matched `releases-smart-links`, `manual-release-creation`
- apiRoutes: `apps/web/app/api/dashboard/releases/[releaseId]/pitch/route.ts` matched `releases-smart-links`, `manual-release-creation`
- apiRoutes: `apps/web/app/api/dashboard/releases/[releaseId]/tracks/route.ts` matched `releases-smart-links`, `manual-release-creation`
- apiRoutes: `apps/web/app/api/dev/test-user/set-plan/route.ts` matched `auth-account-management`, `billing-subscription-management`
- apiRoutes: `apps/web/app/api/link/[id]/route.ts` matched `releases-smart-links`, `smart-link-routing-short-links`
- apiRoutes: `apps/web/app/api/notifications/preferences/route.ts` matched `subscribe-follow-page`, `release-notifications`
- apiRoutes: `apps/web/app/api/spotify/search/route.ts` matched `releases-smart-links`, `auto-sync-dsp-linking`, `spotify-oauth-platform-connections`
- tables: `artists` matched `releases-smart-links`, `auto-sync-dsp-linking`
- tables: `creatorClaimInvites` matched `onboarding-handle-claiming`, `admin-creator-ops-ingestion`
- tables: `creatorContacts` matched `fan-crm-contacts-audience`, `contact-page`
- tables: `feedbackItems` matched `contact-page`, `admin-people-roles-feedback`
- tables: `providerLinks` matched `releases-smart-links`, `auto-sync-dsp-linking`
- tables: `stripeWebhookEvents` matched `billing-subscription-management`, `webhooks-crons-automation`, `creator-inbox-email-campaigns`
- tables: `webhookEvents` matched `webhooks-crons-automation`, `creator-inbox-email-campaigns`
