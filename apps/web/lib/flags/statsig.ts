import 'server-only';
import {
  type DataStore,
  Statsig,
  StatsigUser,
} from '@statsig/statsig-node-core';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';
import { captureWarning } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';
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
let nextInitAttemptAt = 0;
let lastDefaultsAlertAt = 0;
let initStartedAt = 0;

const isE2ERuntime = publicEnv.NEXT_PUBLIC_E2E_MODE === '1';
// The SDK's own default init timeout (~3s) is what produced the production
// "operation timed out" errors on cold serverless starts. Give the SDK a longer
// budget, wrapped by a slightly longer hard cap.
const STATSIG_SDK_INIT_TIMEOUT_MS = 8_000;
const STATSIG_INIT_TIMEOUT_MS = 10_000;
// A request never waits longer than this for init; it serves defaults instead
// while init keeps running in the background for later requests.
const REQUEST_INIT_WAIT_MS = 1_000;
// After a failed init, do not retry on every request.
const INIT_RETRY_COOLDOWN_MS = 5_000;
const DEFAULTS_ALERT_INTERVAL_MS = 60_000;
const SPECS_STORE_TTL_SECONDS = 24 * 60 * 60;
const SPECS_STORE_TIMEOUT_MS = 500;
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

/**
 * Statsig data adapter backed by the shared Redis. A cold instance reads the
 * last config spec from Redis (one fast hop) instead of waiting on the Statsig
 * network; the SDK writes fresh specs back after any network fetch. Returns
 * undefined when Redis is not configured, so the SDK uses the network as before.
 */
export function createSpecsDataStore(): DataStore | undefined {
  const redis = getRedis();
  if (!redis) return undefined;
  const storeKey = (key: string) => `statsig:${key}`;
  return {
    get: async key => {
      try {
        const value = await withTimeout(redis.get(storeKey(key)), {
          timeoutMs: SPECS_STORE_TIMEOUT_MS,
          context: 'Statsig specs store read',
        });
        if (value == null) return {};
        return {
          result: typeof value === 'string' ? value : JSON.stringify(value),
        };
      } catch {
        return {};
      }
    },
    set: async (key, value) => {
      try {
        await redis.set(storeKey(key), value, { ex: SPECS_STORE_TTL_SECONDS });
      } catch {
        // Best effort: the store only accelerates cold starts.
      }
    },
    supportPollingUpdatesFor: async () => false,
  };
}

function getStatsigClient(serverSecret: string): Statsig {
  if (statsigClient) {
    return statsigClient;
  }

  statsigClient = new Statsig(serverSecret, {
    environment: env.VERCEL_ENV || env.NODE_ENV || 'development',
    initTimeoutMs: STATSIG_SDK_INIT_TIMEOUT_MS,
    dataStore: createSpecsDataStore(),
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

async function runStatsigInit(): Promise<void> {
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
  initStartedAt = Date.now();
  try {
    statsig = getStatsigClient(serverSecret);
    await withTimeout(statsig.initialize(), {
      timeoutMs: STATSIG_INIT_TIMEOUT_MS,
      context: 'Statsig initialization',
    });
    statsigInitialized = true;
    // Measurable: init outcome + latency per cold start.
    logger.info(
      `[Statsig] Server SDK initialized initMs=${Date.now() - initStartedAt}`,
      { outcome: 'ok', initMs: Date.now() - initStartedAt },
      'Statsig'
    );
  } catch (error) {
    const failedStatsig = statsig ?? statsigClient;
    statsigInitialized = false;
    statsigClient = null;
    nextInitAttemptAt = Date.now() + INIT_RETRY_COOLDOWN_MS;
    await cleanupStatsigClientAfterInitFailure(failedStatsig);
    logger.error(
      `[Statsig] Failed to initialize server SDK initMs=${Date.now() - initStartedAt}`,
      error,
      'Statsig'
    );
    void captureWarning('Statsig init failed; flags serving defaults', error, {
      route: 'statsig-init',
      initMs: Date.now() - initStartedAt,
    });
  }
}

/**
 * Starts init at most once at a time (module singleton) and lets a request
 * wait at most REQUEST_INIT_WAIT_MS. Init continues in the background, so a
 * slow cold start costs a request at most the budget, never the full timeout.
 */
async function initializeStatsig(): Promise<void> {
  if (statsigInitialized || isE2ERuntime) return;

  if (!statsigInitPromise) {
    if (Date.now() < nextInitAttemptAt) return;
    statsigInitPromise = runStatsigInit().finally(() => {
      statsigInitPromise = null;
    });
  }

  let budgetTimer: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      statsigInitPromise,
      new Promise<void>(resolve => {
        budgetTimer = setTimeout(resolve, REQUEST_INIT_WAIT_MS);
      }),
    ]);
  } finally {
    if (budgetTimer) clearTimeout(budgetTimer);
  }

  if (!statsigInitialized && env.STATSIG_SERVER_SECRET) {
    reportServingDefaults();
  }
}

/** Fail loudly (throttled) when production serves flag defaults. */
function reportServingDefaults(): void {
  const now = Date.now();
  if (now - lastDefaultsAlertAt < DEFAULTS_ALERT_INTERVAL_MS) return;
  lastDefaultsAlertAt = now;
  logger.warn(
    '[Statsig] Serving flag defaults: SDK not initialized for this request',
    { outcome: 'defaults', waitedMs: REQUEST_INIT_WAIT_MS },
    'Statsig'
  );
  if (env.VERCEL_ENV === 'production') {
    void captureWarning('Statsig flags serving defaults in production', null, {
      route: 'statsig-init',
      waitedMs: REQUEST_INIT_WAIT_MS,
    });
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

/**
 * Logs a custom event to Statsig, keyed to the given stable user id.
 *
 * Used by the PAC instrumentation sink (`/api/profile/pac-event`) so
 * variant-keyed arm metrics (exposures, captures, dismissals, conversions)
 * land where the experiment auto-promotion loop reads them. Fail-safe:
 * errors are logged and swallowed — event logging must never break a
 * request path.
 */
export async function logStatsigEvent(
  userId: string | null,
  eventName: string,
  value?: string | number,
  metadata?: Record<string, string>
): Promise<void> {
  if (isE2ERuntime) return;

  await initializeStatsig();
  if (!statsigInitialized) return;

  try {
    const statsig = statsigClient;
    if (!statsig) return;

    statsig.logEvent(getStatsigUser(userId), eventName, value, metadata);
  } catch (error) {
    logger.warn(`[Statsig] Failed to log event ${eventName}`, error, 'Statsig');
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
    nextInitAttemptAt = 0;
  }
}
