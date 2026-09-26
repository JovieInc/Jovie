import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { type Lead, leads } from '@/lib/db/schema/leads';
import { captureError } from '@/lib/error-tracking';
import { recordLeadFunnelEvent } from './funnel-events';
import { ingestLeadAsCreator } from './ingest-lead';
import { pipelineLog, pipelineWarn } from './pipeline-logger';
import { routeLead } from './route-lead';
import { spotifyEnrichLead } from './spotify-enrich-lead';

export interface ApproveLeadResult {
  ingestion: { success: boolean; profileId?: string; error?: string } | null;
  routing: {
    route?: string;
    error?: string;
  } | null;
}

async function trySpotifyEnrichment(leadId: string): Promise<void> {
  try {
    pipelineLog('approve', 'Starting Spotify enrichment', { leadId });
    await spotifyEnrichLead(leadId);
  } catch (enrichError) {
    pipelineWarn(
      'approve',
      'Spotify enrichment failed — continuing with routing',
      {
        leadId,
        error:
          enrichError instanceof Error
            ? enrichError.message
            : String(enrichError),
      }
    );
    await captureError(
      'Spotify enrichment failed during approval',
      enrichError,
      { route: 'leads/approve-lead', contextData: { leadId } }
    );
  }
}

/**
 * Shared approval pipeline used by both manual admin approval and auto-approve cron.
 *
 * Steps:
 * 1. Update status to approved
 * 2. Ingest as creator profile (failed construction holds the lead for
 *    review — it must not advance to outreach-ready or export)
 * 3. Spotify enrichment (non-blocking — routing proceeds even if this fails)
 * 4. Route lead (email/DM/both/manual_review/skipped)
 *
 * External enrollment/send is intentionally NOT performed here. Routing marks
 * the lead `outreachStatus: 'pending'`; the guarded `processOutreachBatch`
 * boundary is the only path that applies suppression, capacity caps, dedupe,
 * locking, and the kill switch before pushing to the provider.
 */
export async function approveLead(lead: Lead): Promise<ApproveLeadResult> {
  const leadId = lead.id;

  pipelineLog('approve', 'Starting approval pipeline', { leadId });

  // 1. Atomically update status to approved (guard against concurrent approval)
  const now = new Date();
  const [updated] = await db
    .update(leads)
    .set({
      status: 'approved',
      approvedAt: now,
      updatedAt: now,
    })
    .where(and(eq(leads.id, leadId), eq(leads.status, 'qualified')))
    .returning({ id: leads.id });

  if (!updated) {
    pipelineLog(
      'approve',
      'Lead already approved or not in qualified state — skipping',
      { leadId }
    );
    return { ingestion: null, routing: null };
  }

  await recordLeadFunnelEvent(
    {
      leadId,
      eventType: 'approved',
    },
    { idempotent: true }
  );

  // 2. Ingest as creator profile
  let ingestion: ApproveLeadResult['ingestion'] = null;
  if (lead.linktreeUrl) {
    try {
      ingestion = await ingestLeadAsCreator(lead);
      if (ingestion?.success && ingestion.profileId) {
        await recordLeadFunnelEvent(
          {
            leadId,
            eventType: 'profile_ingested',
            metadata: { creatorProfileId: ingestion.profileId },
          },
          { idempotent: true }
        );
      }
    } catch (ingestError) {
      await captureError('Lead auto-ingest failed', ingestError, {
        route: 'leads/approve-lead',
        contextData: { leadId },
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

  // Failed or incomplete profile construction must not advance to
  // outreach-ready. Hold the lead for review instead of routing it.
  const ingestionFailed =
    Boolean(lead.linktreeUrl) &&
    (!ingestion || ingestion.success !== true || !ingestion.profileId);

  if (ingestionFailed) {
    pipelineWarn(
      'approve',
      'Ingestion failed — holding lead for review, skipping routing',
      { leadId, error: ingestion?.error ?? 'No profile constructed' }
    );
    await db
      .update(leads)
      .set({ outreachRoute: 'manual_review', updatedAt: new Date() })
      .where(eq(leads.id, leadId));
    return { ingestion, routing: null };
  }

  // 3. Spotify enrichment — non-blocking so routing still proceeds
  await trySpotifyEnrichment(leadId);

  // 4. Route lead. External enrollment/send happens only inside
  // processOutreachBatch, the single guarded outbound boundary.
  let routing: ApproveLeadResult['routing'] = null;
  try {
    pipelineLog('approve', 'Starting lead routing', { leadId });
    const routeResult = await routeLead(leadId);
    routing = { route: routeResult.route };
    pipelineLog('approve', 'Lead routed', { leadId, route: routeResult.route });
  } catch (routingError) {
    await captureError('Lead routing failed', routingError, {
      route: 'leads/approve-lead',
      contextData: { leadId },
    });
    routing = {
      error:
        routingError instanceof Error ? routingError.message : 'Routing failed',
    };
  }

  pipelineLog('approve', 'Approval pipeline complete', {
    leadId,
    ingestionSuccess: ingestion?.success ?? null,
    route: routing?.route ?? null,
  });

  return { ingestion, routing };
}
