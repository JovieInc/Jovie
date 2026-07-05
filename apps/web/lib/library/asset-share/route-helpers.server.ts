import 'server-only';

import { NextResponse } from 'next/server';
import type { ZodSchema } from 'zod';
import { getSessionContext } from '@/lib/auth/session';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
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

export async function runLibraryAssetShareMutation<
  T extends { profileId: string },
>(input: {
  readonly request: Request;
  readonly clerkUserId: string;
  readonly schema: ZodSchema<T>;
  readonly route: string;
  readonly captureMessage: string;
  readonly errorMessage: string;
  readonly mutate: (
    data: T,
    artistHandle: string
  ) => Promise<LibraryAssetShareViewModel>;
}): Promise<NextResponse> {
  try {
    const parsed = await parseLibraryAssetShareRequest(
      input.request,
      input.schema
    );
    if (!parsed.ok) return parsed.response;

    const actor = await resolveLibraryAssetShareActor(
      input.clerkUserId,
      parsed.data.profileId
    );
    if (!actor.ok) return actor.response;

    const share = await input.mutate(parsed.data, actor.artistHandle);

    return NextResponse.json(
      { ok: true, share },
      { headers: NO_STORE_HEADERS }
    );
  } catch (caughtError) {
    await captureError(input.captureMessage, caughtError, {
      route: input.route,
    });
    return NextResponse.json(
      { error: input.errorMessage },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
