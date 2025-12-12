import { NextRequest, NextResponse } from 'next/server';
import { toggleCreatorFeaturedAction } from '@/app/admin/actions';

export const runtime = 'nodejs';

type ToggleFeaturedPayload = {
  profileId?: string;
  nextFeatured?: boolean;
};

async function parseRequestPayload(
  request: NextRequest
): Promise<{ profileId: string; nextFeatured: boolean }> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await request.json()) as ToggleFeaturedPayload;

    if (!payload.profileId || typeof payload.nextFeatured !== 'boolean') {
      throw new Error('profileId and nextFeatured are required');
    }

    return {
      profileId: payload.profileId,
      nextFeatured: payload.nextFeatured,
    };
  }

  const formData = await request.formData();
  const profileId = formData.get('profileId');
  const nextFeatured = formData.get('nextFeatured');

  if (typeof profileId !== 'string' || profileId.length === 0) {
    throw new Error('profileId is required');
  }

  const isFeatured =
    typeof nextFeatured === 'string' ? nextFeatured === 'true' : true;

  return {
    profileId,
    nextFeatured: isFeatured,
  };
}

export async function POST(request: NextRequest) {
  const wantsJson =
    (request.headers.get('accept') ?? '').includes('application/json') ||
    (request.headers.get('content-type') ?? '').includes('application/json');

  try {
    const { profileId, nextFeatured } = await parseRequestPayload(request);

    const actionFormData = new FormData();
    actionFormData.set('profileId', profileId);
    actionFormData.set('nextFeatured', nextFeatured ? 'true' : 'false');

    await toggleCreatorFeaturedAction(actionFormData);

    if (wantsJson) {
      return NextResponse.json({ success: true, isFeatured: nextFeatured });
    }

    const redirectUrl = new URL('/admin/users', request.url);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Admin toggle featured error:', error);

    if (wantsJson) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to update featured status';
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 }
      );
    }

    const redirectUrl = new URL('/admin/users', request.url);
    return NextResponse.redirect(redirectUrl);
  }
}
