import 'server-only';
import { type Flag, flag, getProviderData } from 'flags/next';
import {
  APP_FLAG_DEFAULTS,
  APP_FLAG_DESCRIPTIONS,
  APP_FLAG_KEYS,
  type AppFlagName,
  type ProfileAlertOptInVariant,
  type SubscribeCTAVariant,
  type TeleprompterShowcaseVariant,
} from './contracts';
import {
  DEFAULT_PROFILE_PAC_ASSIGNMENT,
  type ProfilePacAssignment,
} from './profile-pac';
import {
  getProfileAlertOptInVariantValue,
  getProfilePacAssignmentValue,
  getSubscribeCTAVariantValue,
  getTeleprompterShowcaseVariantValue,
} from './statsig';

type FlagEntities = {
  userId: string | null;
};

function buildBooleanFlag(flagName: AppFlagName): Flag<boolean> {
  const defaultValue = APP_FLAG_DEFAULTS[flagName];

  return flag<boolean>({
    key: APP_FLAG_KEYS[flagName],
    defaultValue,
    description: APP_FLAG_DESCRIPTIONS[flagName],
    options: [
      { label: 'Off', value: false },
      { label: 'On', value: true },
    ],
    async decide() {
      return defaultValue;
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
  APPLE_WALLET_PROFILE_PASS: buildBooleanFlag('APPLE_WALLET_PROFILE_PASS'),
  RELEASE_PLAN_DEMO: buildBooleanFlag('RELEASE_PLAN_DEMO'),
  RELEASE_TO_REVENUE_AUTOPILOT: buildBooleanFlag(
    'RELEASE_TO_REVENUE_AUTOPILOT'
  ),
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
  BULK_PRESS_PHOTO_IMPORT: buildBooleanFlag('BULK_PRESS_PHOTO_IMPORT'),
  TELEPROMPTER_RECORDING: buildBooleanFlag('TELEPROMPTER_RECORDING'),
  INBOX_HOME: buildBooleanFlag('INBOX_HOME'),
} as const satisfies Record<AppFlagName, Flag<boolean>>;

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

export const PROFILE_PAC_VARIANT_SLOTS_FLAG = flag<
  ProfilePacAssignment,
  FlagEntities
>({
  key: 'profile_pac_variant_slots',
  defaultValue: {
    ...DEFAULT_PROFILE_PAC_ASSIGNMENT,
  },
  description:
    'Public profile Primary Action Card variant slots: S1 copy/trigger, S2 monetization, cold-visitor tab bar, capture dismiss affordance',
  options: [{ label: 'Default', value: DEFAULT_PROFILE_PAC_ASSIGNMENT }],
  async decide({ entities }) {
    return getProfilePacAssignmentValue(entities?.userId ?? null);
  },
});

export const TELEPROMPTER_SHOWCASE_VARIANT_FLAG = flag<
  TeleprompterShowcaseVariant,
  FlagEntities
>({
  key: 'experiment_teleprompter_showcase',
  defaultValue: 'direct',
  description:
    'Teleprompter showcase interstitial A/B — direct recorder vs bento primer',
  options: ['interstitial', 'direct'],
  async decide({ entities }) {
    return getTeleprompterShowcaseVariantValue(entities?.userId ?? null);
  },
});

export const APP_FLAG_PROVIDER_DATA = getProviderData(APP_FLAG_REGISTRY);
