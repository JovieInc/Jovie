import { NextResponse } from 'next/server';
import { checkDbHealth, validateDbConnection } from '@/lib/db';
import { HEALTH_CHECK_CONFIG } from '@/lib/db/config';
import { getEnvironmentInfo, validateEnvironment } from '@/lib/env-server';
import {
  createRateLimitHeadersFromStatus,
  getClientIP,
  healthLimiter,
  type RateLimitStatus,
} from '@/lib/rate-limit';
import { validateDatabaseEnvironment } from '@/lib/startup/environment-validator';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckStatus = 'ok' | 'warning' | 'error';

interface ComprehensiveHealthResponse {
  service: 'comprehensive';
  status: CheckStatus;
  ok: boolean;
  timestamp: string;
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    warningChecks: number;
  };
  checks: {
    environment: {
      status: 'ok' | 'warning' | 'error';
      details: ReturnType<typeof validateEnvironment>;
    };
    database: {
      status: 'ok' | 'warning' | 'error';
      connection: boolean;
      health?: Awaited<ReturnType<typeof checkDbHealth>>;
      validation?: ReturnType<typeof validateDatabaseEnvironment>;
      latency?: number;
    };
    system: {
      status: 'ok';
      nodeVersion: string;
      platform: string;
      uptime: number;
      memory: {
        used: number;
        total: number;
        percentage: number;
      };
    };
  };
}

function evaluateEnvironmentStatus(
  validation: ReturnType<typeof validateEnvironment>
): CheckStatus {
  if (validation.critical.length > 0 || validation.errors.length > 0) {
    return 'error';
  }
  if (validation.warnings.length > 0) {
    return 'warning';
  }
  return 'ok';
}

async function runEnvironmentCheck() {
  const envValidation = validateEnvironment('runtime');
  const status = evaluateEnvironmentStatus(envValidation);

  return {
    status,
    details: envValidation,
  };
}

async function runDatabaseCheck() {
  const envInfo = getEnvironmentInfo();
  if (!envInfo.hasDatabase) {
    return {
      status: 'ok' as const,
      connection: false,
    };
  }

  const validation = validateDatabaseEnvironment();
  if (!validation.valid) {
    return {
      status: 'error' as const,
      connection: false,
      validation,
    };
  }

  const connectionResult = await validateDbConnection();
  if (!connectionResult.connected) {
    return {
      status: 'error' as const,
      connection: false,
      validation,
      latency: connectionResult.latency,
    };
  }

  try {
    const health = await checkDbHealth();
    const resolveHealthStatus = (): CheckStatus => {
      if (!health.healthy) return 'error';
      if (health.latency && health.latency > 500) return 'warning';
      return 'ok';
    };
    const status: CheckStatus = resolveHealthStatus();

    return {
      status,
      connection: true,
      validation,
      health,
      latency: connectionResult.latency,
    };
  } catch {
    return {
      status: 'warning' as const,
      connection: true,
      validation,
      latency: connectionResult.latency,
    };
  }
}

async function runSystemCheck() {
  const memUsage = process.memoryUsage();
  return {
    status: 'ok' as const,
    nodeVersion: process.version,
    platform: process.platform,
    uptime: process.uptime(),
    memory: {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    },
  };
}

function summarizeStatuses(statuses: CheckStatus[]) {
  const totalChecks = statuses.length;
  const passedChecks = statuses.filter(status => status === 'ok').length;
  const warningChecks = statuses.filter(status => status === 'warning').length;
  const failedChecks = statuses.filter(status => status === 'error').length;

  const resolveOverallStatus = (): CheckStatus => {
    if (failedChecks > 0) return 'error';
    if (warningChecks > 0) return 'warning';
    return 'ok';
  };
  const overallStatus: CheckStatus = resolveOverallStatus();

  return {
    totalChecks,
    passedChecks,
    warningChecks,
    failedChecks,
    overallStatus,
  };
}

