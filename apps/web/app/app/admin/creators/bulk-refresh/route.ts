import { NextRequest, NextResponse } from 'next/server';

import { bulkRerunCreatorIngestionAction } from '@/app/admin/actions';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureCriticalError } from '@/lib/error-tracking';

export const runtime = 'nodejs';

type BulkRefreshPayload = {
  profileIds?: string[];
};

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(item => typeof item === 'string' && item.length > 0)
  );
}

async function parseRequestPayload(
  request: NextRequest
): Promise<{ profileIds: string[] }> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await request.json()) as BulkRefreshPayload;

    if (!isStringArray(payload.profileIds)) {
      throw new Error('profileIds is required');
    }

    return { profileIds: payload.profileIds };
  }

  const formData = await request.formData();
  const profileIdsRaw = formData.get('profileIds');

  if (typeof profileIdsRaw !== 'string' || profileIdsRaw.length === 0) {
    throw new Error('profileIds is required');
  }

  const parsed = JSON.parse(profileIdsRaw) as unknown;
  if (!isStringArray(parsed)) {
    throw new Error('profileIds must be an array');
  }

  return { profileIds: parsed };
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
    const { profileIds } = await parseRequestPayload(request);

    const actionFormData = new FormData();
    actionFormData.set('profileIds', JSON.stringify(profileIds));

    const result = await bulkRerunCreatorIngestionAction(actionFormData);

    if (wantsJson) {
      return NextResponse.json({
        success: true,
        queuedCount: result.queuedCount,
      });
    }

    const redirectUrl = new URL('/app/admin/creators', request.url);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    await captureCriticalError(
      'Admin action failed: bulk refresh creators',
      error instanceof Error ? error : new Error(String(error)),
      {
        route: '/api/admin/creators/bulk-refresh',
        action: 'bulk_refresh_creators',
        adminEmail: entitlements.email,
        timestamp: new Date().toISOString(),
      }
    );

    if (wantsJson) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to queue ingestion jobs';
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 }
      );
    }

    const redirectUrl = new URL('/app/admin/creators', request.url);
    return NextResponse.redirect(redirectUrl);
  }
}
