import 'server-only';
import { dedupe } from 'flags/next';
import { cookies } from 'next/headers';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import {
  APP_FLAG_DEFAULTS,
  APP_FLAG_OVERRIDE_KEYS,
  type AppFlagName,
  LEGACY_STATSIG_GATE_KEYS,
  type PartialAppFlagSnapshot,
  type ProfileAlertOptInVariant,
  type StatsigFeatureFlagsBootstrap,
  type SubscribeCTAVariant,
  type TeleprompterShowcaseVariant,
} from './contracts';
import {
  APP_FLAG_OVERRIDES_COOKIE,
  getAppFlagOverrideValue,
  parseAppFlagOverrides,
} from './overrides';
import { getFlagOverrideMap } from './overrides-store.server';
import type { ProfilePacAssignment } from './profile-pac';
import {
  APP_FLAG_REGISTRY,
  PROFILE_ALERT_OPTIN_VARIANT_FLAG,
  PROFILE_PAC_VARIANT_SLOTS_FLAG,
  SUBSCRIBE_CTA_VARIANT_FLAG,
  TELEPROMPTER_SHOWCASE_VARIANT_FLAG,
} from './registry';

const ADMIN_DEFAULT_TRUE_FLAGS = new Set<AppFlagName>(
  (Object.keys(APP_FLAG_DEFAULTS) as AppFlagName[]).filter(
    flagName =>
      flagName !== 'RELEASE_PLAN_DEMO' &&
      flagName !== 'RELEASE_TO_REVENUE_AUTOPILOT'
  )
);

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_ENV === 'production'
  );
}

/**
 * Personal (per-browser) cookie overrides from the dev bar are honored
 * everywhere EXCEPT production — there they only apply for admins, so an
 * admin can preview a flag in prod without changing it for any other user.
 */
async function shouldHonorPersonalOverrides(
  userId: string | null
): Promise<boolean> {
  if (!isProductionRuntime()) {
    return true;
  }
  return userId ? await checkAdminRole(userId) : false;
}

const getRequestFlagOverrides = dedupe(async () => {
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
  if (await shouldHonorPersonalOverrides(options?.userId ?? null)) {
    const overrides = await getRequestFlagOverrides();
    const overrideValue = getAppFlagOverrideValue(flagName, overrides);
    if (overrideValue !== undefined) {
      return overrideValue;
    }
  }

  if (options?.userId && ADMIN_DEFAULT_TRUE_FLAGS.has(flagName)) {
    if (await checkAdminRole(options.userId)) {
      return true;
    }
  }

  // Per-environment override (admin Features page / dev bar "publish to env").
  // Cached via `unstable_cache` + `revalidateTag`, so this is read-free on the
  // hot path. Wrapped defensively: the override layer must never break flag
  // resolution. An unset cell falls through to the registry/Statsig default.
  try {
    const envOverrides = await getFlagOverrideMap();
    const envOverride = envOverrides[flagName];
    if (envOverride !== undefined) {
      return envOverride;
    }
  } catch {
    // Ignore — fall through to the registry default.
  }

  return APP_FLAG_REGISTRY[flagName].run({
    identify: {
      userId: options?.userId ?? null,
    },
  });
}

export async function getAppFlagsSnapshot(options?: {
  readonly userId?: string | null;
  readonly flagNames?: readonly AppFlagName[];
}): Promise<PartialAppFlagSnapshot> {
  const userId = options?.userId ?? null;
  const flagNames =
    options?.flagNames ?? (Object.keys(APP_FLAG_REGISTRY) as AppFlagName[]);

  const resolvedEntries = await Promise.all(
    flagNames.map(async flagName => [
      flagName,
      await getAppFlagValue(flagName, { userId }),
    ])
  );

  return Object.fromEntries(resolvedEntries) as PartialAppFlagSnapshot;
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

export async function getProfilePacAssignment(
  stableId: string | null
): Promise<ProfilePacAssignment> {
  return PROFILE_PAC_VARIANT_SLOTS_FLAG.run({
    identify: {
      userId: stableId,
    },
  });
}

export async function getTeleprompterShowcaseVariant(
  userId: string | null
): Promise<TeleprompterShowcaseVariant> {
  return TELEPROMPTER_SHOWCASE_VARIANT_FLAG.run({
    identify: {
      userId,
    },
  });
}

export {
  checkGateForUser,
  checkGatesForUser,
  getExperiment,
  shutdownStatsig,
} from './statsig';
