import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema/leads';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { ingestLeadAsCreator } from '@/lib/leads/ingest-lead';
import { leadStatusUpdateSchema } from '@/lib/validation/lead-schemas';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';

/**
 * PATCH /api/admin/leads/[id] — Update lead status (approve/reject).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  if (!entitlements.isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const { id } = await params;
    const parsed = await parseJsonBody(request, {
      route: '/api/admin/leads/[id]',
    });
    if (!parsed.ok) return parsed.response;

    const validated = leadStatusUpdateSchema.safeParse(parsed.data);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validated.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const now = new Date();
    const timestampField =
      validated.data.status === 'approved' ? 'approvedAt' : 'rejectedAt';

    const [updated] = await db
      .update(leads)
      .set({
        status: validated.data.status,
        [timestampField]: now,
        updatedAt: now,
      })
      .where(eq(leads.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // Auto-ingest on approval: create a creator profile from the Linktree data
    let ingestion = null;
    if (validated.data.status === 'approved' && updated.linktreeUrl) {
      try {
        ingestion = await ingestLeadAsCreator(updated);
      } catch (ingestError) {
        await captureError('Lead auto-ingest failed', ingestError, {
          route: '/api/admin/leads/[id]',
          contextData: { leadId: id },
        });
        ingestion = {
          success: false,
          error:
            ingestError instanceof Error
              ? ingestError.message
              : 'Ingestion failed',
        };
      }
    }

    return NextResponse.json(
      { ...updated, ingestion },
      {
        status: 200,
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    const { id } = await params;
    await captureError('Failed to update lead', error, {
      route: '/api/admin/leads/[id]',
      contextData: { id },
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to update lead') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * DELETE /api/admin/leads/[id] — Remove a lead.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  if (!entitlements.isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const { id } = await params;
    const [deleted] = await db
      .delete(leads)
      .where(eq(leads.id, id))
      .returning({ id: leads.id });

    if (!deleted) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: true },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const { id } = await params;
    await captureError('Failed to delete lead', error, {
      route: '/api/admin/leads/[id]',
      contextData: { id },
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to delete lead') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
