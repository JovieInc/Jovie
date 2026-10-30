import { NextResponse } from 'next/server';
import { z } from 'zod';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  LibraryRelationshipWriteError,
  requireLibraryProfileAccess,
  tagMerchInYouTubeVideo,
  untagMerchInYouTubeVideo,
} from '@/lib/library/track-drawer.server';

export const runtime = 'nodejs';

const mutationSchema = z.object({
  creatorProfileId: z.string().uuid(),
  videoId: z.string().min(1),
  merchCardId: z.string().uuid(),
});

async function readMutation(request: Request) {
  const parsed = mutationSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return {
      error: NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }
  const auth = await requireLibraryProfileAccess(parsed.data.creatorProfileId);
  if (auth.error) return auth;
  return { data: parsed.data };
}

export async function POST(request: Request) {
  try {
    const auth = await readMutation(request);
    if ('error' in auth) return auth.error;
    return NextResponse.json(
      { relationship: await tagMerchInYouTubeVideo(auth.data) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof LibraryRelationshipWriteError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.code === 'not_found' ? 404 : 409,
          headers: NO_STORE_HEADERS,
        }
      );
    }
    await captureError('Library relationship POST failed', error, {
      route: '/api/library/relationships',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await readMutation(request);
    if ('error' in auth) return auth.error;
    await untagMerchInYouTubeVideo(auth.data);
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof LibraryRelationshipWriteError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    await captureError('Library relationship DELETE failed', error, {
      route: '/api/library/relationships',
      method: 'DELETE',
    });
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
