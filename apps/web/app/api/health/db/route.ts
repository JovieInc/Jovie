import { NextResponse } from 'next/server';
import { checkDbHealth, getDbConfig } from '@/lib/db';
import { HEALTH_CHECK_CONFIG } from '@/lib/db/config';
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

interface HealthDetails {
  databaseUrlOk: boolean;
  databaseUrlValid: boolean;
  latency?: number;
  error?: string;
  config?: ReturnType<typeof getDbConfig>;
  validationError?: string;
  checks?: {
    connection: boolean;
    query: boolean;
    transaction: boolean;
    schemaAccess: boolean;
  };
}

interface HealthResponse {
  service: 'db';
  status: 'ok' | 'error';
  ok: boolean;
  timestamp: string;
  details: HealthDetails;
}

export async function GET(request: Request) {
  const databaseUrlOk = Boolean(env.DATABASE_URL);
  const now = new Date().toISOString();
  const config = getDbConfig();

  // Rate limiting check
  const clientIP = getClientIP(request);
  const rateLimitStatus = healthLimiter.getStatus(clientIP);

  if (rateLimitStatus.blocked) {
    return NextResponse.json(
      {
        service: 'db',
        status: 'error',
        ok: false,
        timestamp: now,
        details: {
          databaseUrlOk,
          databaseUrlValid: false,
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

  // Validate database environment
  const dbValidation = validateDatabaseEnvironment();

  if (!databaseUrlOk || !dbValidation.valid) {
    const body: HealthResponse = {
      service: 'db',
      status: 'error',
      ok: false,
      timestamp: now,
      details: {
        databaseUrlOk,
        databaseUrlValid: dbValidation.valid,
        error: databaseUrlOk
          ? 'DATABASE_URL validation failed'
          : 'DATABASE_URL not configured',
        validationError: dbValidation.error,
        config,
      },
    };
    logger.warn(
      'DB healthcheck failed: configuration or validation error',
      body.details,
      'health/db'
    );
    return NextResponse.json(body, {
      status: HEALTH_CHECK_CONFIG.statusCodes.unhealthy,
      headers: {
        ...HEALTH_CHECK_CONFIG.cacheHeaders,
        ...createRateLimitHeadersFromStatus(rateLimitStatus),
      },
    });
  }

  // Use the enhanced database health check with retry logic
  const healthResult = await checkDbHealth();

  const body: HealthResponse = {
    service: 'db',
    status: healthResult.healthy ? 'ok' : 'error',
    ok: healthResult.healthy,
    timestamp: now,
    details: {
      databaseUrlOk,
      databaseUrlValid: dbValidation.valid,
      latency: healthResult.latency,
      checks: healthResult.details,
      ...(healthResult.error ? { error: healthResult.error } : {}),
      config,
    },
  };

  if (healthResult.healthy) {
    logger.info(
      'DB healthcheck ok',
      {
        latency: healthResult.latency,
      },
      'health/db'
    );
  } else {
    logger.error(
      'DB healthcheck error',
      {
        error: healthResult.error,
        latency: healthResult.latency,
      },
      'health/db'
    );
  }

  return NextResponse.json(body, {
    status: healthResult.healthy
      ? HEALTH_CHECK_CONFIG.statusCodes.healthy
      : HEALTH_CHECK_CONFIG.statusCodes.unhealthy,
    headers: {
      ...HEALTH_CHECK_CONFIG.cacheHeaders,
      ...createRateLimitHeadersFromStatus(rateLimitStatus),
    },
  });
}
