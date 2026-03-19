import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { type Lead, leads } from '@/lib/db/schema/leads';
import { captureError } from '@/lib/error-tracking';
import { ingestLeadAsCreator } from './ingest-lead';
import { pushLeadToInstantly } from './instantly';
import { pipelineLog, pipelineWarn } from './pipeline-logger';
import { routeLead } from './route-lead';
import { spotifyEnrichLead } from './spotify-enrich-lead';

export interface ApproveLeadResult {
  ingestion: { success: boolean; profileId?: string; error?: string } | null;
  routing: {
    route?: string;
    instantlyLeadId?: string;
    outreachStatus?: string;
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

async function pushToInstantlyIfEligible(
  leadId: string,
  routeResult: { route: string; claimUrl?: string }
): Promise<Partial<ApproveLeadResult['routing']>> {
  const [routedLead] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);

  if (routedLead?.instantlyLeadId) {
    pipelineLog('approve', 'Already pushed to Instantly — skipping', {
      leadId,
      instantlyLeadId: routedLead.instantlyLeadId,
    });
    return {};
  }

  const isEmailEligible =
    routedLead?.contactEmail &&
    !routedLead.emailInvalid &&
    (routeResult.route === 'email' || routeResult.route === 'both');

  if (!isEmailEligible || !routedLead?.contactEmail) return {};

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
      .where(eq(leads.id, leadId));

    return { instantlyLeadId, outreachStatus: 'queued' };
  } catch (instantlyError) {
    await captureError('Instantly push failed', instantlyError, {
      route: 'leads/approve-lead',
      contextData: { leadId },
    });
    return {
      error:
        instantlyError instanceof Error
          ? instantlyError.message
          : 'Instantly push failed',
    };
  }
}

/**
 * Shared approval pipeline used by both manual admin approval and auto-approve cron.
 *
 * Steps:
 * 1. Update status to approved
 * 2. Ingest as creator profile
 * 3. Spotify enrichment (non-blocking — routing proceeds even if this fails)
 * 4. Route lead (email/DM/both/manual_review/skipped)
 * 5. Push to Instantly if email-eligible (with idempotency guard)
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

  // 2. Ingest as creator profile
  let ingestion: ApproveLeadResult['ingestion'] = null;
  if (lead.linktreeUrl) {
    try {
      ingestion = await ingestLeadAsCreator(lead);
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

  // 3. Spotify enrichment — non-blocking so routing still proceeds
  await trySpotifyEnrichment(leadId);

  // 4. Route lead + 5. Push to Instantly if email-eligible
  let routing: ApproveLeadResult['routing'] = null;
  try {
    pipelineLog('approve', 'Starting lead routing', { leadId });
    const routeResult = await routeLead(leadId);
    routing = { route: routeResult.route };
    pipelineLog('approve', 'Lead routed', { leadId, route: routeResult.route });

    const instantlyResult = await pushToInstantlyIfEligible(leadId, routeResult);
    routing = { ...routing, ...instantlyResult };
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
