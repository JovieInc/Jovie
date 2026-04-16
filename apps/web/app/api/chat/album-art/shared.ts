import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { getOptionalAuth } from '@/lib/auth/cached';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { FEATURE_FLAGS } from '@/lib/feature-flags/shared';

export async function requireAlbumArtUser() {
  const { userId } = await getOptionalAuth();

  if (!userId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  if (!FEATURE_FLAGS.ALBUM_ART_GENERATION) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Album art generation is currently unavailable.' },
        { status: 404 }
      ),
    };
  }

  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.canGenerateAlbumArt) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Album art generation requires a Pro plan.' },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, userId };
}

export async function parseAlbumArtRequestBody<TSchema extends z.ZodTypeAny>(
  req: Request,
  schema: TSchema
) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      ),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: 'Invalid request',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      ),
    };
  }

  return { ok: true as const, data: parsed.data as z.infer<TSchema> };
}
