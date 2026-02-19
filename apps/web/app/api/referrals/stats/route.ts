/**
 * Referral Stats API
 *
 * GET - Get the current user's referral statistics and earnings.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  DEFAULT_COMMISSION_DURATION_MONTHS,
  DEFAULT_COMMISSION_RATE_BPS,
  formatCommissionRate,
} from '@/lib/referrals/config';
import { getInternalUserId, getReferralStats } from '@/lib/referrals/service';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Look up internal user ID
    const internalUserId = await getInternalUserId(clerkUserId);

    if (!internalUserId) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const stats = await getReferralStats(internalUserId);

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
    return NextResponse.json(
      { error: 'Failed to get referral stats' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
