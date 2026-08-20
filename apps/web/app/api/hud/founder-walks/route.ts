import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAccountVideoUrl } from '@/lib/capture/account-video';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { requireAdminHudApiAccess } from '@/lib/hud/require-admin-hud-api';

export const runtime = 'nodejs';

const confirmSchema = z.object({
  blobUrl: z.string().url(),
  durationMs: z
    .number()
    .int()
    .nonnegative()
    .max(4 * 60 * 60 * 1000),
  byteSize: z
    .number()
    .int()
    .nonnegative()
    .max(500 * 1024 * 1024),
});

export async function POST(request: NextRequest) {
  const denied = await requireAdminHudApiAccess();
  if (denied) return denied;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const parsed = confirmSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid walk receipt' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (!isAccountVideoUrl(parsed.data.blobUrl)) {
    return NextResponse.json(
      { error: 'Walk must be stored on the Jovie account blob' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      status: 'uploaded',
      admitted: false,
      blobUrl: parsed.data.blobUrl,
      durationMs: parsed.data.durationMs,
      byteSize: parsed.data.byteSize,
    },
    { headers: NO_STORE_HEADERS }
  );
}
