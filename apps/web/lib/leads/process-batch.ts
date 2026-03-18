import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema/leads';
import { captureError } from '@/lib/error-tracking';
import {
  LEAD_QUALIFICATION_CONCURRENCY,
  LINKTREE_FETCH_DELAY_MS,
} from './constants';
import { pipelineLog, pipelineWarn } from './pipeline-logger';
import { qualifyLead } from './qualify';

const MAX_SCRAPE_ATTEMPTS = 3;

export interface BatchResult {
  total: number;
  qualified: number;
  disqualified: number;
  error: number;
}

/**
 * Qualifies a batch of discovered leads by fetching their Linktree pages.
 * Processes with limited concurrency and inter-request delays.
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
  };

  for (let i = 0; i < leadIds.length; i += concurrency) {
    const batch = leadIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(id => processOneLead(id)));

    for (const r of batchResults) {
      if (r === 'qualified') result.qualified++;
      else if (r === 'disqualified') result.disqualified++;
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
): Promise<'qualified' | 'disqualified' | 'error'> {
  try {
    const [lead] = await db
      .select({ linktreeUrl: leads.linktreeUrl })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) {
      pipelineLog('qualify', 'Lead not found in DB', { leadId });
      return 'error';
    }

    const qualification = await qualifyLead(lead.linktreeUrl);
    const now = new Date();

    await db
      .update(leads)
      .set({
        status: qualification.status,
        displayName: qualification.displayName,
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
        allLinks: qualification.allLinks,
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

    return qualification.status;
  } catch (error) {
    pipelineLog('qualify', 'Lead qualification failed', {
      leadId,
      error: error instanceof Error ? error.message : String(error),
    });
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
