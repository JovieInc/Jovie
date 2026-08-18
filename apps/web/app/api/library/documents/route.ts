import { NextResponse } from 'next/server';
import {
  getSessionContext,
  isUnauthorizedSessionError,
} from '@/lib/auth/session';
import { requireCreatorDocumentAccess } from '@/lib/creator-documents/access';
import { saveIdeaInputSchema } from '@/lib/creator-documents/domain';
import {
  captureCreatorIdea,
  listCreatorDocuments,
} from '@/lib/db/creator-documents/store';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { profile, user } = await getSessionContext({ requireProfile: true });
    await requireCreatorDocumentAccess({
      userId: user.id,
      profileId: profile!.id,
    });
    const cursor = new URL(request.url).searchParams.get('cursor');
    const page = await listCreatorDocuments(profile!.id, { cursor });
    return NextResponse.json(page, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (isUnauthorizedSessionError(error)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    await captureError('Private creator documents load failed', error, {
      route: '/api/library/documents',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Unable to load documents' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { profile, user } = await getSessionContext({ requireProfile: true });
    await requireCreatorDocumentAccess({
      userId: user.id,
      profileId: profile!.id,
    });
    const parsed = saveIdeaInputSchema.safeParse(
      await request.json().catch(() => undefined)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Enter a title and idea before saving' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const saved = await captureCreatorIdea({
      ...parsed.data,
      creatorProfileId: profile!.id,
      userId: user!.id,
    });
    return NextResponse.json(saved, {
      status: saved.deduplicated ? 200 : 201,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    if (isUnauthorizedSessionError(error)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    await captureError('Private creator idea save failed', error, {
      route: '/api/library/documents',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Idea was not saved' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
