/**
 * Apply Referral Code API
 *
 * POST - Apply a referral code to the current user.
 * Called during signup/onboarding when the user arrives via a referral link.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createReferral, getInternalUserId } from '@/lib/referrals/service';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

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
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const codeRaw = (body as { code?: unknown }).code;
    const code = typeof codeRaw === 'string' ? codeRaw.trim() : '';

    if (!code) {
      return NextResponse.json(
        { error: 'Referral code is required' },
        { status: 400, headers: NO_STORE_HEADERS }
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

    const result = await createReferral(internalUserId, code);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('Error applying referral code:', error);
    return NextResponse.json(
      { error: 'Failed to apply referral code' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
