import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { processMerchFulfillmentJobs } from '@/lib/merch/orders';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/process-merch-fulfillment',
  });
  if (authError) return authError;

  try {
    const result = await processMerchFulfillmentJobs();
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('[merch] Fulfillment cron failed', { error });
    return NextResponse.json(
      { error: 'Failed to process merch fulfillment' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
