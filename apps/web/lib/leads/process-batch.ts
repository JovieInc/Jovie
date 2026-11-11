import { sql as drizzleSql, eq } from 'drizzle-orm';
import {
  acquisitionFunnelAttribution,
  experimentIdForLeadSource,
} from '@/lib/acquisition';
import { db } from '@/lib/db';
import { type LeadSignalSnapshot, leads } from '@/lib/db/schema/leads';
import { captureError } from '@/lib/error-tracking';
import { isCoreSocialHtmlHost } from '@/lib/ingestion/social-html-policy';
import { ExtractionError } from '@/lib/ingestion/strategies/base';
import { cleanScrapedDisplayName } from '@/lib/profile/scraped-display-name';
import {
  LEAD_QUALIFICATION_CONCURRENCY,
  LINKTREE_FETCH_DELAY_MS,
} from './constants';
import { recordLeadFunnelEvent } from './funnel-events';
import { pipelineLog, pipelineWarn } from './pipeline-logger';
import { qualifyLead } from './qualify';
import { qualifyFromSearchEvidence } from './search-evidence';

const MAX_SCRAPE_ATTEMPTS = 3;

export interface BatchResult {
  total: number;
  qualified: number;
  disqualified: number;
  error: number;
  /** Leads skipped because HTML access is disabled for their platform. */
  deferred: number;
}

/**
 * Qualifies a batch of discovered leads. Linktree and Beacons leads are scored
 * from stored search evidence (their pages are never fetched); other sources
 * go through qualifyLead. Processes with limited concurrency.
 */
export async function processLeadBatch(
  leadIds: string[],
  concurrency = LEAD_QUALIFICATION_CONCURRENCY
): Promise<BatchResult> {
  const result: BatchResult = {
    total: leadIds.length,
    qualified: 0,
    disqualified: 0,
    error: 0,
    deferred: 0,
  };

  for (let i = 0; i < leadIds.length; i += concurrency) {
    const batch = leadIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(id => processOneLead(id)));

    for (const r of batchResults) {
      if (r === 'qualified') result.qualified++;
      else if (r === 'disqualified') result.disqualified++;
      else if (r === 'deferred') result.deferred++;
      else result.error++;
    }

    // Rate limit: delay between batches
    if (i + concurrency < leadIds.length) {
      await sleep(LINKTREE_FETCH_DELAY_MS);
    }
  }

  return result;
}

