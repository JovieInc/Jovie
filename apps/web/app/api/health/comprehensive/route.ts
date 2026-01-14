import { NextResponse } from 'next/server';
import { checkDbHealth, validateDbConnection } from '@/lib/db';
import { HEALTH_CHECK_CONFIG } from '@/lib/db/config';
import { getEnvironmentInfo, validateEnvironment } from '@/lib/env-server';
import { validateDatabaseEnvironment } from '@/lib/startup/environment-validator';
import { logger } from '@/lib/utils/logger';
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientIP,
  getRateLimitStatus,
} from '@/lib/utils/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ComprehensiveHealthResponse {
  service: 'comprehensive';
  status: 'ok' | 'warning' | 'error';
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

export async function GET(request: Request) {
  const now = new Date().toISOString();
  const startTime = Date.now();

  // Rate limiting check
  const clientIP = getClientIP(request);
  const isRateLimited = checkRateLimit(clientIP, true); // true for health endpoint
  const rateLimitStatus = getRateLimitStatus(clientIP, true);

  if (isRateLimited) {
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
          ...createRateLimitHeaders(rateLimitStatus),
        },
      }
    );
  }

  try {
    // 1. Environment validation
    logger.info('[HEALTH] Running comprehensive health check...');
    const envValidation = validateEnvironment('runtime');
    const envInfo = getEnvironmentInfo();

    let envStatus: 'ok' | 'warning' | 'error' = 'ok';
    if (envValidation.critical.length > 0 || envValidation.errors.length > 0) {
      envStatus = 'error';
    } else if (envValidation.warnings.length > 0) {
      envStatus = 'warning';
    }

    // 2. Database checks
    let dbStatus: 'ok' | 'warning' | 'error' = 'ok';
    let dbConnection = false;
    let dbHealth: Awaited<ReturnType<typeof checkDbHealth>> | undefined;
    let dbValidation:
      | ReturnType<typeof validateDatabaseEnvironment>
      | undefined;
    let dbLatency: number | undefined;

    if (envInfo.hasDatabase) {
      // Database validation
      dbValidation = validateDatabaseEnvironment();

      if (!dbValidation.valid) {
        dbStatus = 'error';
      } else {
        // Connection test
        const connectionResult = await validateDbConnection();
        dbConnection = connectionResult.connected;
        dbLatency = connectionResult.latency;

        if (!dbConnection) {
          dbStatus = 'error';
        } else {
          // Comprehensive health check
          try {
            dbHealth = await checkDbHealth();
            if (!dbHealth.healthy) {
              dbStatus = 'error';
            } else if (dbHealth.latency && dbHealth.latency > 500) {
              // Warning if slow but healthy
              dbStatus = 'warning';
            }
          } catch {
            dbStatus = 'warning'; // Health check failed but connection works
          }
        }
      }
    }

    // 3. System information
    const memUsage = process.memoryUsage();
    const systemInfo = {
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

    // 4. Calculate overall status and summary
    const checks = [envStatus, dbStatus, systemInfo.status];
    const totalChecks = checks.length;
    const passedChecks = checks.filter(s => s === 'ok').length;
    const warningChecks = checks.filter(s => s === 'warning').length;
    const failedChecks = checks.filter(s => s === 'error').length;

    let overallStatus: 'ok' | 'warning' | 'error' = 'ok';
    if (failedChecks > 0) {
      overallStatus = 'error';
    } else if (warningChecks > 0) {
      overallStatus = 'warning';
    }

    const totalLatency = Date.now() - startTime;

    const response: ComprehensiveHealthResponse = {
      service: 'comprehensive',
      status: overallStatus,
      ok: overallStatus !== 'error',
      timestamp: now,
      summary: {
        totalChecks,
        passedChecks,
        failedChecks,
        warningChecks,
      },
      checks: {
        environment: {
          status: envStatus,
          details: envValidation,
        },
        database: {
          status: dbStatus,
          connection: dbConnection,
          health: dbHealth,
          validation: dbValidation,
          latency: dbLatency,
        },
        system: systemInfo,
      },
    };

    // Log results
    logger.info(
      'Comprehensive health check completed',
      {
        status: overallStatus,
        latency: totalLatency,
        summary: response.summary,
        dbConnection,
        envIssues: envValidation.critical.length + envValidation.errors.length,
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
        ...createRateLimitHeaders(rateLimitStatus),
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
        ...createRateLimitHeaders(rateLimitStatus),
      },
    });
  }
}
