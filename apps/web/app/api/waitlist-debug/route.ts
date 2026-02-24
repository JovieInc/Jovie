import { type NextRequest, NextResponse } from 'next/server';
import { withSentryApiRoute } from '@/lib/sentry/api-wrapper';
import { logger } from '@/lib/utils/logger';

const routeName = '/api/waitlist-debug';

const handler = async (_request: NextRequest) => {
  logger.info('[Waitlist Debug] request received');
  return NextResponse.json({
    success: true,
    message: 'Debug endpoint working',
    timestamp: new Date().toISOString(),
  });
};

export const POST = withSentryApiRoute(handler, { routeName });
export const GET = withSentryApiRoute(handler, { routeName });
