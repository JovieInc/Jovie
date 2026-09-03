import 'server-only';

import { handleUploadPresigned } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

type GetBlobPresignedToken = NonNullable<
  Parameters<typeof handleUploadPresigned>[0]['getSignedToken']
>;

const CLIENT_ERROR_MESSAGES = new Set([
  'Creator profile not found',
  'Invalid audio upload pathname',
  'Pro plan required for promo downloads',
]);

export async function handleBlobPresignedUploadTokenRequest(
  request: NextRequest,
  getSignedToken: GetBlobPresignedToken
) {
  try {
    const body = await request.json();
    const response = await handleUploadPresigned({
      body,
      request,
      getSignedToken,
    });

    return NextResponse.json(response, { headers: NO_STORE_HEADERS });
  } catch (err) {
    const isClientError =
      err instanceof Error && CLIENT_ERROR_MESSAGES.has(err.message);
    const message =
      isClientError && err instanceof Error ? err.message : 'Upload failed';

    return NextResponse.json(
      { error: message },
      { status: isClientError ? 400 : 500, headers: NO_STORE_HEADERS }
    );
  }
}
