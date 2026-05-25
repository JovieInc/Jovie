import 'server-only';
import { type Flag, flag, getProviderData } from 'flags/next';
import {
  APP_FLAG_DEFAULTS,
  APP_FLAG_DESCRIPTIONS,
  APP_FLAG_KEYS,
  APP_FLAG_TO_STATSIG_GATE,
  type AppFlagName,
  type ProfileAlertOptInVariant,
  type SubscribeCTAVariant,
} from './contracts';
import {
  getProfileAlertOptInVariantValue,
  getStatsigGateValue,
  getSubscribeCTAVariantValue,
} from './statsig';

/**
 * RELEASE_PLAN_DEMO is the YC wedge demo page.
 * It is off by default in production but on in dev and preview so that
 * the demo recorder and QA passes can visit /app/dashboard/release-plan
 * without needing a localStorage override or Statsig gate.
 *
 * In production, the page stays hidden behind the default=false.
 * To enable it for a production demo session, set the localStorage override:
 *   localStorage.setItem('__ff_overrides', JSON.stringify({ 'code:RELEASE_PLAN_DEMO': true }))
 * or use the DevToolbar flag panel.
 */
const IS_VERCEL_PRODUCTION = process.env.VERCEL_ENV === 'production';

type FlagEntities = {
  userId: string | null;
};

function buildBooleanFlag(flagName: AppFlagName): Flag<boolean, FlagEntities> {
  const defaultValue = APP_FLAG_DEFAULTS[flagName];
  const gateKey =
    APP_FLAG_TO_STATSIG_GATE[flagName as keyof typeof APP_FLAG_TO_STATSIG_GATE];

  return flag<boolean, FlagEntities>({
    key: APP_FLAG_KEYS[flagName],
    defaultValue,
    description: APP_FLAG_DESCRIPTIONS[flagName],
    options: [
      { label: 'Off', value: false },
      { label: 'On', value: true },
    ],
    async decide({ entities }) {
      if (!gateKey) {
        return defaultValue;
      }

      return getStatsigGateValue(
        flagName as keyof typeof APP_FLAG_TO_STATSIG_GATE,
        entities?.userId ?? null
      );
    },
  });
}

export const APP_FLAG_REGISTRY = {
  BILLING_UPGRADE_DIRECT: buildBooleanFlag('BILLING_UPGRADE_DIRECT'),
  SMARTLINK_PRE_SAVE: buildBooleanFlag('SMARTLINK_PRE_SAVE'),
  IOS_APPLE_MUSIC_PRIORITY: buildBooleanFlag('IOS_APPLE_MUSIC_PRIORITY'),
  SPOTIFY_OAUTH: buildBooleanFlag('SPOTIFY_OAUTH'),
  STRIPE_CONNECT_ENABLED: buildBooleanFlag('STRIPE_CONNECT_ENABLED'),
  PLAYLIST_ENGINE: buildBooleanFlag('PLAYLIST_ENGINE'),
  ALBUM_ART_GENERATION: buildBooleanFlag('ALBUM_ART_GENERATION'),
  CHAT_JANK_MONITOR: buildBooleanFlag('CHAT_JANK_MONITOR'),
  IOS_APP_ALPHA_ACCESS: buildBooleanFlag('IOS_APP_ALPHA_ACCESS'),
  APPLE_WALLET_PROFILE_PASS: buildBooleanFlag('APPLE_WALLET_PROFILE_PASS'),
  // RELEASE_PLAN_DEMO is on by default in dev/preview so QA and the demo
  // recorder can visit /app/dashboard/release-plan without a manual override.
  // Production keeps it off (default=false) — enable via localStorage override
  // or DevToolbar for live demo sessions.
  RELEASE_PLAN_DEMO: flag<boolean, FlagEntities>({
    key: APP_FLAG_KEYS.RELEASE_PLAN_DEMO,
    defaultValue: APP_FLAG_DEFAULTS.RELEASE_PLAN_DEMO,
    description: APP_FLAG_DESCRIPTIONS.RELEASE_PLAN_DEMO,
    options: [
      { label: 'Off', value: false },
      { label: 'On', value: true },
    ],
    async decide() {
      return !IS_VERCEL_PRODUCTION;
    },
  }),
  DESIGN_V1: buildBooleanFlag('DESIGN_V1'),
  SHELL_CHAT_V1: buildBooleanFlag('SHELL_CHAT_V1'),
  DESIGN_V1_RELEASES: buildBooleanFlag('DESIGN_V1_RELEASES'),
  DESIGN_V1_TASKS: buildBooleanFlag('DESIGN_V1_TASKS'),
  DESIGN_V1_CHAT_ENTITIES: buildBooleanFlag('DESIGN_V1_CHAT_ENTITIES'),
  DESIGN_V1_LYRICS: buildBooleanFlag('DESIGN_V1_LYRICS'),
  DESIGN_V1_LIBRARY: buildBooleanFlag('DESIGN_V1_LIBRARY'),
  DESIGN_V1_AUTH: buildBooleanFlag('DESIGN_V1_AUTH'),
  DESIGN_V1_ONBOARDING: buildBooleanFlag('DESIGN_V1_ONBOARDING'),
  AI_CONNECTORS_BETA: buildBooleanFlag('AI_CONNECTORS_BETA'),
  MERCH_MVP: buildBooleanFlag('MERCH_MVP'),
} as const satisfies Record<AppFlagName, Flag<boolean, FlagEntities>>;

export const SUBSCRIBE_CTA_VARIANT_FLAG = flag<
  SubscribeCTAVariant,
  FlagEntities
>({
  key: 'experiment_subscribe_cta_variant',
  defaultValue: 'two_step',
  description: 'Subscribe CTA experiment variant',
  options: ['two_step', 'inline'],
  async decide({ entities }) {
    return getSubscribeCTAVariantValue(entities?.userId ?? null);
  },
});

export const PROFILE_ALERT_OPTIN_VARIANT_FLAG = flag<
  ProfileAlertOptInVariant,
  FlagEntities
>({
  key: 'profile_alert_optin_cta_variant',
  defaultValue: 'button',
  description: 'Public profile alert opt-in CTA variant',
  options: ['button', 'toggle'],
  async decide({ entities }) {
    return getProfileAlertOptInVariantValue(entities?.userId ?? null);
  },
});

export const APP_FLAG_PROVIDER_DATA = getProviderData(APP_FLAG_REGISTRY);
