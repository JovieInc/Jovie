# Statsig Feature Gates

This document is the canonical reference for Statsig-backed gates and
experiments used by the web app.

## Scope

- Source of truth for runtime app flags:
  `apps/web/lib/flags/contracts.ts` (`APP_FLAG_TO_STATSIG_GATE`)
- Server-side evaluation: `apps/web/lib/flags/server.ts`
- Client consumption: `apps/web/lib/flags/client.tsx`
- Local route kill switches: `apps/web/app/api/chat/route.ts`
  (`CHAT_KILL_SWITCH_GATES`)

## Gate Inventory

| Gate key | Constant | Default behavior when Statsig is unavailable | Primary surface | Status |
|---|---|---|---|---|
| `billing.upgradeDirect` | `LEGACY_STATSIG_GATE_KEYS.BILLING_UPGRADE_DIRECT` | `false` | Direct checkout from upgrade button (skip pricing page) | Active |
| `smartlink_pre_save_campaigns` | `LEGACY_STATSIG_GATE_KEYS.SMARTLINK_PRE_SAVE` | `false` | Spotify pre-save API and campaign flow | Active |
| `feature_ios_apple_music_priority` | `LEGACY_STATSIG_GATE_KEYS.IOS_APPLE_MUSIC_PRIORITY` | `false` | iOS Apple Music prioritization | Active |
| `feature_spotify_oauth` | `LEGACY_STATSIG_GATE_KEYS.SPOTIFY_OAUTH` | `false` | Auth and onboarding login method selector | Active |
| `stripe-connect-enabled` | `LEGACY_STATSIG_GATE_KEYS.STRIPE_CONNECT_ENABLED` | `false` | Stripe Connect payouts (settings + payment routes) | Active |
| `chat_jank_monitor` | `LEGACY_STATSIG_GATE_KEYS.CHAT_JANK_MONITOR` | `false` | Chat jank instrumentation (message continuity + streaming) | Active |
| `ai_connectors_beta` | `LEGACY_STATSIG_GATE_KEYS.AI_CONNECTORS_BETA` | `false` | AI Connector v1 closed beta — Gmail booking email → Google Calendar event flow | Active |
| `ios_app_alpha_access` | `LEGACY_STATSIG_GATE_KEYS.IOS_APP_ALPHA_ACCESS` | `false` | Internal iOS TestFlight install access | Active |
| `ai_chat_disabled` | `CHAT_KILL_SWITCH_GATES.DISABLED` | `false` | Emergency kill switch for `/api/chat` | Active |
| `ai_chat_force_light` | `CHAT_KILL_SWITCH_GATES.FORCE_LIGHT` | `false` | Runtime switch to route `/api/chat` to the lighter model | Active |

## Experiment Inventory

| Experiment key | Constant | Default behavior when Statsig is unavailable | Primary surface | Status |
|---|---|---|---|---|
| `experiment_subscribe_cta_variant` | `LEGACY_STATSIG_GATE_KEYS.SUBSCRIBE_CTA_EXPERIMENT` | `'two_step'` | Subscription CTA experiment | Setup |
| `profile_alert_optin_cta_variant` | `LEGACY_STATSIG_GATE_KEYS.PROFILE_ALERT_OPTIN_EXPERIMENT` | `'button'` | Public profile alert opt-in CTA variant | Setup |

## Operational Notes

- Gates and experiments are evaluated server-side with Statsig and then passed
  to client components via bootstrap payloads. The app does not load a Statsig
  browser SDK.
- If `STATSIG_SERVER_SECRET` is not configured, the app degrades gracefully to
  safe defaults.
- `DESIGN_V1` and its aliases (`SHELL_CHAT_V1`, `DESIGN_V1_RELEASES`,
  `DESIGN_V1_TASKS`, `DESIGN_V1_CHAT_ENTITIES`, `DESIGN_V1_LYRICS`,
  `DESIGN_V1_LIBRARY`, `DESIGN_V1_AUTH`, and `DESIGN_V1_ONBOARDING`) are
  permanent local-default app flags, not Statsig-backed rollout gates. The
  legacy `design_v1` and per-surface key constants remain compatibility names
  only; changing those keys in Statsig does not affect the current runtime.
- Security-sensitive authorization must still rely on server-side entitlement checks; gates are rollout controls, not permission boundaries.
- The Design V1 rollout contract, valid flag combinations, and rollback paths live in `docs/DESIGN_V1_ROLLOUT_MATRIX.md`.

## Maintenance Checklist

When adding or changing a gate:

1. Add/update the key in `apps/web/lib/flags/contracts.ts` (`LEGACY_STATSIG_GATE_KEYS`, `APP_FLAG_DEFAULTS`, `APP_FLAG_KEYS`, `APP_FLAG_OVERRIDE_KEYS`, `APP_FLAG_TO_STATSIG_GATE`, `APP_FLAG_DESCRIPTIONS`) and `apps/web/lib/flags/registry.ts`.
2. Implement or update runtime callsites.
3. Add tests for gate-on and gate-off behavior.
4. Update this document and `docs/FEATURE_REGISTRY.md`.
5. Create or update the Statsig Console gate with a safe default-off rule
   unless the rollout plan explicitly says otherwise.

When ramping a gate to 100% and removing it:

1. Remove from all six layers in `contracts.ts` plus `registry.ts`.
2. Replace consumer call sites (`useAppFlag(...)`, `checkGateForUser(...)`) with the resolved value.
3. Delete the off-branch code path.
4. Remove the row from this document.
