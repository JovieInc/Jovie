import 'server-only';
import { Statsig, StatsigUser } from '@statsig/statsig-node-core';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';
import { withTimeout } from '@/lib/resilience/primitives';
import { logger } from '@/lib/utils/logger';
import {
  APP_FLAG_DEFAULTS,
  LEGACY_STATSIG_GATE_KEYS,
  type ProfileAlertOptInVariant,
  type StatsigBackedAppFlagName,
  type SubscribeCTAVariant,
  type TeleprompterShowcaseVariant,
} from './contracts';
import {
  DEFAULT_PROFILE_PAC_ASSIGNMENT,
  type ProfilePacAssignment,
  parseProfilePacAssignment,
} from './profile-pac';

let statsigInitialized = false;
let statsigClient: Statsig | null = null;
let statsigInitPromise: Promise<void> | null = null;
let statsigWarnedNoSecret = false;

const isE2ERuntime = publicEnv.NEXT_PUBLIC_E2E_MODE === '1';
const STATSIG_INIT_TIMEOUT_MS = 10_000;
const STATSIG_SHUTDOWN_TIMEOUT_MS = 1500;
const GATE_CACHE_TTL_MS = 10_000;
const gateCache = new Map<string, { value: boolean; expiresAt: number }>();

function gateCacheKey(userId: string | null, gateKey: string): string {
  return `${userId ?? 'anonymous'}:${gateKey}`;
}

function readCachedGateValue(
  userId: string | null,
  gateKey: string
): boolean | undefined {
  const cached = gateCache.get(gateCacheKey(userId, gateKey));
  if (!cached || cached.expiresAt <= Date.now()) {
    if (cached) {
      gateCache.delete(gateCacheKey(userId, gateKey));
    }
    return undefined;
  }

  return cached.value;
}

function writeCachedGateValue(
  userId: string | null,
  gateKey: string,
  value: boolean
): void {
  gateCache.set(gateCacheKey(userId, gateKey), {
    value,
    expiresAt: Date.now() + GATE_CACHE_TTL_MS,
  });
}

function getStatsigUser(userId: string | null): StatsigUser {
  return StatsigUser.withUserID(userId ?? 'anonymous');
}

function getStatsigClient(serverSecret: string): Statsig {
  if (statsigClient) {
    return statsigClient;
  }

  statsigClient = new Statsig(serverSecret, {
    environment: env.VERCEL_ENV || env.NODE_ENV || 'development',
  });
  return statsigClient;
}

async function cleanupStatsigClientAfterInitFailure(
  statsig: Statsig | null
): Promise<void> {
  if (!statsig) return;

  try {
    await withTimeout(statsig.shutdown(), {
      timeoutMs: STATSIG_SHUTDOWN_TIMEOUT_MS,
      context: 'Statsig shutdown after failed initialization',
    });
  } catch (shutdownError) {
    logger.warn(
      '[Statsig] Failed to clean up server SDK after init failure',
      shutdownError,
      'Statsig'
    );
  }
}

async function initializeStatsig(): Promise<void> {
  if (statsigInitialized || isE2ERuntime) return;
  if (statsigInitPromise) {
    await statsigInitPromise;
    return;
  }

  statsigInitPromise = (async () => {
    const serverSecret = env.STATSIG_SERVER_SECRET;
    if (!serverSecret) {
      if (!statsigWarnedNoSecret) {
        logger.warn(
          '[Statsig] Server secret not configured - feature flags will use defaults'
        );
        statsigWarnedNoSecret = true;
      }
      return;
    }

    let statsig: Statsig | null = null;
    try {
      statsig = getStatsigClient(serverSecret);
      await withTimeout(statsig.initialize(), {
        timeoutMs: STATSIG_INIT_TIMEOUT_MS,
        context: 'Statsig initialization',
      });
      statsigInitialized = true;
      logger.info('[Statsig] Server SDK initialized', undefined, 'Statsig');
    } catch (error) {
      const failedStatsig = statsig ?? statsigClient;
      statsigInitialized = false;
      statsigClient = null;
      await cleanupStatsigClientAfterInitFailure(failedStatsig);
      logger.error(
        '[Statsig] Failed to initialize server SDK',
        error,
        'Statsig'
      );
    }
  })();

  try {
    await statsigInitPromise;
  } finally {
    statsigInitPromise = null;
  }
}

