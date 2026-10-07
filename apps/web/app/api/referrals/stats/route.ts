/**
 * Referral Stats API
 *
 * GET - Get the current user's referral statistics and earnings.
 */

import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import {
  DEFAULT_COMMISSION_DURATION_MONTHS,
  DEFAULT_COMMISSION_RATE_BPS,
  formatCommissionRate,
} from '@/lib/referrals/config';
import { getReferralStats } from '@/lib/referrals/service';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET() {
  try {
    const { userId: appUserId } = await getCachedAuth();
    if (!appUserId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const stats = await getReferralStats(appUserId);

    return NextResponse.json(
      {
        ...stats,
        programTerms: {
          commissionRate: formatCommissionRate(DEFAULT_COMMISSION_RATE_BPS),
          commissionRateBps: DEFAULT_COMMISSION_RATE_BPS,
          durationMonths: DEFAULT_COMMISSION_DURATION_MONTHS,
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error getting referral stats:', error);
    captureError('Failed to get referral stats', error, {
      route: '/api/referrals/stats',
    });
    return NextResponse.json(
      { error: 'Failed to get referral stats' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
