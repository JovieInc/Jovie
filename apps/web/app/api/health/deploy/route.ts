import { NextResponse } from 'next/server';
import { validateDbConnection } from '@/lib/db';
import { getEnvironmentInfo, validateEnvironment } from '@/lib/env-server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deploy Health Check Endpoint (ENG-004)
 *
 * Used during deployment to verify the application is ready to serve traffic.
 * Returns 503 if any critical issues are detected.
 *
 * Checks:
 * 1. Environment validation (critical vars present)
 * 2. Database connectivity
 *
 * Use this endpoint in Vercel's health check configuration to fail
 * deployments that have critical environment issues.
 *
 * Example Vercel configuration (vercel.json):
 * {
 *   "rewrites": [{ "source": "/health", "destination": "/api/health/deploy" }]
 * }
 */
export async function GET() {
  const now = new Date().toISOString();
  const issues: string[] = [];

  // 1. Validate environment
  const envValidation = validateEnvironment('runtime');
  const envInfo = getEnvironmentInfo();

  if (envValidation.critical.length > 0) {
    issues.push(...envValidation.critical.map(c => `ENV: ${c}`));
  }

  // 2. Test database connection (only if DATABASE_URL is configured)
  let dbConnected = false;
  let dbError: string | null = null;

  if (envInfo.hasDatabase) {
    const dbResult = await validateDbConnection();
    dbConnected = dbResult.connected;
    if (!dbResult.connected) {
      dbError = dbResult.error || 'Unknown database error';
      issues.push(`DB: ${dbError}`);
    }
  } else {
    issues.push('DB: DATABASE_URL not configured');
  }

  // Determine health status
  const isHealthy = issues.length === 0;

  const response = {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: now,
    environment: envInfo.nodeEnv,
    checks: {
      environment: {
        ok: envValidation.critical.length === 0,
        critical: envValidation.critical.length,
        errors: envValidation.errors.length,
        warnings: envValidation.warnings.length,
      },
      database: {
        ok: dbConnected,
        configured: envInfo.hasDatabase,
        error: dbError,
      },
      integrations: {
        auth: envInfo.hasClerk,
        payments: envInfo.hasStripe,
        images: envInfo.hasCloudinary,
      },
    },
    ...(issues.length > 0 && { issues }),
  };

  return NextResponse.json(response, {
    status: isHealthy ? 200 : 503,
    headers: NO_STORE_HEADERS,
  });
}
