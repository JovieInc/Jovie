import 'server-only';

import { NextResponse } from 'next/server';
import type { ZodSchema } from 'zod';
import { getSessionContext } from '@/lib/auth/session';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { loadArtistHandleForProfile } from '@/lib/library/asset-share.server';

export async function parseLibraryAssetShareRequest<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly response: NextResponse }
> {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid request', details: parsed.error.format() },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

export async function resolveLibraryAssetShareActor(
  clerkUserId: string,
  profileId: string
): Promise<
  | { readonly ok: true; readonly artistHandle: string }
  | { readonly ok: false; readonly response: NextResponse }
> {
  const { profile } = await getSessionContext({
    clerkUserId,
    requireUser: true,
    requireProfile: false,
  });

  if (!profile || profile.id !== profileId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 403, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const artistHandle = await loadArtistHandleForProfile(profileId);
  if (!artistHandle) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Artist handle not found' },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return { ok: true, artistHandle };
}
