# Statsig Feature Gates

This document is the canonical reference for Statsig-backed gates used by the web app.

## Scope

- Source of truth for gate keys: `apps/web/lib/flags/contracts.ts` (`LEGACY_STATSIG_GATE_KEYS`)
- Server-side evaluation: `apps/web/lib/flags/server.ts`
- Client consumption: `apps/web/lib/flags/client.tsx`

## Gate Inventory

| Gate key | Constant | Default behavior when Statsig is unavailable | Primary surface | Status |
|---|---|---|---|---|
| `billing.upgradeDirect` | `LEGACY_STATSIG_GATE_KEYS.BILLING_UPGRADE_DIRECT` | `false` | Direct checkout from upgrade button (skip pricing page) | Active |
| `smartlink_pre_save_campaigns` | `LEGACY_STATSIG_GATE_KEYS.SMARTLINK_PRE_SAVE` | `false` | Spotify pre-save API and campaign flow | Active |
| `feature_ios_apple_music_priority` | `LEGACY_STATSIG_GATE_KEYS.IOS_APPLE_MUSIC_PRIORITY` | `false` | iOS Apple Music prioritization | Active |
| `experiment_subscribe_cta_variant` | `LEGACY_STATSIG_GATE_KEYS.SUBSCRIBE_CTA_EXPERIMENT` | `'two_step'` variant fallback | Subscription CTA experiment | Active |
| `feature_spotify_oauth` | `LEGACY_STATSIG_GATE_KEYS.SPOTIFY_OAUTH` | `false` | Auth and onboarding login method selector | Active |
| `stripe-connect-enabled` | `LEGACY_STATSIG_GATE_KEYS.STRIPE_CONNECT_ENABLED` | `false` | Stripe Connect payouts (settings + payment routes) | Active |
| `enable_light_mode` | `LEGACY_STATSIG_GATE_KEYS.ENABLE_LIGHT_MODE` | `false` | Light mode theme toggle (footer) | Active |
| `feature_shell_chat_v1` | `LEGACY_STATSIG_GATE_KEYS.SHELL_CHAT_V1` | `false` | Shell + chat V1 production design rollout | Active |
| `design_v1_releases` | `LEGACY_STATSIG_GATE_KEYS.DESIGN_V1_RELEASES` | `false` | Releases Design V1 rollout | Active |
| `design_v1_tasks` | `LEGACY_STATSIG_GATE_KEYS.DESIGN_V1_TASKS` | `false` | Tasks Design V1 rollout | Active |
| `design_v1_chat_entities` | `LEGACY_STATSIG_GATE_KEYS.DESIGN_V1_CHAT_ENTITIES` | `false` | Chat entity panel Design V1 rollout | Active |
| `design_v1_lyrics` | `LEGACY_STATSIG_GATE_KEYS.DESIGN_V1_LYRICS` | `false` | Lyrics Design V1 rollout | Active |
| `design_v1_library` | `LEGACY_STATSIG_GATE_KEYS.DESIGN_V1_LIBRARY` | `false` | Read-only library Design V1 rollout | Active |
| `design_v1_auth` | `LEGACY_STATSIG_GATE_KEYS.DESIGN_V1_AUTH` | `false` | Auth visual Design V1 rollout | Active |
| `design_v1_onboarding` | `LEGACY_STATSIG_GATE_KEYS.DESIGN_V1_ONBOARDING` | `false` | Onboarding visual Design V1 rollout | Active |

## Operational Notes

- Gates are evaluated server-side with Statsig and then passed to client components via bootstrap payloads.
- If `NEXT_PUBLIC_STATSIG_CLIENT_KEY` or `STATSIG_SERVER_SECRET_KEY` is not configured, the app degrades gracefully to safe defaults.
- Security-sensitive authorization must still rely on server-side entitlement checks; gates are rollout controls, not permission boundaries.
- The Design V1 rollout contract, valid flag combinations, and rollback paths live in `docs/DESIGN_V1_ROLLOUT_MATRIX.md`.

## Maintenance Checklist

When adding or changing a gate:

1. Add/update the key in `apps/web/lib/flags/contracts.ts` (`LEGACY_STATSIG_GATE_KEYS`, `APP_FLAG_DEFAULTS`, `APP_FLAG_KEYS`, `APP_FLAG_OVERRIDE_KEYS`, `APP_FLAG_TO_STATSIG_GATE`, `APP_FLAG_DESCRIPTIONS`) and `apps/web/lib/flags/registry.ts`.
2. Implement or update runtime callsites.
3. Add tests for gate-on and gate-off behavior.
4. Update this document and `docs/FEATURE_REGISTRY.md`.

When ramping a gate to 100% and removing it:

1. Remove from all six layers in `contracts.ts` plus `registry.ts`.
2. Replace consumer call sites (`useAppFlag(...)`, `checkGateForUser(...)`) with the resolved value.
3. Delete the off-branch code path.
4. Remove the row from this document.
