import { NextRequest, NextResponse } from 'next/server';

import { bulkSetCreatorsVerifiedAction } from '@/app/admin/actions';

export const runtime = 'nodejs';

type BulkVerifyPayload = {
  profileIds?: string[];
  nextVerified?: boolean;
};

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(item => typeof item === 'string' && item.length > 0)
  );
}

async function parseRequestPayload(
  request: NextRequest
): Promise<{ profileIds: string[]; nextVerified: boolean }> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await request.json()) as BulkVerifyPayload;

    if (
      !isStringArray(payload.profileIds) ||
      typeof payload.nextVerified !== 'boolean'
    ) {
      throw new Error('profileIds and nextVerified are required');
    }

    return {
      profileIds: payload.profileIds,
      nextVerified: payload.nextVerified,
    };
  }

  const formData = await request.formData();
  const profileIdsRaw = formData.get('profileIds');
  const nextVerified = formData.get('nextVerified');

  if (typeof profileIdsRaw !== 'string' || profileIdsRaw.length === 0) {
    throw new Error('profileIds is required');
  }

  const parsed = JSON.parse(profileIdsRaw) as unknown;
  if (!isStringArray(parsed)) {
    throw new Error('profileIds must be an array');
  }

  const isVerified =
    typeof nextVerified === 'string' ? nextVerified === 'true' : true;

  return {
    profileIds: parsed,
    nextVerified: isVerified,
  };
}

export async function POST(request: NextRequest) {
  const wantsJson =
    (request.headers.get('accept') ?? '').includes('application/json') ||
    (request.headers.get('content-type') ?? '').includes('application/json');

  try {
    const { profileIds, nextVerified } = await parseRequestPayload(request);

    const actionFormData = new FormData();
    actionFormData.set('profileIds', JSON.stringify(profileIds));
    actionFormData.set('nextVerified', nextVerified ? 'true' : 'false');

    await bulkSetCreatorsVerifiedAction(actionFormData);

    if (wantsJson) {
      return NextResponse.json({ success: true });
    }

    const redirectUrl = new URL('/app/admin/creators', request.url);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Admin creators bulk verify error:', error);

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
