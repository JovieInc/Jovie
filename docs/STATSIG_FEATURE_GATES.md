# Statsig Feature Gates

This document is the canonical reference for Statsig-backed gates used by the web app.

## Scope

- Source of truth for flag names, keys, defaults, and descriptions: `apps/web/lib/flags/contracts.ts`
- Flag registry and Statsig bindings: `apps/web/lib/flags/registry.ts`
- Server-side evaluation and bootstrap: `apps/web/lib/flags/server.ts`
- Client consumption and local overrides: `apps/web/lib/flags/client.tsx`

## Gate Inventory

| Gate key | Constant | Default behavior when Statsig is unavailable | Primary surface | Status |
|---|---|---|---|---|
| `feature_profile_v2` | `APP_FLAG_KEYS.PROFILE_V2` | `true` | Public profile layout | Active |
| `billing.upgradeDirect` | `APP_FLAG_KEYS.BILLING_UPGRADE_DIRECT` | `false` | Billing upgrade flow routing | Active |
| `feature_latest_release_card` | `APP_FLAG_KEYS.LATEST_RELEASE_CARD` | `true` | Public profile latest release card | Active |
| `smartlink_pre_save_campaigns` | `APP_FLAG_KEYS.SMARTLINK_PRE_SAVE` | `false` | Spotify pre-save API and campaign flow | Active |
| `feature_ios_apple_music_priority` | `APP_FLAG_KEYS.IOS_APPLE_MUSIC_PRIORITY` | `false` | iOS Apple Music prioritization | Active |
| `feature_spotify_oauth` | `APP_FLAG_KEYS.SPOTIFY_OAUTH` | `false` | Auth and onboarding login method selector | Active |
| `stripe-connect-enabled` | `APP_FLAG_KEYS.STRIPE_CONNECT_ENABLED` | `false` | Creator payouts | Active |
| `enable_light_mode` | `APP_FLAG_KEYS.ENABLE_LIGHT_MODE` | `false` | Theme picker | Active |
| `show_audience_crm_section` | `APP_FLAG_KEYS.SHOW_AUDIENCE_CRM_SECTION` | `false` | Audience dashboard CRM section | Active |
| `experiment_subscribe_cta_variant` | `SUBSCRIBE_CTA_VARIANT_FLAG` | `'two_step'` | Subscription CTA experiment | Active |

## Operational Notes

- Gates are evaluated server-side with Statsig and then passed to client components via bootstrap payloads.
- If `NEXT_PUBLIC_STATSIG_CLIENT_KEY` or `STATSIG_SERVER_SECRET_KEY` is not configured, the app degrades gracefully to safe defaults.
- Security-sensitive authorization must still rely on server-side entitlement checks; gates are rollout controls, not permission boundaries.
- Local-only flags such as `THREADS_ENABLED`, `PWA_INSTALL_BANNER`, `SHOW_RELEASE_TOOLBAR_EXTRAS`, `PLAYLIST_ENGINE`, and `ALBUM_ART_GENERATION` live in the same `lib/flags/*` contract but are not Statsig-backed.

## Maintenance Checklist

When adding or changing a gate:

1. Add or update the flag in `apps/web/lib/flags/contracts.ts`.
2. Implement or update runtime callsites.
3. Add tests for gate-on and gate-off behavior.
4. Update this document and `docs/FEATURE_REGISTRY.md`.
