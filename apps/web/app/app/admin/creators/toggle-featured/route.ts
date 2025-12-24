import { NextRequest, NextResponse } from 'next/server';
import { toggleCreatorFeaturedAction } from '@/app/admin/actions';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureCriticalError } from '@/lib/error-tracking';

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

  // Check admin authorization
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAdmin) {
    if (wantsJson) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - admin access required' },
        { status: 403 }
      );
    }
    const redirectUrl = new URL('/app/dashboard/overview', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const { profileId, nextFeatured } = await parseRequestPayload(request);

    const actionFormData = new FormData();
    actionFormData.set('profileId', profileId);
    actionFormData.set('nextFeatured', nextFeatured ? 'true' : 'false');

    await toggleCreatorFeaturedAction(actionFormData);

    if (wantsJson) {
      return NextResponse.json({ success: true, isFeatured: nextFeatured });
    }

    const redirectUrl = new URL('/app/admin/creators', request.url);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    await captureCriticalError(
      'Admin action failed: toggle creator featured status',
      error instanceof Error ? error : new Error(String(error)),
      {
        route: '/api/admin/creators/toggle-featured',
        action: 'toggle_featured_creator',
        adminEmail: entitlements.email,
        timestamp: new Date().toISOString(),
      }
    );

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

    const redirectUrl = new URL('/app/admin/creators', request.url);
    return NextResponse.redirect(redirectUrl);
  }
}
