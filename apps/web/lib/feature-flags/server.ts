import 'server-only';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

import {
  FEATURE_FLAG_KEYS,
  type FeatureFlagKey,
  type FeatureFlagsBootstrap,
  type SubscribeCTAVariant,
} from './shared';

type StatsigClient = typeof import('statsig-node').default;

let statsigInitialized = false;
let statsigClient: StatsigClient | null = null;
let statsigImportFailed = false;
// Suppresses the "no secret" warning after the first call within a process lifetime.
// Resets on cold start; intentional — prevents 48+ duplicate warnings per page render.
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
    const statsigModule = await import('statsig-node');
    statsigClient = statsigModule.default;
    return statsigClient;
  } catch (error) {
    statsigImportFailed = true;
    logger.error('Statsig SDK is unavailable', error, 'Statsig');
    return null;
  }
}

/**
 * Initialize Statsig server SDK
 * Call this once at application startup or lazily on first use
 */
async function initializeStatsig(): Promise<void> {
  if (statsigInitialized || isE2ERuntime) return;

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
    if (!statsig) {
      return;
    }

    await statsig.initialize(serverSecret, {
      environment: {
        tier: env.VERCEL_ENV || env.NODE_ENV || 'development',
      },
    });
    statsigInitialized = true;
    logger.info('[Statsig] Server SDK initialized', undefined, 'Statsig');
  } catch (error) {
    logger.error('[Statsig] Failed to initialize server SDK', error, 'Statsig');
  }
}

/**
 * Evaluate a feature gate for a given user.
 * Returns the gate value, or defaultValue when:
 * - Statsig SDK is not initialized (no secret configured)
 * - The gate is not registered in Statsig (reason: 'Unrecognized')
 * - An error occurs during evaluation
 */
export async function checkGate(
  userId: string | null,
  gateKey: FeatureFlagKey,
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
    // If the gate doesn't exist in Statsig, fall back to code default
    if (gate.evaluationDetails?.reason === 'Unrecognized') {
      return defaultValue;
    }
    return gate.value;
  } catch (error) {
    logger.error(`[Statsig] Error checking gate ${gateKey}`, error, 'Statsig');
    return defaultValue;
  }
}

/**
 * Evaluate a Statsig experiment and return its parameter values.
 * Returns an empty object if Statsig is not initialized.
 */
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

/**
 * Get the subscribe CTA variant for a given artist.
 * Defaults to 'two_step' when Statsig is not configured.
 */
export async function getSubscribeCTAVariant(
  artistId: string
): Promise<SubscribeCTAVariant> {
  const config = await getExperiment(
    artistId,
    FEATURE_FLAG_KEYS.SUBSCRIBE_CTA_EXPERIMENT
  );
  const variant = config.variant;
  if (variant === 'inline' || variant === 'two_step') return variant;
  return 'two_step';
}

/**
 * Evaluate all feature gates for a user and return a bootstrap payload
 * This is called server-side and the result is serialized to the client
 */
export async function getFeatureFlagsBootstrap(
  userId: string | null
): Promise<FeatureFlagsBootstrap> {
  if (isE2ERuntime) {
    return { gates: {} };
  }

  await initializeStatsig();

  const gates: Record<string, boolean> = {};

  // Evaluate all gates in parallel
  const gateEntries = Object.entries(FEATURE_FLAG_KEYS);
  const results = await Promise.all(
    gateEntries.map(async ([, gateKey]) => {
      const value = await checkGate(userId, gateKey, false);
      return [gateKey, value] as const;
    })
  );

  for (const [gateKey, value] of results) {
    gates[gateKey] = value;
  }

  return { gates };
}

/**
 * Shutdown Statsig SDK gracefully
 * Call this when the application is shutting down
 */
export async function shutdownStatsig(): Promise<void> {
  if (statsigInitialized) {
    const statsig = await getStatsigClient();
    if (statsig) {
      await statsig.shutdown();
    }
    statsigInitialized = false;
  }
}
