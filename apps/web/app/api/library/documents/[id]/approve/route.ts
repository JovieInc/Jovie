import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getSessionContext,
  isUnauthorizedSessionError,
} from '@/lib/auth/session';
import { requireCreatorDocumentAccess } from '@/lib/creator-documents/access';
import {
  approveCreatorRevisionForCapture,
  CreatorDocumentConflictError,
} from '@/lib/db/creator-documents/store';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

const approvalSchema = z.object({ revision: z.number().int().positive() });

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
      ownerOnly: true,
    });
    const parsed = approvalSchema.safeParse(
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
    await approveCreatorRevisionForCapture({
      creatorProfileId: profile!.id,
      userId: user!.id,
      documentId: id,
      revision: parsed.data.revision,
    });
    return NextResponse.json(
      { stage: 'capture_ready', handoff: 'JOV-5075' },
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
      error.code === 'approval_ineligible'
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    await captureError('Creator revision approval failed', error, {
      route: '/api/library/documents/[id]/approve',
    });
    return NextResponse.json(
      { error: 'Revision was not approved' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
