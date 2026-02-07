import 'server-only';
import Statsig from 'statsig-node';
import { env } from '@/lib/env-server';

/**
 * Feature flag keys registry
 * Single source of truth for all feature flags used in the application
 */
export const FEATURE_FLAG_KEYS = {
  CLAIM_HANDLE: 'feature_claim_handle',
  BILLING_UPGRADE_DIRECT: 'billing.upgradeDirect',
} as const;

export type FeatureFlagKey =
  (typeof FEATURE_FLAG_KEYS)[keyof typeof FEATURE_FLAG_KEYS];

/**
 * Feature flags bootstrap payload
 * This is serialized and sent to the client for hydration
 */
export interface FeatureFlagsBootstrap {
  gates: Record<string, boolean>;
}

let statsigInitialized = false;

/**
 * Initialize Statsig server SDK
 * Call this once at application startup or lazily on first use
 */
async function initializeStatsig(): Promise<void> {
  if (statsigInitialized) return;

  const serverSecret = env.STATSIG_SERVER_SECRET;
  if (!serverSecret) {
    console.warn(
      '[Statsig] Server secret not configured - feature flags will use defaults'
    );
    return;
  }

  try {
    await Statsig.initialize(serverSecret, {
      environment: {
        tier: env.VERCEL_ENV || env.NODE_ENV || 'development',
      },
    });
    statsigInitialized = true;
    console.log('[Statsig] Server SDK initialized');
  } catch (error) {
    console.error('[Statsig] Failed to initialize server SDK:', error);
  }
}

/**
 * Evaluate a feature gate for a given user
 * Returns the gate value or the default if Statsig is not initialized
 */
export async function checkGate(
  userId: string | null,
  gateKey: FeatureFlagKey,
  defaultValue = false
): Promise<boolean> {
  await initializeStatsig();

  if (!statsigInitialized) {
    return defaultValue;
  }

  try {
    return Statsig.checkGate(
      {
        userID: userId ?? 'anonymous',
      },
      gateKey
    );
  } catch (error) {
    console.error(`[Statsig] Error checking gate ${gateKey}:`, error);
    return defaultValue;
  }
}

/**
 * Evaluate all feature gates for a user and return a bootstrap payload
 * This is called server-side and the result is serialized to the client
 */
export async function getFeatureFlagsBootstrap(
  userId: string | null
): Promise<FeatureFlagsBootstrap> {
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
    await Statsig.shutdown();
    statsigInitialized = false;
  }
}
