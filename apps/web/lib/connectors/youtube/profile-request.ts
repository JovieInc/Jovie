import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { db } from '@/lib/db';

const profileMutationBodySchema = z.object({
  creatorProfileId: z.string().uuid(),
});

export type YouTubeProfileMutationValidation =
  | {
      readonly ok: true;
      readonly userId: string;
      readonly creatorProfileId: string;
    }
  | { readonly ok: false; readonly response: NextResponse };

export async function validateYouTubeProfileMutationRequest(
  request: Request
): Promise<YouTubeProfileMutationValidation> {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const parsed = profileMutationBodySchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid payload' }, { status: 400 }),
    };
  }

  const access = await getExactProfileAccess(
    db,
    userId,
    parsed.data.creatorProfileId
  );
  if (!access.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true,
    userId,
    creatorProfileId: parsed.data.creatorProfileId,
  };
}
