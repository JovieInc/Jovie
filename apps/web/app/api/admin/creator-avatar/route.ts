import { NextRequest, NextResponse } from 'next/server';

import { updateCreatorAvatarAsAdmin } from '@/app/admin/actions';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

interface AdminAvatarPayload {
  profileId?: string;
  avatarUrl?: string;
}

export async function POST(request: NextRequest) {
  try {
    const entitlements = await getCurrentUserEntitlements();

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

    const body = (await request
      .json()
      .catch(() => null)) as AdminAvatarPayload | null;

    if (!body || !body.profileId || !body.avatarUrl) {
      return NextResponse.json(
        { error: 'profileId and avatarUrl are required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    await updateCreatorAvatarAsAdmin(body.profileId, body.avatarUrl);

    return NextResponse.json(
      { avatarUrl: body.avatarUrl },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Admin avatar update error', error);

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
