import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema/leads';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { ingestLeadAsCreator } from '@/lib/leads/ingest-lead';
import { pushLeadToInstantly } from '@/lib/leads/instantly';
import { pipelineLog } from '@/lib/leads/pipeline-logger';
import { routeLead } from '@/lib/leads/route-lead';
import { spotifyEnrichLead } from '@/lib/leads/spotify-enrich-lead';
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

    pipelineLog('approve', `Lead ${validated.data.status}`, { leadId: id });

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

    // Outreach routing on approval
    let routing = null;
    if (validated.data.status === 'approved') {
      try {
        // Enrich with Spotify data for priority scoring
        pipelineLog('approve', 'Starting Spotify enrichment', { leadId: id });
        await spotifyEnrichLead(id);

        // Route the lead (email, dm, both, manual_review, or skipped)
        pipelineLog('approve', 'Starting lead routing', { leadId: id });
        const routeResult = await routeLead(id);
        routing = { route: routeResult.route };
        pipelineLog('approve', 'Lead routed', {
          leadId: id,
          route: routeResult.route,
        });

        const [routedLead] = await db
          .select()
          .from(leads)
          .where(eq(leads.id, id))
          .limit(1);

        // Push to Instantly if email route and lead has a valid email
        pipelineLog('approve', 'Checking Instantly eligibility', {
          leadId: id,
          route: routeResult.route,
          hasEmail: !!routedLead?.contactEmail,
          emailInvalid: routedLead?.emailInvalid,
        });
        if (
          routedLead?.contactEmail &&
          !routedLead.emailInvalid &&
          (routeResult.route === 'email' || routeResult.route === 'both')
        ) {
          try {
            const instantlyLeadId = await pushLeadToInstantly({
              email: routedLead.contactEmail,
              firstName: routedLead.displayName ?? routedLead.linktreeHandle,
              claimLink: routeResult.claimUrl,
              artistName: routedLead.displayName ?? routedLead.linktreeHandle,
              priorityScore: routedLead.priorityScore ?? 0,
            });

            const queuedNow = new Date();
            await db
              .update(leads)
              .set({
                instantlyLeadId,
                outreachStatus: 'queued',
                outreachQueuedAt: queuedNow,
                updatedAt: queuedNow,
              })
              .where(eq(leads.id, id));

            routing = { ...routing, instantlyLeadId, outreachStatus: 'queued' };
          } catch (instantlyError) {
            await captureError('Instantly push failed', instantlyError, {
              route: '/api/admin/leads/[id]',
              contextData: { leadId: id },
            });
            routing = {
              ...routing,
              instantlyError:
                instantlyError instanceof Error
                  ? instantlyError.message
                  : 'Instantly push failed',
            };
          }
        }
      } catch (routingError) {
        await captureError('Lead routing failed', routingError, {
          route: '/api/admin/leads/[id]',
          contextData: { leadId: id },
        });
        routing = {
          error:
            routingError instanceof Error
              ? routingError.message
              : 'Routing failed',
        };
      }
    }

    return NextResponse.json(
      { ...updated, ingestion, routing },
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
