import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getSessionContext,
  isUnauthorizedSessionError,
} from '@/lib/auth/session';
import { requireCreatorDocumentAccess } from '@/lib/creator-documents/access';
import {
  addCreatorRevisionClaim,
  CreatorDocumentConflictError,
} from '@/lib/db/creator-documents/store';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

const claimSchema = z
  .object({
    revision: z.number().int().positive(),
    claimText: z.string().trim().min(1).max(2_000),
    kind: z.enum(['fact', 'inference', 'opinion', 'anecdote']),
    evidenceState: z.enum(['supported', 'contested', 'unresolved']),
    sourceRecordId: z.string().uuid().nullable(),
  })
  .superRefine((claim, context) => {
    if (claim.evidenceState === 'supported' && !claim.sourceRecordId) {
      context.addIssue({
        code: 'custom',
        path: ['sourceRecordId'],
        message: 'Supported claims require a source',
      });
    }
  });

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly id: string }> }
) {
  try {
    const { profile, user } = await getSessionContext({ requireProfile: true });
    await requireCreatorDocumentAccess({
      userId: user.id,
      profileId: profile!.id,
    });
    const parsed = claimSchema.safeParse(
      await request.json().catch(() => undefined)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid claim evidence' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json(
        { error: 'Invalid document' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const claimId = await addCreatorRevisionClaim({
      ...parsed.data,
      creatorProfileId: profile!.id,
      userId: user!.id,
      documentId: id,
    });
    return NextResponse.json(
      { claimId },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (isUnauthorizedSessionError(error)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    if (error instanceof CreatorDocumentConflictError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    await captureError('Creator claim evidence save failed', error, {
      route: '/api/library/documents/[id]/claims',
    });
    return NextResponse.json(
      { error: 'Claim evidence was not saved' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
