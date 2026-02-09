import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/lib/auth/session';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { updateInsightStatus } from '@/lib/services/insights/lifecycle';

const updateSchema = z.object({
  status: z.enum(['dismissed', 'acted_on']),
});

/**
 * PATCH /api/insights/[id]
 *
 * Updates the status of an insight (dismiss or mark as acted on).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile } = await getSessionContext({ requireProfile: true });

    if (!profile) {
      return NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const { id: insightId } = await params;

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(insightId)) {
      return NextResponse.json(
        { error: 'Invalid insight ID' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const updated = await updateInsightStatus(
      insightId,
      profile.id,
      parsed.data.status
    );

    if (!updated) {
      return NextResponse.json(
        { error: 'Insight not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    Sentry.captureException(error, {
      tags: { route: '/api/insights/[id]', method: 'PATCH' },
    });

    return NextResponse.json(
      { error: 'Failed to update insight' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
