import { NextResponse } from 'next/server';
import {
  getSessionContext,
  isUnauthorizedSessionError,
} from '@/lib/auth/session';
import { requireCreatorDocumentAccess } from '@/lib/creator-documents/access';
import { saveRevisionInputSchema } from '@/lib/creator-documents/domain';
import {
  CreatorDocumentConflictError,
  saveCreatorDocumentRevision,
} from '@/lib/db/creator-documents/store';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  context: { readonly params: Promise<{ readonly id: string }> }
) {
  try {
    const { profile, user } = await getSessionContext({ requireProfile: true });
    await requireCreatorDocumentAccess({
      userId: user.id,
      profileId: profile!.id,
    });
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = saveRevisionInputSchema.safeParse(
      body && typeof body === 'object'
        ? { ...body, documentId: id }
        : { documentId: id }
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid document revision' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const revision = await saveCreatorDocumentRevision({
      ...parsed.data,
      creatorProfileId: profile!.id,
      userId: user!.id,
    });
    return NextResponse.json({ revision }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (isUnauthorizedSessionError(error)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    if (
      error instanceof CreatorDocumentConflictError &&
      error.code === 'revision_conflict'
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    await captureError('Private creator document revision save failed', error, {
      route: '/api/library/documents/[id]',
      method: 'PATCH',
    });
    return NextResponse.json(
      { error: 'Document was not saved' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
