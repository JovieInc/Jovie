/**
 * GET /api/dsp/matches
 *
 * Lists DSP artist matches for a creator profile.
 * Returns match suggestions with confidence scores from various providers.
 *
 * Query params:
 * - profileId: Required - Creator profile ID
 * - status: Optional - Filter by status (suggested, confirmed, rejected, auto_confirmed)
 *
 * Authentication: Required (creator must own the profile)
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { getDspMatchesForProfile } from '@/lib/dsp-enrichment/queries.server';
import type { DspMatchStatus } from '@/lib/dsp-enrichment/types';
import { captureError } from '@/lib/error-tracking';

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: Request) {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get('profileId');
    const statusFilter = searchParams.get('status') as DspMatchStatus | null;

    if (!profileId) {
      return NextResponse.json(
        { success: false, error: 'profileId is required' },
        { status: 400 }
      );
    }

    const matches = await getDspMatchesForProfile(
      profileId,
      userId,
      statusFilter ?? undefined
    );

    return NextResponse.json({
      success: true,
      matches,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';

    // Return 404/403 for known auth/ownership errors
    if (message === 'Profile not found') {
      return NextResponse.json(
        { success: false, error: message },
        { status: 404 }
      );
    }
    if (message.includes('permission')) {
      return NextResponse.json(
        { success: false, error: message },
        { status: 403 }
      );
    }

    await captureError('DSP Matches list failed', error, {
      route: '/api/dsp/matches',
    });

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