async function processOneLead(
  leadId: string
): Promise<'qualified' | 'disqualified' | 'deferred' | 'error'> {
  try {
    const [lead] = await db
      .select({
        linktreeUrl: leads.linktreeUrl,
        discoveryQuery: leads.discoveryQuery,
        linktreeHandle: leads.linktreeHandle,
        sourceHandle: leads.sourceHandle,
        sourcePlatform: leads.sourcePlatform,
        displayName: leads.displayName,
        signalSnapshot: leads.signalSnapshot,
      })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) {
      pipelineLog('qualify', 'Lead not found in DB', { leadId });
      return 'error';
    }

    // Linktree and Beacons pages are never read; their leads are scored from
    // the search results that showed them.
    if (isSearchOnlyLinkPage(lead)) {
      return await qualifyFromSearch(leadId, lead);
    }

    const qualification = await qualifyLead(lead.linktreeUrl);
    const now = new Date();

    await db
      .update(leads)
      .set({
        status: qualification.status,
        sourcePlatform: qualification.sourcePlatform,
        displayName: cleanScrapedDisplayName(qualification.displayName),
        bio: qualification.bio,
        avatarUrl: qualification.avatarUrl,
        contactEmail: qualification.contactEmail,
        hasPaidTier: qualification.hasPaidTier,
        isLinktreeVerified: qualification.isLinktreeVerified,
        hasSpotifyLink: qualification.hasSpotifyLink,
        spotifyUrl: qualification.spotifyUrl,
        hasInstagram: qualification.hasInstagram,
        instagramHandle: qualification.instagramHandle,
        musicToolsDetected: qualification.musicToolsDetected,
        hasTrackingPixels: qualification.hasTrackingPixels,
        trackingPixelPlatforms: qualification.trackingPixelPlatforms,
        allLinks: qualification.allLinks,
        signalSnapshot: {
          verified: qualification.isLinktreeVerified,
          hasPaidTier: qualification.hasPaidTier,
          hasSpotifyLink: qualification.hasSpotifyLink,
          hasInstagram: qualification.hasInstagram,
          musicToolsDetected: qualification.musicToolsDetected,
          allLinks: qualification.allLinks,
          hasTrackingPixels: qualification.hasTrackingPixels,
          trackingPixelPlatforms: qualification.trackingPixelPlatforms,
          discoveryQuery: lead.discoveryQuery,
          sourcePlatform: qualification.sourcePlatform,
        },
        fitScore: qualification.fitScore,
        fitScoreBreakdown: qualification.fitScoreBreakdown,
        disqualificationReason: qualification.disqualificationReason,
        scrapedAt: now,
        qualifiedAt: qualification.status === 'qualified' ? now : undefined,
        disqualifiedAt:
          qualification.status === 'disqualified' ? now : undefined,
        updatedAt: now,
      })
      .where(eq(leads.id, leadId));

    await recordLeadFunnelEvent(
      {
        leadId,
        eventType:
          qualification.status === 'qualified' ? 'qualified' : 'disqualified',
        ...acquisitionFunnelAttribution(
          experimentIdForLeadSource(qualification.sourcePlatform)
        ),
        metadata: {
          disqualificationReason: qualification.disqualificationReason,
          fitScore: qualification.fitScore,
          hasTrackingPixels: qualification.hasTrackingPixels,
          trackingPixelPlatforms: qualification.trackingPixelPlatforms,
          musicToolsDetected: qualification.musicToolsDetected,
        },
      },
      { idempotent: true }
    );

    return qualification.status;
  } catch (error) {
    pipelineLog('qualify', 'Lead qualification failed', {
      leadId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Disabled HTML access is not evidence about the lead and must not consume
    // scrape attempts or automatically disqualify them. Touch updatedAt so the
    // cron's oldest-first pick rotates past it instead of re-reading it forever.
    if (
      error instanceof ExtractionError &&
      error.code === 'SOCIAL_HTML_DISABLED'
    ) {
      return deferLead(leadId);
    }
    await captureError('Lead qualification failed', error, {
      route: 'leads/process-batch',
      contextData: { leadId },
    });

    // Increment scrape attempts and auto-disqualify after MAX_SCRAPE_ATTEMPTS
    try {
      const [updated] = await db
        .update(leads)
        .set({
          scrapeAttempts: drizzleSql`${leads.scrapeAttempts} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId))
        .returning({ scrapeAttempts: leads.scrapeAttempts });

      if (updated && updated.scrapeAttempts >= MAX_SCRAPE_ATTEMPTS) {
        await db
          .update(leads)
          .set({
            status: 'disqualified',
            disqualificationReason: 'scrape_failed',
            disqualifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(leads.id, leadId));
        await recordLeadFunnelEvent(
          {
            leadId,
            eventType: 'disqualified',
            ...acquisitionFunnelAttribution(experimentIdForLeadSource(null)),
            metadata: {
              disqualificationReason: 'scrape_failed',
            },
          },
          { idempotent: true }
        );
        pipelineWarn('qualify', 'Lead disqualified after max scrape attempts', {
          leadId,
          attempts: updated.scrapeAttempts,
        });
      }
    } catch (updateError) {
      await captureError('Failed to update scrape attempts', updateError, {
        route: 'leads/process-batch',
        contextData: { leadId },
      });
    }

    return 'error';
  }
}

interface SearchOnlyLead {
  linktreeUrl: string;
  linktreeHandle: string;
  sourceHandle: string | null;
  sourcePlatform: string | null;
  displayName: string | null;
  signalSnapshot: LeadSignalSnapshot | null;
}

function isSearchOnlyLinkPage(lead: SearchOnlyLead): boolean {
  if (lead.sourcePlatform === 'linktree' || lead.sourcePlatform === 'beacons')
    return true;
  try {
    return isCoreSocialHtmlHost(new URL(lead.linktreeUrl).hostname);
  } catch {
    return false;
  }
}

/** Touch updatedAt only, so the cron's oldest-first pick rotates past it. */
async function deferLead(leadId: string): Promise<'deferred'> {
  try {
    await db
      .update(leads)
      .set({ updatedAt: new Date() })
      .where(eq(leads.id, leadId));
  } catch {
    // Rotation is best-effort; the lead stays discovered either way.
  }
  return 'deferred';
}

/**
 * Scores a Linktree or Beacons lead from its stored search evidence with the
 * buyer pre-screen. No evidence: the lead stays discovered. Nothing here
 * requests the link page or any other blocked host.
 */
async function qualifyFromSearch(
  leadId: string,
  lead: SearchOnlyLead
): Promise<'qualified' | 'disqualified' | 'deferred'> {
  const decision = qualifyFromSearchEvidence({
    handle: lead.sourceHandle ?? lead.linktreeHandle,
    displayName: lead.displayName,
    evidence: lead.signalSnapshot?.searchEvidence,
  });
  if (decision.outcome === 'no_evidence') return deferLead(leadId);

  const now = new Date();
  const qualified = decision.outcome === 'qualified';
  await db
    .update(leads)
    .set({
      status: decision.outcome,
      displayName: cleanScrapedDisplayName(decision.displayName),
      musicToolsDetected: decision.musicToolsDetected,
      fitScore: decision.fitScore,
      fitScoreBreakdown: decision.fitScoreBreakdown,
      disqualificationReason: decision.disqualificationReason,
      qualifiedAt: qualified ? now : undefined,
      disqualifiedAt: qualified ? undefined : now,
      updatedAt: now,
    })
    .where(eq(leads.id, leadId));

  await recordLeadFunnelEvent(
    {
      leadId,
      eventType: decision.outcome,
      ...acquisitionFunnelAttribution(
        experimentIdForLeadSource(lead.sourcePlatform)
      ),
      metadata: {
        qualificationSource: 'search_evidence',
        disqualificationReason: decision.disqualificationReason,
        fitScore: decision.fitScore,
        musicToolsDetected: decision.musicToolsDetected,
        searchTools: decision.fitScoreBreakdown.searchTools,
      },
    },
    { idempotent: true }
  );
  return decision.outcome;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
