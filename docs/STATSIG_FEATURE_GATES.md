# Statsig Feature Gates

This document is the canonical reference for Statsig-backed gates used by the web app.

## Scope

- Source of truth for gate keys: `apps/web/lib/feature-flags/shared.ts`
- Server-side evaluation: `apps/web/lib/feature-flags/server.ts`
- Client consumption: `apps/web/lib/feature-flags/client.tsx`

## Gate Inventory

| Gate key | Constant | Default behavior when Statsig is unavailable | Primary surface | Status |
|---|---|---|---|---|
| `feature_claim_handle` | `FEATURE_FLAG_KEYS.CLAIM_HANDLE` | `false` | Home/profile claiming UX | Defined (no active runtime callsite) |
| `feature_hero_spotify_claim_flow` | `FEATURE_FLAG_KEYS.HERO_SPOTIFY_CLAIM_FLOW` | `false` | Homepage hero claim journey | Defined (no active runtime callsite) |
| `billing.upgradeDirect` | `FEATURE_FLAG_KEYS.BILLING_UPGRADE_DIRECT` | `false` | Billing upgrade flow routing | Active |
| `feature_subscribe_two_step` | `FEATURE_FLAG_KEYS.SUBSCRIBE_TWO_STEP` | `false` | Subscribe conversion flow | Defined (no active runtime callsite) |
| `feature_latest_release_card` | `FEATURE_FLAG_KEYS.LATEST_RELEASE_CARD` | `false` | Public profile latest release card | Active |
| `smartlink_pre_save_campaigns` | `FEATURE_FLAG_KEYS.SMARTLINK_PRE_SAVE` | `false` | Spotify pre-save API and campaign flow | Active |
| `feature_ios_apple_music_priority` | `FEATURE_FLAG_KEYS.IOS_APPLE_MUSIC_PRIORITY` | `false` | iOS Apple Music prioritization | Active |
| `experiment_subscribe_cta_variant` | `FEATURE_FLAG_KEYS.SUBSCRIBE_CTA_EXPERIMENT` | `'inline'` variant fallback | Subscription CTA experiment | Active |
| `feature_spotify_oauth` | `FEATURE_FLAG_KEYS.SPOTIFY_OAUTH` | `false` | Auth and onboarding login method selector | Active |

## Operational Notes

- Gates are evaluated server-side with Statsig and then passed to client components via bootstrap payloads.
- If `NEXT_PUBLIC_STATSIG_CLIENT_KEY` or `STATSIG_SERVER_SECRET_KEY` is not configured, the app degrades gracefully to safe defaults.
- Security-sensitive authorization must still rely on server-side entitlement checks; gates are rollout controls, not permission boundaries.

## Maintenance Checklist

When adding or changing a gate:

1. Add/update the key in `apps/web/lib/feature-flags/shared.ts`.
2. Implement or update runtime callsites.
3. Add tests for gate-on and gate-off behavior.
4. Update this document and `docs/FEATURE_REGISTRY.md`.
