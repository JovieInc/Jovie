import { NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';

/**
 * Minimal debug endpoint to test if API routes are working
 * No auth, no validation, just returns a simple JSON response
 */
export async function POST() {
  logger.info('[Waitlist Debug] POST request received');
  return NextResponse.json({
    success: true,
    message: 'Debug endpoint working',
    timestamp: new Date().toISOString(),
  });
}

export async function GET() {
  logger.info('[Waitlist Debug] GET request received');
  return NextResponse.json({
    success: true,
    message: 'Debug endpoint working',
    timestamp: new Date().toISOString(),
  });
}
