import { NextResponse } from 'next/server';
import type { EnvHealthResponse } from '@/lib/contracts/api';
import { HEALTH_CHECK_CONFIG } from '@/lib/db/config';
import { getEnvironmentInfo, validateEnvironment } from '@/lib/env-server';
import { captureWarning } from '@/lib/error-tracking';
import {
  createRateLimitHeaders,
  getClientIP,
  healthLimiter,
} from '@/lib/rate-limit';
import { isValidationCompleted } from '@/lib/startup/environment-validator';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const now = new Date().toISOString();

  // Rate limiting check
  const clientIP = getClientIP(request);
  const rateLimitResult = await healthLimiter.limit(clientIP);

  if (!rateLimitResult.success) {
    // Rate-limited (or limiter unavailable) is not an env validation failure.
    // Return ok:true with empty validation so the OperatorBanner stays hidden;
    // the 429 status + headers remain for observability and clients that care.
    return NextResponse.json(
      {
        service: 'env',
        status: 'ok',
        ok: true,
        timestamp: now,
        details: {
          environment: 'unknown',
          platform: 'unknown',
          nodeVersion: 'unknown',
          startupValidationCompleted: false,
          currentValidation: {
            valid: true,
            errors: [],
            warnings: [],
            critical: [],
          },
          integrations: {
            database: false,
            auth: false,
            payments: false,
            images: false,
          },
        },
      },
      {
        status: 429,
        headers: {
          ...HEALTH_CHECK_CONFIG.cacheHeaders,
          ...createRateLimitHeaders(rateLimitResult),
        },
      }
    );
  }

  try {
    // Get current environment validation
    const currentValidation = validateEnvironment('runtime');
    const envInfo = getEnvironmentInfo();

    // We have access to startup validation but don't need to use it directly
    // It's mainly for reference that startup validation occurred

    // Determine overall status
    let status: 'ok' | 'warning' | 'error' = 'ok';
    let ok = true;

    if (
      currentValidation.critical.length > 0 ||
      currentValidation.errors.length > 0
    ) {
      status = 'error';
      ok = false;
    } else if (currentValidation.warnings.length > 0) {
      status = 'warning';
      // Warnings don't make it unhealthy, but indicate issues
    }

    const body: EnvHealthResponse = {
      service: 'env',
      status,
      ok,
      timestamp: now,
      details: {
        environment: envInfo.nodeEnv,
        platform: envInfo.platform,
        nodeVersion: envInfo.nodeVersion,
        startupValidationCompleted: isValidationCompleted(),
        currentValidation: {
          valid: currentValidation.valid,
          errors: currentValidation.errors,
          warnings: currentValidation.warnings,
          critical: currentValidation.critical,
        },
        integrations: {
          database: envInfo.hasDatabase,
          auth: envInfo.hasClerk,
          payments: envInfo.hasStripe,
          images: envInfo.hasVercelBlob,
        },
      },
    };

    // Log based on status
    if (ok) {
      logger.info(
        'Environment healthcheck ok',
        {
          warnings: currentValidation.warnings.length,
          integrations: body.details.integrations,
        },
        'health/env'
      );
    } else {
      logger.error(
        'Environment healthcheck failed',
        {
          critical: currentValidation.critical.length,
          errors: currentValidation.errors.length,
          warnings: currentValidation.warnings.length,
        },
        'health/env'
      );
    }

    return NextResponse.json(body, {
      status: ok
        ? HEALTH_CHECK_CONFIG.statusCodes.healthy
        : HEALTH_CHECK_CONFIG.statusCodes.unhealthy,
      headers: {
        ...HEALTH_CHECK_CONFIG.cacheHeaders,
        ...createRateLimitHeaders(rateLimitResult),
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    const body: EnvHealthResponse = {
      service: 'env',
      status: 'error',
      ok: false,
      timestamp: now,
      details: {
        environment: process.env.NODE_ENV || 'unknown',
        platform:
          typeof process !== 'undefined' && 'platform' in process
            ? process.platform
            : 'unknown',
        nodeVersion:
          typeof process !== 'undefined' && 'version' in process
            ? process.version
            : 'unknown',
        startupValidationCompleted: false,
        currentValidation: {
          valid: false,
          errors: [errorMessage],
          warnings: [],
          critical: ['Environment validation crashed'],
        },
        integrations: {
          database: false,
          auth: false,
          payments: false,
          images: false,
        },
      },
    };

    logger.error(
      'Environment healthcheck crashed',
      { error: errorMessage },
      'health/env'
    );
    void captureWarning('Environment health check crashed', error, {
      service: 'env',
      route: '/api/health/env',
    });

    return NextResponse.json(body, {
      status: HEALTH_CHECK_CONFIG.statusCodes.unhealthy,
      headers: {
        ...HEALTH_CHECK_CONFIG.cacheHeaders,
        ...createRateLimitHeaders(rateLimitResult),
      },
    });
  }
}
