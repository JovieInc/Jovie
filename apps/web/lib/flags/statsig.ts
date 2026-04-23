import 'server-only';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';
import {
  APP_FLAG_DEFAULTS,
  APP_FLAG_TO_STATSIG_GATE,
  LEGACY_STATSIG_GATE_KEYS,
  type StatsigBackedAppFlagName,
  type SubscribeCTAVariant,
} from './contracts';

type StatsigClient = typeof import('statsig-node').default;

let statsigInitialized = false;
let statsigClient: StatsigClient | null = null;
let statsigImportFailed = false;
let statsigInitPromise: Promise<void> | null = null;
let statsigWarnedNoSecret = false;

const isE2ERuntime = publicEnv.NEXT_PUBLIC_E2E_MODE === '1';

async function getStatsigClient(): Promise<StatsigClient | null> {
  if (statsigClient) {
    return statsigClient;
  }

  if (statsigImportFailed) {
    return null;
  }

  try {
    // Statsig is optional in local/test environments; keep the specifier
    // non-literal so Vite/Vitest do not pre-resolve it before runtime fallback.
    const optionalModuleName = 'statsig-node';
    const statsigModule = await import(optionalModuleName);
    statsigClient = statsigModule.default;
    return statsigClient;
  } catch (error) {
    statsigImportFailed = true;
    logger.error('Statsig SDK is unavailable', error, 'Statsig');
    return null;
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

    try {
      const statsig = await getStatsigClient();
      if (!statsig) return;

      await statsig.initialize(serverSecret, {
        environment: {
          tier: env.VERCEL_ENV || env.NODE_ENV || 'development',
        },
      });
      statsigInitialized = true;
      logger.info('[Statsig] Server SDK initialized', undefined, 'Statsig');
    } catch (error) {
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
    const statsig = await getStatsigClient();
    if (!statsig) {
      return defaultValue;
    }

    const gate = statsig.getFeatureGateSync(
      { userID: userId ?? 'anonymous' },
      gateKey
    );
    if (gate.evaluationDetails?.reason === 'Unrecognized') {
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
    const statsig = await getStatsigClient();
    if (!statsig) {
      return {};
    }

    const experiment = await statsig.getExperiment(
      { userID: userId ?? 'anonymous' },
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
  if (statsigInitialized) {
    const statsig = await getStatsigClient();
    if (statsig) {
      await statsig.shutdown();
    }
  }
  statsigInitialized = false;
  statsigClient = null;
  statsigImportFailed = false;
  statsigInitPromise = null;
}
