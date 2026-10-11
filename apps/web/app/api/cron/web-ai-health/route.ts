/**
 * Daily production Web AI health canary (JOV-6938).
 *
 * The existing Production Synthetic Monitoring workflow calls this endpoint so
 * all five probes execute inside the deployed app with production AI Gateway
 * project auth. The route returns only redacted status metadata; model output
 * and credentials never leave the function.
 *
 * Cost impact: five O(1), tiny model turns per day. No user or database scan.
 * The explicit JOV-6938 acceptance criteria authorize this existing-workflow
 * schedule extension; no Vercel cron entry or new monitoring stack is added.
 */

import { NextResponse } from 'next/server';
import { runWebAiHealth } from '@/lib/ai/web-ai-health';
import { verifyCronRequest } from '@/lib/cron/auth';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const maxDuration = 60;

const ROUTE = '/api/cron/web-ai-health';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request): Promise<NextResponse> {
  const authError = verifyCronRequest(request, {
    route: ROUTE,
    allowDevelopmentBypass: true,
    requireTrustedOrigin: true,
  });
  if (authError) return authError;

  try {
    const receipt = await runWebAiHealth();
    const failed = receipt.results.filter(result => !result.ok);

    if (failed.length > 0) {
      logger.error(
        '[canary/web-ai-health] Production AI surface probe failed',
        {
          allowlist: receipt.gatewayAllowlist.name,
          failures: failed.map(result => ({
            surface: result.surface,
            model: result.model,
            cause: result.failureCause,
          })),
        }
      );
    } else {
      logger.info('[canary/web-ai-health] Production AI surfaces healthy', {
        allowlist: receipt.gatewayAllowlist.name,
        surfaces: receipt.results.map(result => result.surface),
      });
    }

    return NextResponse.json(receipt, {
      status: receipt.status === 'passed' ? 200 : 503,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    logger.error('[canary/web-ai-health] Probe orchestration failed', error);
    await captureError('Web AI health canary orchestration failed', error, {
      route: ROUTE,
      method: 'GET',
    });
    return NextResponse.json(
      {
        error: 'web_ai_health_unavailable',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