export async function checkGateForUser(
  userId: string | null,
  gateKey: string,
  defaultValue = false
): Promise<boolean> {
  if (isE2ERuntime) {
    return defaultValue;
  }

  const cachedValue = readCachedGateValue(userId, gateKey);
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  await initializeStatsig();

  if (!statsigInitialized) {
    return defaultValue;
  }

  try {
    const statsig = statsigClient;
    if (!statsig) {
      return defaultValue;
    }

    const gate = statsig.getFeatureGate(getStatsigUser(userId), gateKey);
    const value =
      gate.getEvaluationDetails().reason === 'Unrecognized'
        ? defaultValue
        : gate.value;
    writeCachedGateValue(userId, gateKey, value);
    return value;
  } catch (error) {
    logger.error(`[Statsig] Error checking gate ${gateKey}`, error, 'Statsig');
    return defaultValue;
  }
}

export async function checkGatesForUser(
  userId: string | null,
  gates: ReadonlyArray<{ key: string; defaultValue?: boolean }>
): Promise<boolean[]> {
  return Promise.all(
    gates.map(({ key, defaultValue = false }) =>
      checkGateForUser(userId, key, defaultValue)
    )
  );
}

export async function getStatsigGateValue(
  flagName: StatsigBackedAppFlagName,
  _userId: string | null
): Promise<boolean> {
  return APP_FLAG_DEFAULTS[flagName];
}

export async function getExperiment(
  userId: string | null,
  experimentKey: string
): Promise<Record<string, unknown>> {
  if (isE2ERuntime) {
    return {};
  }

  await initializeStatsig();
  if (!statsigInitialized) return {};

  try {
    const statsig = statsigClient;
    if (!statsig) {
      return {};
    }

    const experiment = statsig.getExperiment(
      getStatsigUser(userId),
      experimentKey
    );
    return experiment.value;
  } catch (error) {
    logger.error(
      `[Statsig] Error getting experiment ${experimentKey}`,
      error,
      'Statsig'
    );
    return {};
  }
}

export async function getProfileAlertOptInVariantValue(
  stableId: string | null
): Promise<ProfileAlertOptInVariant> {
  const config = await getExperiment(
    stableId,
    LEGACY_STATSIG_GATE_KEYS.PROFILE_ALERT_OPTIN_EXPERIMENT
  );
  const variant = config.variant;
  if (variant === 'button' || variant === 'toggle') {
    return variant;
  }
  return 'button';
}

export async function getProfilePacAssignmentValue(
  stableId: string | null
): Promise<ProfilePacAssignment> {
  const config = await getExperiment(
    stableId,
    LEGACY_STATSIG_GATE_KEYS.PROFILE_PAC_VARIANT_SLOTS_EXPERIMENT
  );
  if (Object.keys(config).length === 0) {
    return DEFAULT_PROFILE_PAC_ASSIGNMENT;
  }
  return parseProfilePacAssignment(config);
}

export async function getSubscribeCTAVariantValue(
  userId: string | null
): Promise<SubscribeCTAVariant> {
  const config = await getExperiment(
    userId,
    LEGACY_STATSIG_GATE_KEYS.SUBSCRIBE_CTA_EXPERIMENT
  );
  const variant = config.variant;
  if (variant === 'inline' || variant === 'two_step') {
    return variant;
  }
  return 'two_step';
}

export async function getTeleprompterShowcaseVariantValue(
  userId: string | null
): Promise<TeleprompterShowcaseVariant> {
  const config = await getExperiment(
    userId,
    LEGACY_STATSIG_GATE_KEYS.TELEPROMPTER_SHOWCASE_EXPERIMENT
  );
  const variant = config.variant;
  if (variant === 'interstitial' || variant === 'direct') {
    return variant;
  }
  return 'direct';
}

export async function shutdownStatsig(): Promise<void> {
  try {
    const statsig = statsigClient;
    if (statsigInitialized && statsig) {
      await withTimeout(statsig.shutdown(), {
        timeoutMs: STATSIG_SHUTDOWN_TIMEOUT_MS,
        context: 'Statsig shutdown',
      });
    }
  } finally {
    statsigInitialized = false;
    statsigClient = null;
    statsigInitPromise = null;
  }
}
