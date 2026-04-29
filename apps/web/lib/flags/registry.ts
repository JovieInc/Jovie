import 'server-only';
import { type Flag, flag, getProviderData } from 'flags/next';
import {
  APP_FLAG_DEFAULTS,
  APP_FLAG_DESCRIPTIONS,
  APP_FLAG_KEYS,
  APP_FLAG_TO_STATSIG_GATE,
  type AppFlagName,
  type SubscribeCTAVariant,
} from './contracts';
import { getStatsigGateValue, getSubscribeCTAVariantValue } from './statsig';

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
  ENABLE_LIGHT_MODE: buildBooleanFlag('ENABLE_LIGHT_MODE'),
  THREADS_ENABLED: buildBooleanFlag('THREADS_ENABLED'),
  PWA_INSTALL_BANNER: buildBooleanFlag('PWA_INSTALL_BANNER'),
  SHOW_RELEASE_TOOLBAR_EXTRAS: buildBooleanFlag('SHOW_RELEASE_TOOLBAR_EXTRAS'),
  PLAYLIST_ENGINE: buildBooleanFlag('PLAYLIST_ENGINE'),
  ALBUM_ART_GENERATION: buildBooleanFlag('ALBUM_ART_GENERATION'),
  CHAT_JANK_MONITOR: buildBooleanFlag('CHAT_JANK_MONITOR'),
  RELEASE_PLAN_DEMO: buildBooleanFlag('RELEASE_PLAN_DEMO'),
  DESIGN_V1: buildBooleanFlag('DESIGN_V1'),
  SHELL_CHAT_V1: buildBooleanFlag('SHELL_CHAT_V1'),
  DESIGN_V1_RELEASES: buildBooleanFlag('DESIGN_V1_RELEASES'),
  DESIGN_V1_TASKS: buildBooleanFlag('DESIGN_V1_TASKS'),
  DESIGN_V1_CHAT_ENTITIES: buildBooleanFlag('DESIGN_V1_CHAT_ENTITIES'),
  DESIGN_V1_LYRICS: buildBooleanFlag('DESIGN_V1_LYRICS'),
  DESIGN_V1_LIBRARY: buildBooleanFlag('DESIGN_V1_LIBRARY'),
  DESIGN_V1_AUTH: buildBooleanFlag('DESIGN_V1_AUTH'),
  DESIGN_V1_ONBOARDING: buildBooleanFlag('DESIGN_V1_ONBOARDING'),
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

export const APP_FLAG_PROVIDER_DATA = getProviderData(APP_FLAG_REGISTRY);
