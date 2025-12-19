import { NextRequest, NextResponse } from 'next/server';
import { toggleCreatorMarketingAction } from '@/app/admin/actions';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export const runtime = 'nodejs';

type ToggleMarketingPayload = {
  profileId?: string;
  nextMarketingOptOut?: boolean;
};

async function parseRequestPayload(
  request: NextRequest
): Promise<{ profileId: string; nextMarketingOptOut: boolean }> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await request.json()) as ToggleMarketingPayload;

    if (
      !payload.profileId ||
      typeof payload.nextMarketingOptOut !== 'boolean'
    ) {
      throw new Error('profileId and nextMarketingOptOut are required');
    }

    return {
      profileId: payload.profileId,
      nextMarketingOptOut: payload.nextMarketingOptOut,
    };
  }

  const formData = await request.formData();
  const profileId = formData.get('profileId');
  const nextMarketingOptOut = formData.get('nextMarketingOptOut');

  if (typeof profileId !== 'string' || profileId.length === 0) {
    throw new Error('profileId is required');
  }

  const marketingOptOut =
    typeof nextMarketingOptOut === 'string'
      ? nextMarketingOptOut === 'true'
      : false;

  return {
    profileId,
    nextMarketingOptOut: marketingOptOut,
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
    const { profileId, nextMarketingOptOut } =
      await parseRequestPayload(request);

    const actionFormData = new FormData();
    actionFormData.set('profileId', profileId);
    actionFormData.set(
      'nextMarketingOptOut',
      nextMarketingOptOut ? 'true' : 'false'
    );

    await toggleCreatorMarketingAction(actionFormData);

    if (wantsJson) {
      return NextResponse.json({
        success: true,
        marketingOptOut: nextMarketingOptOut,
      });
    }

    const redirectUrl = new URL('/app/admin/creators', request.url);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Admin toggle marketing error:', error);

    if (wantsJson) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to update marketing preferences';
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 }
      );
    }

    const redirectUrl = new URL('/app/admin/creators', request.url);
    return NextResponse.redirect(redirectUrl);
  }
}
