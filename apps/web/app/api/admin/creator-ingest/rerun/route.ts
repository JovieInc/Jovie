import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { requireOvieApiAccess } from '@/lib/ovie/privacy-lock/access';
import { logger } from '@/lib/utils/logger';
import { ingestionRerunSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: Request) {
  try {
    const denied = await requireOvieApiAccess({ privileged: true });
    if (denied) return denied;

    const parsedBody = await parseJsonBody<unknown>(request, {
      route: 'POST /api/admin/creator-ingest/rerun',
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const body = parsedBody.data;
    const parsed = ingestionRerunSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: 'Linktree import requires an official API integration' },
      { status: 422, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Failed to rerun ingestion job', error);
    await captureError('Admin creator re-ingest failed', error, {
      route: '/api/admin/creator-ingest/rerun',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Failed to queue ingestion job' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
