import { NextResponse } from 'next/server';
import { checkDbPerformance, getDbConfig } from '@/lib/db';
import { HEALTH_CHECK_CONFIG, PERFORMANCE_THRESHOLDS } from '@/lib/db/config';
import { env } from '@/lib/env-server';
import {
  createRateLimitHeadersFromStatus,
  getClientIP,
  healthLimiter,
} from '@/lib/rate-limit';
import { validateDatabaseEnvironment } from '@/lib/startup/environment-validator';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PerformanceHealthResponse {
  service: 'db-performance';
  status: 'ok' | 'warning' | 'error';
  ok: boolean;
  timestamp: string;
  details: {
    databaseUrlOk: boolean;
    databaseUrlValid: boolean;
    metrics?: {
      simpleQuery?: number;
      complexQuery?: number;
      transactionTime?: number;
      concurrentConnections?: number;
    };
    thresholds: {
      simpleQueryMax: number;
      transactionTimeMax: number;
    };
    error?: string;
    validationError?: string;
    config?: ReturnType<typeof getDbConfig>;
  };
}

export async function GET(request: Request) {
  const databaseUrlOk = Boolean(env.DATABASE_URL);
  const now = new Date().toISOString();
  const config = getDbConfig();

  // Performance thresholds from centralized config
  const thresholds = {
    simpleQueryMax: PERFORMANCE_THRESHOLDS.simpleQueryMax,
    transactionTimeMax: PERFORMANCE_THRESHOLDS.transactionTimeMax,
  };

  // Rate limiting check
  const clientIP = getClientIP(request);
  const rateLimitStatus = healthLimiter.getStatus(clientIP);

  if (rateLimitStatus.blocked) {
    return NextResponse.json(
      {
        service: 'db-performance',
        status: 'error',
        ok: false,
        timestamp: now,
        details: {
          databaseUrlOk,
          databaseUrlValid: false,
          thresholds,
          error: 'Rate limit exceeded',
        },
      },
      {
        status: 429,
        headers: {
          ...HEALTH_CHECK_CONFIG.cacheHeaders,
          ...createRateLimitHeadersFromStatus(rateLimitStatus),
        },
      }
    );
  }

  // Trigger rate limit counter increment (fire-and-forget)
  void healthLimiter.limit(clientIP);

  // Validate database environment first
  const dbValidation = validateDatabaseEnvironment();

  if (!databaseUrlOk || !dbValidation.valid) {
    const body: PerformanceHealthResponse = {
      service: 'db-performance',
      status: 'error',
      ok: false,
      timestamp: now,
      details: {
        databaseUrlOk,
        databaseUrlValid: dbValidation.valid,
        thresholds,
        error: databaseUrlOk
          ? 'DATABASE_URL validation failed'
          : 'DATABASE_URL not configured',
        validationError: dbValidation.error,
        config,
      },
    };

    logger.warn(
      'DB performance healthcheck failed: configuration or validation error',
      body.details,
      'health/db/performance'
    );

    return NextResponse.json(body, {
      status: HEALTH_CHECK_CONFIG.statusCodes.unhealthy,
      headers: {
        ...HEALTH_CHECK_CONFIG.cacheHeaders,
        ...createRateLimitHeadersFromStatus(rateLimitStatus),
      },
    });
  }

  // Run comprehensive performance health check
  const performanceResult = await checkDbPerformance();

  // Determine status based on performance metrics
  let status: 'ok' | 'warning' | 'error' = 'ok';
  let ok = true;

  if (performanceResult.healthy) {
    // Check for warning conditions (slower than optimal but not critical)
    const simpleQuerySlow =
      (performanceResult.metrics.simpleQuery || 0) >
      thresholds.simpleQueryMax * PERFORMANCE_THRESHOLDS.warningMultiplier;
    const transactionSlow =
      (performanceResult.metrics.transactionTime || 0) >
      thresholds.transactionTimeMax * PERFORMANCE_THRESHOLDS.warningMultiplier;

    if (simpleQuerySlow || transactionSlow) {
      status = 'warning';
      // Still ok=true for warnings, just indicates suboptimal performance
    }
  } else {
    status = 'error';
    ok = false;
  }

  const body: PerformanceHealthResponse = {
    service: 'db-performance',
    status,
    ok,
    timestamp: now,
    details: {
      databaseUrlOk,
      databaseUrlValid: dbValidation.valid,
      metrics: performanceResult.metrics,
      thresholds,
      ...(performanceResult.error ? { error: performanceResult.error } : {}),
      config,
    },
  };

  if (ok) {
    logger.info(
      'DB performance healthcheck ok',
      {
        metrics: performanceResult.metrics,
        status,
      },
      'health/db/performance'
    );
  } else {
    logger.error(
      'DB performance healthcheck failed',
      {
        error: performanceResult.error,
        metrics: performanceResult.metrics,
      },
      'health/db/performance'
    );
  }

  return NextResponse.json(body, {
    status: ok
      ? HEALTH_CHECK_CONFIG.statusCodes.healthy
      : HEALTH_CHECK_CONFIG.statusCodes.unhealthy,
    headers: {
      ...HEALTH_CHECK_CONFIG.cacheHeaders,
      ...createRateLimitHeadersFromStatus(rateLimitStatus),
    },
  });
}
