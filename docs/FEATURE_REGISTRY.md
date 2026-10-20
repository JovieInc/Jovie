# Feature Registry

This document is the canonical feature list for Jovie. It is designed for onboarding, product documentation, and release planning.

## How to Read This Registry

- **Status** reflects current production state.
  - **Shipped**: live and generally available
  - **Shipped (internal v1 default-on)**: live with former rollout gates on by default
  - **In rollout**: live for a subset of users/traffic
- **Access model** clarifies whether a feature is free, plan-gated, role-gated, or flag-gated.
- **Flag / Gate** links to the control mechanism when applicable.

## Canonical Sources

- Plan capabilities and limits: `apps/web/lib/entitlements/registry.ts`
- App flag defaults: `apps/web/lib/flags/contracts.ts`
- Static marketing controls: `apps/web/lib/flags/marketing-static.ts`
- Detailed Statsig gate documentation: `docs/STATSIG_FEATURE_GATES.md`
- **Rich feature descriptions for AI agents and marketing:** `docs/PRODUCT_CAPABILITIES.md`
- **User-facing documentation:** `apps/docs/` (live at docs.jov.ie)

## Stable Feature IDs

Help Center article frontmatter may reference only IDs in this table. The IDs
are durable contracts: feature copy may change without changing the ID. Adding
an ID does not certify the feature or make it publicly available; status and
access remain authoritative in the product feature list below.

| Feature ID | Product feature |
|---|---|
| smart-link-editing-and-customization | Smart link editing and customization |
| auto-dsp-detection-linking | Auto DSP detection & linking |
| auto-sync-from-spotify | Auto-sync from Spotify |
| manual-release-creation | Manual release creation |
| public-profile-pages | Public profile pages |
| artist-bio-social-links | Artist bio & social links |
| click-visit-tracking | Click & visit tracking |
| audience-intelligence-device-location-intent | Audience intelligence (device, location, intent) |
| ai-powered-insights | AI-powered insights |
| direct-upgrade-checkout-flow | Direct upgrade checkout flow |
| subscription-and-billing-management | Subscription and billing management |
| account-data-export-and-deletion | Account data export and deletion |
| support-and-incorrect-data-reporting | Support and incorrect data reporting |

## Product Feature List

