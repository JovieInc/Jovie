import { NextRequest, NextResponse } from 'next/server';

import { approveWaitlistEntryAction } from '@/app/admin/actions';

export const runtime = 'nodejs';

type ApproveWaitlistPayload = {
  entryId?: string;
};

async function parseRequestPayload(
  request: NextRequest
): Promise<{ entryId: string }> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await request.json()) as ApproveWaitlistPayload;

    if (!payload.entryId) {
      throw new Error('entryId is required');
    }

    return {
      entryId: payload.entryId,
    };
  }

  const formData = await request.formData();
  const entryId = formData.get('entryId');

  if (typeof entryId !== 'string' || entryId.length === 0) {
    throw new Error('entryId is required');
  }

  return { entryId };
}

export async function POST(request: NextRequest) {
  const wantsJson =
    (request.headers.get('accept') ?? '').includes('application/json') ||
    (request.headers.get('content-type') ?? '').includes('application/json');

  try {
    const { entryId } = await parseRequestPayload(request);

    const actionFormData = new FormData();
    actionFormData.set('entryId', entryId);

    await approveWaitlistEntryAction(actionFormData);

    if (wantsJson) {
      return NextResponse.json({ success: true, status: 'invited' });
    }

    const redirectUrl = new URL('/app/admin/waitlist', request.url);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Admin waitlist approve error:', error);

    if (wantsJson) {
      const message =
        error instanceof Error ? error.message : 'Failed to approve waitlist';
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }

    const redirectUrl = new URL('/app/admin/waitlist', request.url);
    return NextResponse.redirect(redirectUrl);
  }
}
