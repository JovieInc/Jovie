import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { createLibraryShareDrop } from '@/lib/library-share/service';

export const runtime = 'nodejs';

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().max(2000).optional().nullable(),
  layout: z.enum(['grid', 'list', 'reel']).optional(),
  downloadsEnabled: z.boolean().optional(),
  passphrase: z.string().trim().min(4).max(128).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  releaseIds: z.array(z.string().uuid()).min(1).max(50),
});

export async function POST(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.format() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { profile } = await getSessionContext({
      clerkUserId,
      requireUser: true,
      requireProfile: false,
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const result = await createLibraryShareDrop(profile.id, parsed.data);

    return NextResponse.json(result, {
      status: 201,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create share drop';

    if (message.includes('not available')) {
      return NextResponse.json(
        { error: message },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    void captureError('Failed to create library share drop', error);
    return NextResponse.json(
      { error: 'Failed to create share drop' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