| Product area | Feature | Status | Access model | Flag / Gate | Notes |
|---|---|---|---|---|---|
| Smart Links | Unlimited smart links | Shipped | Free+ | None | Core product capability |
| Smart Links | Smart deep links | Shipped | Free+ | None | Included in all plans |
| Smart Links | Smart link editing and customization | Shipped | Free+ | None | Entitlement-backed (`canEditSmartLinks`) |
| Smart Links | Release pages with listen links per DSP | Shipped | Free+ | None | Public route per release |
| Smart Links | Short link redirects | Shipped | Free+ | None | /r/slug redirect |
| Smart Links | Vanity URLs / content slugs | Shipped | Free+ | None | Custom slug support |
| Smart Links | Auto DSP detection & linking | Shipped | Free+ | None | MusicFetch integration |
| Smart Links | "Use This Sound" pages | Shipped | Free+ | None | /{username}/{slug}/sounds — TikTok, Reels, Shorts |
| Smart Links | Spotify pre-save campaigns | Shipped (internal v1 default-on) | Free+ | Former key: `smartlink_pre_save_campaigns` | Product rollout flag defaults on |
| Release Workflows | Auto-sync from Spotify | Shipped | Free+ | None | Base ingestion flow |
| Release Workflows | Manual release creation | Shipped | Free+ | None | Entitlement-backed (`canCreateManualReleases`) |
| Release Workflows | Pre-release and countdown pages | Shipped | Pro+ | None | Entitlement-backed (`canAccessFutureReleases`) |
| Profile | Public profile pages | Shipped | Free+ | None | ISR-backed public route |
| Profile | Artist bio & social links | Shipped | Free+ | None | Auto-suggested from DSPs |
| Profile | Subscribe / follow page | Shipped | Free+ | None | /username/subscribe |
| Profile | Contact page | Shipped | Free+ | None | /username/contact |
| Profile | About page | Shipped | Free+ | None | /username/about |
| Profile | DSP bulk press-photo import | Shipped (internal v1 default-on) | Evidence-gated | Former key: `bulk_press_photo_import` | Product flag defaults on; platform activation evidence still controls auto-ingestion quality |
| Profile | Tour dates (Bandsintown) | Shipped | Free+ | None | /username/tour |
| Profile | Apple Wallet profile pass | Shipped (internal v1 default-on) | Free+ | Former key: `apple_wallet_profile_pass` | First-party generic Wallet pass with tracked QR source link and PassKit update service |
| Profile | Latest release card on profile | Shipped (flagged) | Free+ | `feature_latest_release_card` | Rollout-controlled UI module |
| Profile | Verified badge | Shipped | Pro+ | None | Entitlement-backed (`canBeVerified`) |
| Analytics | Click & visit tracking | Shipped | Free+ | None | Default analytics |
| Analytics | Basic analytics (30-day retention) | Shipped | Free+ | None | Default retention on free |
| Analytics | Audience intelligence (device, location, intent) | Shipped | Free+ | None | Audience table |
| Analytics | Advanced analytics and geo insights | Shipped | Pro+ | None | Entitlement-backed (`canAccessAdvancedAnalytics`) |
| Analytics | Self-traffic filtering | Shipped | Pro+ | None | Entitlement-backed (`canFilterSelfFromAnalytics`) |
| Analytics | AI-powered insights | Shipped | Pro+ | None | Insights dashboard (city growth, markets, momentum) |
| Analytics | AI crawler intelligence | Shipped | Free teaser / Pro detail | None | Audience dashboard card + detail panel; Cloudflare edge analytics synced daily; Pro unlocks named crawlers and trends (GitHub #12747 P0) |
| Analytics | Ad pixel tracking | Shipped | Pro+ | None | Entitlement-backed (`canAccessAdPixels`) |
| Monetization (Planned) | Machine-access revenue share (Pay Per Crawl) | Planned | Pro+ | None | Gated on Cloudflare Pay Per Crawl beta — attribution ledger + Stripe Connect payouts (#12749). Consent/tax/payout decision package: [machine-access-revenue-share-compliance.md](product/machine-access-revenue-share-compliance.md) (JOV-3831); policy constants `apps/web/lib/monetization/machine-access-payout-policy.ts` |
| Monetization (Planned) | x402-paid artist datasets / MCP tools | Planned | Pro+ | None | Gated on Cloudflare Monetization Gateway access — spike #12750 |
| Growth | Contact / subscriber capture | Shipped | Free+ | None | Contact limit varies by plan (100 / unlimited) |
| Growth | Contact export | Shipped | Pro+ | None | Entitlement-backed (`canExportContacts`) |
| Growth | Fan CRM | Shipped | Pro+ | None | Contact management dashboard |
| Growth | Release notifications | Shipped | Free+ | None | Entitlement-backed (`canSendNotifications`) |
| Monetization | Tips & payments (Venmo) | Shipped | Pro+ | None | Venmo today, Stripe Connect coming |
| Monetization | Earnings dashboard | Shipped | Pro+ | None | /dashboard/earnings |
| Monetization | Chat-generated merch cards, checkout, fulfillment, and payout ledger | Shipped (internal v1 default-on) | Trial/Pro/Max | Former key: `merch_mvp` | Jovie-owned merch cards; Stripe Checkout under Jovie; Printful fulfillment; manual artist payout ledger |
| Monetization | First merch-sale SMS to the artist | Shipped (dry-run) | Flag-gated | `FIRST_SALE_TEXT_LIVE` (default off) | One-time celebratory text on the first paid merch order; uses existing Twilio `sendNotification` rail |
| AI Assistant | AI assistant (daily message limits by plan) | Shipped | Free+/Pro+/Growth | None | Plan limits: 25/100/500 msgs |
| AI Assistant | Merch creation tools | Shipped (internal v1 default-on) | Trial/Pro/Max | Former key: `merch_mvp` | Entitlement-backed (`canAccessMerchCreation`); generates exactly 3 deterministic production-art options |
| AI Connectors | Gmail booking email to Google Calendar auto-add | Shipped (internal v1 default-on) | Internal team | Former key: `ai_connectors_beta` | Product rollout flag defaults on |
| Mobile App | iOS internal TestFlight app | Shipped | Authenticated users | None | Internal v1 install access; public marketing remains off |
| Brand | Remove Jovie branding | Shipped | Pro+ | None | Entitlement-backed (`canRemoveBranding`) |
| Growth (Coming Soon) | A/B testing | Planned | Growth | None | Smart link variant testing |
| Growth (Coming Soon) | Automated follow-ups | Planned | Growth | None | Auto-follow-up emails to fans |
| Growth (Coming Soon) | Catalog monitoring | Planned | Growth | None | Monitor catalog across DSPs |
| Integrations | Spotify OAuth sign-in method | Shipped (internal v1 default-on) | Free+ | Former key: `feature_spotify_oauth` | Available in auth method selector |
| Billing | Direct upgrade checkout flow | Shipped (internal v1 default-on) | Free+ | Former key: `billing.upgradeDirect` | Billing UX experiment |
| Billing | Subscription and billing management | Shipped | Free+ | None | Plan status, Stripe portal, and cancellation controls |
| Account | Account data export and deletion | Shipped | Authenticated users | None | Settings controls backed by account export and deletion routes |
| Support | Support and incorrect data reporting | Shipped | Public | None | Contextual Help Center handoff plus direct email fallback |
| Conversion | Subscribe CTA variant experiment | In rollout | Flag-gated | `experiment_subscribe_cta_variant` | Variant defaults to `inline` |
| Conversion | Public profile PAC variant slots | In rollout | Flag-gated | `profile_pac_variant_slots` | Five-slot Statsig experiment: S1 copy arm, S1 trigger threshold, S2 monetization slot, cold-visitor tab bar, capture dismiss affordance |
| Creator recording | Teleprompter recording proposals + showcase interstitial | In rollout | Flag-gated | `teleprompter_recording` + `experiment_teleprompter_showcase` | A/B measures interstitial lift into recorder use |
| Mobile UX | iOS Apple Music destination prioritization | Shipped (internal v1 default-on) | Free+ | Former key: `feature_ios_apple_music_priority` | Listen interface optimization |
| Marketing Site | Modular homepage sections | Shipped (internal v1 default-on) | Internal v1 default-on flags | `homepage_*` flags | Static flags default visible |

## Product flag retirement inventory (JOV-7733)

Source review: 2026-10-20. This is a code inventory, **not a live configuration or
availability receipt**. Runtime defaults come from `lib/flags/contracts.ts`,
environment controls from `lib/flags/code-flags.ts`, and static marketing values
from `lib/flags/marketing-static.ts` (paths relative to `apps/web`). The former
`lib/flags/homepage.ts` / `homepage_*` list is obsolete and has been removed here.

This slice retires `INBOX_HOME` and `PROFILES_WORKSPACE` throughout their
contracts, route payloads, admin presentation, desktop/mobile/Cmd-K discovery,
profile handoffs and bookmark redirects. Inbox uses its supported decision stack;
Profiles retains authentication, ownership, data-loading and empty/error states.
Retired `DESIGN_V1` is already absent from runtime contracts; stale overrides
cannot restore it. Product rollout removal does not grant an entitlement.

Every **Remove** disposition below is assigned to [JOV-8707](https://linear.app/jovie/issue/JOV-8707)
for coherent later slices alongside JOV-8057, rather than blanket flipping values.
**Keep** names the independent operational, security, consent, payment or admission
purpose. Working presentation does not remain gated for subjective polish.
The source defaults below are preserved in this slice.

### Runtime app controls

| Flag | Source default | Disposition |
|---|---|---|
| `AGENT_PROFILE_CREATE` | `true` | Keep public anonymous-write abuse stop; auth and ownership checks remain separate. |
| `AI_CONNECTORS_BETA` | `true` | Remove rollout gate; preserve connector consent, lifecycle, outbound-send and provider stops. |
| `ALBUM_ART_GENERATION` | `true` | Keep provider-work/spend stop; generation budgets and entitlement remain required. |
| `APPLE_WALLET_PROFILE_PASS` | `true` | Remove rollout gate in favor of supported Wallet pass behavior. |
| `BILLING_UPGRADE_DIRECT` | `true` | Remove checkout-path experiment gate in favor of supported direct upgrade; retain billing authorization. |
| `BULK_PRESS_PHOTO_IMPORT` | `true` | Remove rollout gate; keep platform activation/ingestion evidence checks. |
| `CHAT_JANK_MONITOR` | `true` | Keep optional performance-instrumentation stop. |
| `CREATOR_FINANCE` | `false` | Keep privacy/correctness release gate and independent FINANCE_DISABLE stop (JOV-4621). |
| `IOS_APPLE_MUSIC_PRIORITY` | `true` | Remove rollout gate in favor of supported iOS destination ordering. |
| `JOVIE_WORK_NAV` | `false` | Remove discoverability gate in favor of supported Work destination; preserve execution admission. |
| `MERCH_MVP` | `true` | Remove product rollout gate; retain commerce/fulfillment incident stops and paid entitlements. |
| `ONBOARDING_WOW_TASK_QUEUE` | `true` | Keep onboarding task-queue incident stop (JOV-3988). |
| `PAID_WELCOME_EMAIL` | `false` | Keep founder first-send/transactional-delivery stop (JOV-6445). |
| `PLAYLIST_ENGINE` | `true` | Keep scheduled playlist-generation provider-work stop; cron auth/budgets remain. |
| `PROFILE_SEARCH_MONITORING` | `false` | Keep provider runner enable/stop; preserve scheduler, provider-health and budget controls. Do not flip its default or delete its live enable override. |
| `RELEASE_PLAN_DEMO` | `false` | Delete mock demo route or replace only with real accepted behavior; never enable the mock in production. |
| `RELEASE_TO_REVENUE_AUTOPILOT` | `true` | Keep single-design-partner automation stop; do not widen pilot audience. |
| `SMARTLINK_PRE_SAVE` | `true` | Remove rollout gate in favor of supported pre-save flow; retain OAuth consent and provider limits. |
| `SPOTIFY_OAUTH` | `true` | Keep provider login/connection incident stop; do not change authorization or scopes. |
| `STRIPE_CONNECT_ENABLED` | `true` | Keep payout/checkout operational stop; paid entitlements and settlement restrictions remain. |
| `TELEPROMPTER_RECORDING` | `true` | Remove recording rollout gate; keep permission/consent and experiment assignment separate. |
| `VISIBILITY_AUDIT_OFFER` | `false` | Keep paid-offer checkout-readiness gate requiring the configured Stripe Payment Link. |
| `YOUTUBE_WORKSPACE_NAV` | `false` | Remove discoverability gate in favor of supported workspace; retain generation spend/publication controls. |

### Environment code controls

| Flag | Source default | Disposition |
|---|---|---|
| `AUTH_OFFER_SUMMARY` | `false` | Remove copy/layout gate after selecting the supported offer recap; no pricing, auth or entitlement change. |
| `CANVAS_GRAIN` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `CHATGPT_APP_DIRECTORY_MCP` | `false` | Keep public API exposure security control; no dynamic client registration grant. |
| `CHAT_COMPOSER_V2` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `CYAN_FOCUS_GLOW` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `INVESTOR_PORTAL_YC_DECK` | `false` | Remove narrative/layout gate in favor of the supported private brief; preserve financial privacy and sourced claims. |
| `IN_HOUSE_RESOLVER` | `false` | Keep resolver rollback compatibility control (JOV-7323). |
| `MARKETING_GENERIC_CREATOR_NAV` | `true` | Remove presentation switch in favor of supported creator wording; no new capability claim. |
| `MEMORY_STUDIO_SESSION_V0` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `MUSICFETCH_FALLBACK` | `false` | Keep vendor spend/provider fallback stop (JOV-7323). |
| `MUSIC_RESOLVER_PROVIDER_LINKS` | `false` | Keep provider-family routing/rollback control (JOV-7323). |
| `MUSIC_RESOLVER_RELEASE_FACTS` | `false` | Keep provider-family routing/rollback control (JOV-7323). |
| `NEW_RELEASE_PAGE` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION` | `false` | Keep unauthenticated client-registration security boundary and redirect allowlist. |
| `SOCIAL_HTML_ISOLATED_PROVIDER` | `false` | Keep off: isolation provider is absent; server-IP scraping remains prohibited. |
| `YOUTUBE_THUMBNAILS_PASTE_GENERATE` | `false` | Keep model-spend/output-certification control (JOV-5862); provider publication restrictions remain. |

### Static marketing controls

| Flag | Source default | Disposition |
|---|---|---|
| `SHOW_ARTIST_PROFILE_PAY_FLOW_VIDEO` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_EXAMPLE_PROFILES_CAROUSEL` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_FEATURE_SHOWCASE` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_FINAL_CTA` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_FORGEUI_MARKETING_UPDATES` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOMEPAGE_AI_COMPOSER_SECTION` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOMEPAGE_CENTER_NAV` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOMEPAGE_FAQ` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOMEPAGE_FRIDAY_RHYTHM` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOMEPAGE_GO_LIVE_SECTION` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOMEPAGE_SECTIONS` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOMEPAGE_UNLOCKED_SECTIONS` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOMEPAGE_V2_CAPTURE_REACTIVATE` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOMEPAGE_V2_FINAL_CTA` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOMEPAGE_V2_FOOTER_LINKS` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOMEPAGE_V2_POWER_GRID` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOMEPAGE_V2_PRICING` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOMEPAGE_V2_SOCIAL_PROOF` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOMEPAGE_V2_SPOTLIGHT` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOMEPAGE_V2_SYSTEM_OVERVIEW` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOMEPAGE_V2_TRUST` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOME_REFRESH_2026` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_HOME_V1_DESIGN` | `false` | Remove inverted gate AND obsolete V1 branch; keep supported V2 homepage, never flip true. |
| `SHOW_LOGO_BAR` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_MARKETING_CENTER_NAV` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_MARKETING_FULL_FOOTER` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_PHONE_TOUR` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_PRODUCT_DEMO_VIDEO` | `false` | Keep founder gate until approved master, playback certification and founder acceptance (JOV-7208). |
| `SHOW_PUBLIC_ABOUT_FOOTER_REFRESH` | `false` | Remove presentation fork in favor of supported About/footer content; no blanket enable. |
| `SHOW_PUBLIC_PROFILE_V1_DESIGN` | `false` | Remove inverted gate AND obsolete V1 branch; keep supported current public profile, never flip true. |
| `SHOW_REPLACES_SECTION` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `SHOW_SEE_IT_IN_ACTION` | `true` | Remove presentation gate in favor of the supported enabled behavior. |
| `WAITLIST_ENABLED` | `true` | Keep acquisition/admission policy; not part of product rollout retirement. |

### Override cleanup and rollback

[JOV-8708](https://linear.app/jovie/issue/JOV-8708) owns exact deployed-build,
ordinary-user desktop/mobile acceptance and live cleanup. The October 3 dev DB
snapshot is historical. The production read on October 20 failed because Doppler
`jovie-web/prd` had no token; **no live row or audit event was changed**.

Retain the retired Inbox/Profiles rows until activation and the rollback window
are reconciled. Before rolling back to old default-off code, restore the verified
enabled cells **before** switching application versions. Audit history alone may
not contain values written before auditing existed. Do not replay the prior PR's
blanket DELETE: re-read values/timestamps immediately before a transactional
compare-and-swap cleanup, preserve explicit false incident cells, concurrent/newer
operator writes, and append-only audit history. Delete only obsolete retired
`DESIGN_V1` data or currently verified default-equivalent cells/rows. An all-true
row is not redundant while an old rollback target still defaults it off.

Ship now: permanent Inbox/Profiles source behavior and regressions. Re-evaluate
when this exact change is deployed with ordinary-user acceptance and production
configuration access (JOV-8708). Then perform verified cleanup and the remaining
Remove dispositions (JOV-8707), preserving operational stop controls.

## Change Management

When shipping or updating any feature:

1. Update product behavior in code.
2. Change flag defaults only when the feature should stop being internal-v1 default-on.
3. Sync this registry and `docs/STATSIG_FEATURE_GATES.md` in the same PR.
4. Add rich feature description to `docs/PRODUCT_CAPABILITIES.md`.
5. Refresh the relevant `apps/docs/` page (user-facing docs at docs.jov.ie).
6. Include tests for default-on behavior and any explicit kill switch behavior where applicable.
