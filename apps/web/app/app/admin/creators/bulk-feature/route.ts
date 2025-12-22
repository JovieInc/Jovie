import { NextRequest, NextResponse } from 'next/server';

import { bulkSetCreatorsFeaturedAction } from '@/app/admin/actions';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export const runtime = 'nodejs';

type BulkFeaturePayload = {
  profileIds?: string[];
  nextFeatured?: boolean;
};

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(item => typeof item === 'string' && item.length > 0)
  );
}

async function parseRequestPayload(
  request: NextRequest
): Promise<{ profileIds: string[]; nextFeatured: boolean }> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await request.json()) as BulkFeaturePayload;

    if (
      !isStringArray(payload.profileIds) ||
      typeof payload.nextFeatured !== 'boolean'
    ) {
      throw new Error('profileIds and nextFeatured are required');
    }

    return {
      profileIds: payload.profileIds,
      nextFeatured: payload.nextFeatured,
    };
  }

  const formData = await request.formData();
  const profileIdsRaw = formData.get('profileIds');
  const nextFeatured = formData.get('nextFeatured');

  if (typeof profileIdsRaw !== 'string' || profileIdsRaw.length === 0) {
    throw new Error('profileIds is required');
  }

  const parsed = JSON.parse(profileIdsRaw) as unknown;
  if (!isStringArray(parsed)) {
    throw new Error('profileIds must be an array');
  }

  const isFeatured =
    typeof nextFeatured === 'string' ? nextFeatured === 'true' : true;

  return {
    profileIds: parsed,
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
    const { profileIds, nextFeatured } = await parseRequestPayload(request);

    const actionFormData = new FormData();
    actionFormData.set('profileIds', JSON.stringify(profileIds));
    actionFormData.set('nextFeatured', nextFeatured ? 'true' : 'false');

    await bulkSetCreatorsFeaturedAction(actionFormData);

    if (wantsJson) {
      return NextResponse.json({ success: true });
    }

    const redirectUrl = new URL('/app/admin/creators', request.url);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Admin creators bulk feature error:', error);

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
