/**
 * Referral Code API
 *
 * GET  - Get the current user's referral code (or generate one)
 * POST - Generate a referral code with an optional custom code
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import {
  getInternalUserId,
  getOrCreateReferralCode,
} from '@/lib/referrals/service';
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

    const result = await getOrCreateReferralCode(internalUserId);

    return NextResponse.json(
      { code: result.code, isNew: result.isNew },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error getting referral code:', error);
    return NextResponse.json(
      { error: 'Failed to get referral code' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Safely parse JSON body
    const body: unknown = await request.json().catch(() => null);
    const customCodeRaw =
      body && typeof body === 'object'
        ? (body as { customCode?: unknown }).customCode
        : undefined;
    const customCode =
      typeof customCodeRaw === 'string' ? customCodeRaw.trim() : undefined;

    // Look up internal user ID
    const internalUserId = await getInternalUserId(clerkUserId);

    if (!internalUserId) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const result = await getOrCreateReferralCode(
      internalUserId,
      customCode || undefined
    );

    return NextResponse.json(
      { code: result.code, isNew: result.isNew },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error creating referral code:', error);

    // Only expose validation error messages, not internal errors
    if (
      error instanceof Error &&
      (error.message.startsWith('Code must be ') ||
        error.message === 'This referral code is already taken')
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create referral code' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
