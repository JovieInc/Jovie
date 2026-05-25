import 'server-only';
import { dedupe } from 'flags/next';
import { cookies } from 'next/headers';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import {
  APP_FLAG_DEFAULTS,
  APP_FLAG_OVERRIDE_KEYS,
  type AppFlagName,
  type AppFlagSnapshot,
  LEGACY_STATSIG_GATE_KEYS,
  type ProfileAlertOptInVariant,
  type StatsigFeatureFlagsBootstrap,
  type SubscribeCTAVariant,
} from './contracts';
import {
  APP_FLAG_OVERRIDES_COOKIE,
  getAppFlagOverrideValue,
  parseAppFlagOverrides,
} from './overrides';
import {
  APP_FLAG_REGISTRY,
  PROFILE_ALERT_OPTIN_VARIANT_FLAG,
  SUBSCRIBE_CTA_VARIANT_FLAG,
} from './registry';

const ADMIN_DEFAULT_TRUE_FLAGS = new Set<AppFlagName>(
  (Object.keys(APP_FLAG_DEFAULTS) as AppFlagName[]).filter(
    flagName => flagName !== 'RELEASE_PLAN_DEMO'
  )
);

function shouldHonorClientFlagOverrides(): boolean {
  return !(
    process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_ENV === 'production'
  );
}

const getRequestFlagOverrides = dedupe(async () => {
  if (!shouldHonorClientFlagOverrides()) {
    return {};
  }

  const cookieStore = await cookies();
  const rawOverrides = cookieStore.get(APP_FLAG_OVERRIDES_COOKIE)?.value;
  return parseAppFlagOverrides(
    rawOverrides ? decodeURIComponent(rawOverrides) : undefined
  );
});

export async function getAppFlagValue(
  flagName: AppFlagName,
  options?: {
    readonly userId?: string | null;
  }
): Promise<boolean> {
  const overrides = await getRequestFlagOverrides();
  const overrideValue = getAppFlagOverrideValue(flagName, overrides);
  if (overrideValue !== undefined) {
    return overrideValue;
  }

  if (options?.userId && ADMIN_DEFAULT_TRUE_FLAGS.has(flagName)) {
    if (await checkAdminRole(options.userId)) {
      return true;
    }
  }

  return APP_FLAG_REGISTRY[flagName].run({
    identify: {
      userId: options?.userId ?? null,
    },
  });
}

export async function getAppFlagsSnapshot(options?: {
  readonly userId?: string | null;
}): Promise<AppFlagSnapshot> {
  const userId = options?.userId ?? null;

  const resolvedEntries = await Promise.all(
    (Object.keys(APP_FLAG_REGISTRY) as AppFlagName[]).map(async flagName => [
      flagName,
      await getAppFlagValue(flagName, { userId }),
    ])
  );

  return Object.fromEntries(resolvedEntries) as AppFlagSnapshot;
}

export async function getFeatureFlagsBootstrap(
  userId: string | null
): Promise<StatsigFeatureFlagsBootstrap> {
  const gates: Record<string, boolean> = {};

  await Promise.all(
    Object.entries(LEGACY_STATSIG_GATE_KEYS).map(
      async ([flagName, gateKey]) => {
        if (!(flagName in APP_FLAG_OVERRIDE_KEYS)) {
          return;
        }

        const value = await getAppFlagValue(flagName as AppFlagName, {
          userId,
        });
        gates[gateKey] = value;
      }
    )
  );

  return { gates };
}

export async function getSubscribeCTAVariant(
  userId: string | null
): Promise<SubscribeCTAVariant> {
  return SUBSCRIBE_CTA_VARIANT_FLAG.run({
    identify: {
      userId,
    },
  });
}

export async function getProfileAlertOptInVariant(
  stableId: string | null
): Promise<ProfileAlertOptInVariant> {
  return PROFILE_ALERT_OPTIN_VARIANT_FLAG.run({
    identify: {
      userId: stableId,
    },
  });
}

export { checkGateForUser, getExperiment, shutdownStatsig } from './statsig';
