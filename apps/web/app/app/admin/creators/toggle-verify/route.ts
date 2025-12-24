import { NextRequest, NextResponse } from 'next/server';
import { toggleCreatorVerifiedAction } from '@/app/admin/actions';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureCriticalError } from '@/lib/error-tracking';

export const runtime = 'nodejs';

type ToggleVerifyPayload = {
  profileId?: string;
  nextVerified?: boolean;
};

async function parseRequestPayload(
  request: NextRequest
): Promise<{ profileId: string; nextVerified: boolean }> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await request.json()) as ToggleVerifyPayload;

    if (!payload.profileId || typeof payload.nextVerified !== 'boolean') {
      throw new Error('profileId and nextVerified are required');
    }

    return {
      profileId: payload.profileId,
      nextVerified: payload.nextVerified,
    };
  }

  const formData = await request.formData();
  const profileId = formData.get('profileId');
  const nextVerified = formData.get('nextVerified');

  if (typeof profileId !== 'string' || profileId.length === 0) {
    throw new Error('profileId is required');
  }

  const isVerified =
    typeof nextVerified === 'string' ? nextVerified === 'true' : true;

  return {
    profileId,
    nextVerified: isVerified,
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
    const { profileId, nextVerified } = await parseRequestPayload(request);

    const actionFormData = new FormData();
    actionFormData.set('profileId', profileId);
    actionFormData.set('nextVerified', nextVerified ? 'true' : 'false');

    await toggleCreatorVerifiedAction(actionFormData);

    if (wantsJson) {
      return NextResponse.json({ success: true, isVerified: nextVerified });
    }

    const redirectUrl = new URL('/app/admin/creators', request.url);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    await captureCriticalError(
      'Admin action failed: toggle creator verification',
      error instanceof Error ? error : new Error(String(error)),
      {
        route: '/api/admin/creators/toggle-verify',
        action: 'toggle_verify_creator',
        adminEmail: entitlements.email,
        timestamp: new Date().toISOString(),
      }
    );

    if (wantsJson) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to update verification';
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 }
      );
    }

    const redirectUrl = new URL('/app/admin/creators', request.url);
    return NextResponse.redirect(redirectUrl);
  }
}
