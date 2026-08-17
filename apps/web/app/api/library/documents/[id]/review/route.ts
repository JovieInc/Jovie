import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getSessionContext,
  isUnauthorizedSessionError,
} from '@/lib/auth/session';
import { requireCreatorDocumentAccess } from '@/lib/creator-documents/access';
import {
  CreatorDocumentConflictError,
  completeCreatorEvidenceReview,
} from '@/lib/db/creator-documents/store';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

const reviewSchema = z.object({ revision: z.number().int().positive() });

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
    const parsed = reviewSchema.safeParse(
      await request.json().catch(() => undefined)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid revision' },
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
    await completeCreatorEvidenceReview({
      creatorProfileId: profile!.id,
      documentId: id,
      revision: parsed.data.revision,
    });
    return NextResponse.json(
      { stage: 'evidence_review' },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (isUnauthorizedSessionError(error)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    if (
      error instanceof CreatorDocumentConflictError &&
      error.code === 'evidence_incomplete'
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    await captureError('Creator evidence review failed', error, {
      route: '/api/library/documents/[id]/review',
    });
    return NextResponse.json(
      { error: 'Evidence review was not completed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
