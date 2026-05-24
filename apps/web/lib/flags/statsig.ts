import 'server-only';
import { Statsig, StatsigUser } from '@statsig/statsig-node-core';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';
import { withTimeout } from '@/lib/resilience/primitives';
import { logger } from '@/lib/utils/logger';
import {
  APP_FLAG_DEFAULTS,
  APP_FLAG_TO_STATSIG_GATE,
  LEGACY_STATSIG_GATE_KEYS,
  type ProfileAlertOptInVariant,
  type StatsigBackedAppFlagName,
  type SubscribeCTAVariant,
} from './contracts';

let statsigInitialized = false;
let statsigClient: Statsig | null = null;
let statsigInitPromise: Promise<void> | null = null;
let statsigWarnedNoSecret = false;

const isE2ERuntime = publicEnv.NEXT_PUBLIC_E2E_MODE === '1';
const STATSIG_INIT_TIMEOUT_MS = 10_000;
const STATSIG_SHUTDOWN_TIMEOUT_MS = 1500;

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
    if (gate.getEvaluationDetails().reason === 'Unrecognized') {
      return defaultValue;
    }
    return gate.value;
  } catch (error) {
    logger.error(`[Statsig] Error checking gate ${gateKey}`, error, 'Statsig');
    return defaultValue;
  }
}

export async function getStatsigGateValue(
  flagName: StatsigBackedAppFlagName,
  userId: string | null
): Promise<boolean> {
  return checkGateForUser(
    userId,
    APP_FLAG_TO_STATSIG_GATE[flagName],
    APP_FLAG_DEFAULTS[flagName]
  );
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
