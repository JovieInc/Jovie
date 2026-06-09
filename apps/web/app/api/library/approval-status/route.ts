import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  getLibraryApprovalStatusForAsset,
  isLibraryApprovalStatus,
  upsertLibraryApprovalStatus,
} from '@/lib/library/approval-status';

export const runtime = 'nodejs';

const updateSchema = z.object({
  profileId: z.string().uuid(),
  assetId: z.string().min(1),
  itemKind: z.enum(['release', 'merch', 'image', 'video', 'audio']),
  approvalStatus: z.enum(['draft', 'needs_review', 'approved', 'archived']),
});

export async function PATCH(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  try {
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.format() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { profileId, assetId, itemKind, approvalStatus } = parsed.data;
    const { profile } = await getSessionContext({
      clerkUserId,
      requireUser: true,
      requireProfile: false,
    });

    if (!profile || profile.id !== profileId) {
      return NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const savedStatus = await upsertLibraryApprovalStatus({
      creatorProfileId: profileId,
      assetId,
      itemKind,
      approvalStatus,
    });

    return NextResponse.json(
      {
        ok: true,
        assetId,
        approvalStatus: savedStatus,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (caughtError) {
    await captureError('Library approval status update failed', caughtError, {
      route: '/api/library/approval-status',
    });
    return NextResponse.json(
      { error: 'Failed to update approval status' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function GET(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  try {
    const profileId = request.nextUrl.searchParams.get('profileId');
    const assetId = request.nextUrl.searchParams.get('assetId');

    if (!profileId || !assetId) {
      return NextResponse.json(
        { error: 'profileId and assetId are required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { profile } = await getSessionContext({
      clerkUserId,
      requireUser: true,
      requireProfile: false,
    });

    if (!profile || profile.id !== profileId) {
      return NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const approvalStatus = await getLibraryApprovalStatusForAsset({
      creatorProfileId: profileId,
      assetId,
    });

    if (!isLibraryApprovalStatus(approvalStatus)) {
      return NextResponse.json(
        { error: 'Invalid approval status' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        assetId,
        approvalStatus,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (caughtError) {
    await captureError('Library approval status lookup failed', caughtError, {
      route: '/api/library/approval-status',
    });
    return NextResponse.json(
      { error: 'Failed to load approval status' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
