import { NextRequest, NextResponse } from 'next/server';

import { updateCreatorAvatarAsAdmin } from '@/app/admin/actions';
import {
  AdminAuthError,
  getAdminAuthStatusCode,
  requireAdmin,
} from '@/lib/admin/require-admin';

export const runtime = 'nodejs';

interface AdminAvatarPayload {
  profileId?: string;
  avatarUrl?: string;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = (await request
      .json()
      .catch(() => null)) as AdminAvatarPayload | null;

    if (!body || !body.profileId || !body.avatarUrl) {
      return NextResponse.json(
        { error: 'profileId and avatarUrl are required' },
        { status: 400 }
      );
    }

    await updateCreatorAvatarAsAdmin(body.profileId, body.avatarUrl);

    return NextResponse.json({ avatarUrl: body.avatarUrl }, { status: 200 });
  } catch (error) {
    console.error('Admin avatar update error', error);

    if (error instanceof AdminAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: getAdminAuthStatusCode(error.code) }
      );
    }

    if (error instanceof Error) {
      if (
        error.message === 'Avatar URL must use https' ||
        error.message === 'Avatar URL host is not allowed' ||
        error.message === 'profileId and avatarUrl are required' ||
        error.message === 'Invalid avatar URL provided'
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json(
      { error: 'Failed to update creator avatar' },
      { status: 500 }
    );
  }
}
