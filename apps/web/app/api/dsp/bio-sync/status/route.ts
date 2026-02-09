/**
 * GET /api/dsp/bio-sync/status?profileId=<uuid>
 *
 * Returns the latest bio sync status for each DSP for a given creator profile.
 * Shows which DSPs have been synced, when, and whether they succeeded.
 *
 * Authentication: Required (creator must own the profile)
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { getOwnedProfile } from '@/lib/dsp-bio-sync/ownership';
import { getBioSyncStatus } from '@/lib/dsp-bio-sync/service';
import { captureError } from '@/lib/error-tracking';

export async function GET(request: Request) {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get profileId from query params
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get('profileId');

    if (!profileId) {
      return NextResponse.json(
        { success: false, error: 'profileId query parameter is required' },
        { status: 400 }
      );
    }

    // Verify user owns this profile
    const ownership = await getOwnedProfile(profileId, userId);
    if (ownership.status === 'not_found') {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    if (ownership.status === 'forbidden') {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have permission to view this profile',
        },
        { status: 403 }
      );
    }

    // Fetch sync status
    const syncStatus = await getBioSyncStatus(profileId);

    return NextResponse.json({
      success: true,
      profileId,
      syncStatus,
    });
  } catch (error) {
    await captureError('DSP Bio Sync status query failed', error, {
      route: '/api/dsp/bio-sync/status',
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
