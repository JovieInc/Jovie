import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { updateCreatorAvatarAsAdmin } from '@/app/app/(shell)/admin/actions';
import { captureCriticalError } from '@/lib/error-tracking';
import { getOvieOperatorEntitlements } from '@/lib/ovie/privacy-lock/access';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/** Schema for the admin avatar-update request body. */
const adminAvatarSchema = z.object({
  profileId: z.string().min(1),
  avatarUrl: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const entitlements = await getOvieOperatorEntitlements({
      session: 'fresh',
    });

    if (!entitlements.isAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    if (!entitlements.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = adminAvatarSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'profileId and avatarUrl are required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    await updateCreatorAvatarAsAdmin(
      parsed.data.profileId,
      parsed.data.avatarUrl
    );

    return NextResponse.json(
      { avatarUrl: parsed.data.avatarUrl },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const entitlements = await getOvieOperatorEntitlements({
      session: 'fresh',
    });
    await captureCriticalError(
      'Admin action failed: update creator avatar',
      error instanceof Error ? error : new Error(String(error)),
      {
        route: '/api/admin/creator-avatar',
        action: 'update_creator_avatar',
        adminEmail: entitlements.email,
        timestamp: new Date().toISOString(),
      }
    );

    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401, headers: NO_STORE_HEADERS }
        );
      }

      if (
        error.message === 'Avatar URL must use https' ||
        error.message === 'Avatar URL host is not allowed' ||
        error.message === 'profileId and avatarUrl are required' ||
        error.message === 'Invalid avatar URL provided'
      ) {
        return NextResponse.json(
          { error: error.message },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to update creator avatar' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
