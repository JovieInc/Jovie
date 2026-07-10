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
- Homepage section flags: `apps/web/lib/flags/homepage.ts`
- Detailed Statsig gate documentation: `docs/STATSIG_FEATURE_GATES.md`
- **Rich feature descriptions for AI agents and marketing:** `docs/PRODUCT_CAPABILITIES.md`
- **User-facing documentation:** `apps/docs/` (live at docs.jov.ie)

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
| Monetization (Planned) | Machine-access revenue share (Pay Per Crawl) | Planned | Pro+ | None | Gated on Cloudflare Pay Per Crawl beta — attribution ledger + Stripe Connect payouts (#12749) |
| Monetization (Planned) | x402-paid artist datasets / MCP tools | Planned | Pro+ | None | Gated on Cloudflare Monetization Gateway access — spike #12750 |
| Growth | Contact / subscriber capture | Shipped | Free+ | None | Contact limit varies by plan (100 / unlimited) |
| Growth | Contact export | Shipped | Pro+ | None | Entitlement-backed (`canExportContacts`) |
| Growth | Fan CRM | Shipped | Pro+ | None | Contact management dashboard |
| Growth | Release notifications | Shipped | Free+ | None | Entitlement-backed (`canSendNotifications`) |
| Monetization | Tips & payments (Venmo) | Shipped | Pro+ | None | Venmo today, Stripe Connect coming |
| Monetization | Earnings dashboard | Shipped | Pro+ | None | /dashboard/earnings |
| Monetization | Chat-generated merch cards, checkout, fulfillment, and payout ledger | Shipped (internal v1 default-on) | Trial/Pro/Max | Former key: `merch_mvp` | Jovie-owned merch cards; Stripe Checkout under Jovie; Printful fulfillment; manual artist payout ledger |
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
| Conversion | Subscribe CTA variant experiment | In rollout | Flag-gated | `experiment_subscribe_cta_variant` | Variant defaults to `inline` |
| Conversion | Public profile PAC variant slots | In rollout | Flag-gated | `profile_pac_variant_slots` | Five-slot Statsig experiment: S1 copy arm, S1 trigger threshold, S2 monetization slot, cold-visitor tab bar, capture dismiss affordance |
| Creator recording | Teleprompter recording proposals + showcase interstitial | In rollout | Flag-gated | `teleprompter_recording` + `experiment_teleprompter_showcase` | A/B measures interstitial lift into recorder use |
| Mobile UX | iOS Apple Music destination prioritization | Shipped (internal v1 default-on) | Free+ | Former key: `feature_ios_apple_music_priority` | Listen interface optimization |
| Marketing Site | Modular homepage sections | Shipped (internal v1 default-on) | Internal v1 default-on flags | `homepage_*` flags | Static flags default visible |

## Homepage Section Flags (`flags/next`)

The marketing homepage uses static-safe section flags to support iteration without runtime coupling to user entitlements.

| Flag key | Default |
|---|---|
| `homepage_hero` | `true` |
| `homepage_label_logos` | `true` |
| `homepage_how_it_works` | `true` |
| `homepage_product_preview` | `true` |
| `homepage_example_profiles` | `true` |
| `homepage_deeplinks_grid` | `true` |
| `homepage_problem` | `true` |
| `homepage_comparison` | `true` |
| `homepage_what_you_get` | `true` |
| `homepage_see_it_in_action` | `true` |
| `homepage_final_cta` | `true` |
| `homepage_dashboard_showcase` | `true` |
| `homepage_automatic_release_smartlinks` | `true` |

## Change Management

When shipping or updating any feature:

1. Update product behavior in code.
2. Change flag defaults only when the feature should stop being internal-v1 default-on.
3. Sync this registry and `docs/STATSIG_FEATURE_GATES.md` in the same PR.
4. Add rich feature description to `docs/PRODUCT_CAPABILITIES.md`.
5. Refresh the relevant `apps/docs/` page (user-facing docs at docs.jov.ie).
6. Include tests for default-on behavior and any explicit kill switch behavior where applicable.
