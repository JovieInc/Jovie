import { type NextRequest, NextResponse } from 'next/server';
import { deleteCreatorOrUserAction } from '@/app/admin/actions';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureCriticalError } from '@/lib/error-tracking';

export const runtime = 'nodejs';

type DeletePayload = {
  profileId?: string;
};

async function parseRequestPayload(
  request: NextRequest
): Promise<{ profileId: string }> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await request.json()) as DeletePayload;

    if (!payload.profileId) {
      throw new Error('profileId is required');
    }

    return {
      profileId: payload.profileId,
    };
  }

  const formData = await request.formData();
  const profileId = formData.get('profileId');

  if (typeof profileId !== 'string' || profileId.length === 0) {
    throw new Error('profileId is required');
  }

  return {
    profileId,
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
    const { profileId } = await parseRequestPayload(request);

    const actionFormData = new FormData();
    actionFormData.set('profileId', profileId);

    await deleteCreatorOrUserAction(actionFormData);

    if (wantsJson) {
      return NextResponse.json({ success: true });
    }

    const redirectUrl = new URL('/app/admin/creators', request.url);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    await captureCriticalError(
      'Admin action failed: delete user',
      error instanceof Error ? error : new Error(String(error)),
      {
        route: '/api/admin/users/delete',
        action: 'delete_user',
        adminEmail: entitlements.email,
        timestamp: new Date().toISOString(),
      }
    );

    if (wantsJson) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to delete creator/user';
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 }
      );
    }

    const redirectUrl = new URL('/app/admin/creators', request.url);
    return NextResponse.redirect(redirectUrl);
  }
}
