import { NextResponse } from 'next/server';
import { updateAllowArtworkDownloads } from '@/app/app/(shell)/dashboard/releases/actions';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';

// Use Node.js runtime for compatibility with DB libs used by the server action.
export const runtime = 'nodejs';

interface ArtworkDownloadsBody {
  allowDownloads?: unknown;
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody<ArtworkDownloadsBody | null>(request, {
    route: 'POST /api/dashboard/releases/artwork-downloads',
  });
  if (!parsed.ok) {
    return parsed.response;
  }

  const allowDownloads = parsed.data?.allowDownloads;
  if (typeof allowDownloads !== 'boolean') {
    return NextResponse.json(
      { success: false, error: 'allowDownloads must be a boolean' },
      { status: 400 }
    );
  }

  try {
    await updateAllowArtworkDownloads(allowDownloads);
    return NextResponse.json({ success: true });
  } catch (error) {
    await captureError(
      'POST /api/dashboard/releases/artwork-downloads failed',
      error,
      {
        route: '/api/dashboard/releases/artwork-downloads',
        method: 'POST',
      }
    );
    return NextResponse.json(
      { success: false, error: 'Something went wrong' },
      { status: 500 }
    );
  }
}