function buildRateLimitedResponse(
  now: string,
  rateLimitStatus: RateLimitStatus
) {
  return NextResponse.json(
    {
      service: 'comprehensive',
      status: 'error',
      ok: false,
      timestamp: now,
      error: 'Rate limit exceeded',
      summary: {
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 1,
        warningChecks: 0,
      },
      checks: {},
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

function buildErrorResponse(
  now: string,
  errorMessage: string,
  totalLatency: number,
  rateLimitStatus: RateLimitStatus
) {
  const errorResponse: ComprehensiveHealthResponse = {
    service: 'comprehensive',
    status: 'error',
    ok: false,
    timestamp: now,
    summary: {
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 1,
      warningChecks: 0,
    },
    checks: {
      environment: {
        status: 'error',
        details: {
          valid: false,
          errors: [errorMessage],
          warnings: [],
          critical: ['Health check system failure'],
        },
      },
      database: {
        status: 'error',
        connection: false,
      },
      system: {
        status: 'ok',
        nodeVersion:
          typeof process !== 'undefined' && 'version' in process
            ? process.version
            : 'unknown',
        platform:
          typeof process !== 'undefined' && 'platform' in process
            ? process.platform
            : 'unknown',
        uptime:
          typeof process !== 'undefined' && 'uptime' in process
            ? process.uptime()
            : 0,
        memory: {
          used: 0,
          total: 0,
          percentage: 0,
        },
      },
    },
  };

  return NextResponse.json(errorResponse, {
    status: HEALTH_CHECK_CONFIG.statusCodes.unhealthy,
    headers: {
      ...HEALTH_CHECK_CONFIG.cacheHeaders,
      'X-Health-Check-Duration': totalLatency.toString(),
      ...createRateLimitHeadersFromStatus(rateLimitStatus),
    },
  });
}

export async function GET(request: Request) {
  const now = new Date().toISOString();
  const startTime = Date.now();

  const clientIP = getClientIP(request);
  const rateLimitStatus = healthLimiter.getStatus(clientIP);

  if (rateLimitStatus.blocked) {
    return buildRateLimitedResponse(now, rateLimitStatus);
  }

  // Trigger rate limit counter increment (fire-and-forget)
  void healthLimiter.limit(clientIP);

  try {
    logger.info('[HEALTH] Running comprehensive health check...');

    const settledResults = await Promise.allSettled([
      runEnvironmentCheck(),
      runDatabaseCheck(),
      runSystemCheck(),
    ]);

    const [envResult, dbResult, systemResult] = settledResults;
    if (envResult.status === 'rejected') {
      throw envResult.reason;
    }
    if (dbResult.status === 'rejected') {
      throw dbResult.reason;
    }
    if (systemResult.status === 'rejected') {
      throw systemResult.reason;
    }

    const environment = envResult.value;
    const database = dbResult.value;
    const system = systemResult.value;

    const summary = summarizeStatuses([
      environment.status,
      database.status,
      system.status,
    ]);

    const totalLatency = Date.now() - startTime;

    const response: ComprehensiveHealthResponse = {
      service: 'comprehensive',
      status: summary.overallStatus,
      ok: summary.overallStatus !== 'error',
      timestamp: now,
      summary: {
        totalChecks: summary.totalChecks,
        passedChecks: summary.passedChecks,
        failedChecks: summary.failedChecks,
        warningChecks: summary.warningChecks,
      },
      checks: {
        environment,
        database,
        system,
      },
    };

    logger.info(
      'Comprehensive health check completed',
      {
        status: summary.overallStatus,
        latency: totalLatency,
        summary: response.summary,
        dbConnection: database.connection,
        envIssues:
          environment.details.critical.length +
          environment.details.errors.length,
      },
      'health/comprehensive'
    );

    return NextResponse.json(response, {
      status: response.ok
        ? HEALTH_CHECK_CONFIG.statusCodes.healthy
        : HEALTH_CHECK_CONFIG.statusCodes.unhealthy,
      headers: {
        ...HEALTH_CHECK_CONFIG.cacheHeaders,
        'X-Health-Check-Duration': totalLatency.toString(),
        ...createRateLimitHeadersFromStatus(rateLimitStatus),
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const totalLatency = Date.now() - startTime;

    logger.error(
      'Comprehensive health check failed',
      {
        error: errorMessage,
        latency: totalLatency,
      },
      'health/comprehensive'
    );

    return buildErrorResponse(now, errorMessage, totalLatency, rateLimitStatus);
  }
}
