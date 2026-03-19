import 'server-only';

import {
  and,
  desc,
  sql as drizzleSql,
  eq,
  gte,
  isNotNull,
  lt,
  or,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type LeadPipelineSettings,
  leadPipelineSettings,
  leads,
} from '@/lib/db/schema/leads';
import { captureError } from '@/lib/error-tracking';
import { approveLead } from './approve-lead';
import { pipelineLog, pipelineWarn } from './pipeline-logger';

export interface AutoApproveResult {
  skipped: boolean;
  reason?: string;
  approved: number;
  errors: number;
}

/**
 * Auto-approve qualified leads that meet the fit score threshold.
 *
 * Guardrails:
 * - Only runs when autoIngestEnabled is true
 * - Requires fitScore >= autoIngestMinFitScore (default 60)
 * - Caps at autoIngestDailyLimit per day (default 10)
 * - Skips leads with representation (has manager/booking agent)
 * - Skips high-profile leads (>50k followers or >72 popularity)
 * - Skips leads with null fitScore (not yet scored)
 * - Resets daily counter at UTC midnight
 */
export async function runAutoApprove(
  settings: LeadPipelineSettings
): Promise<AutoApproveResult> {
  if (!settings.autoIngestEnabled) {
    return {
      skipped: true,
      reason: 'auto_ingest_disabled',
      approved: 0,
      errors: 0,
    };
  }

  // Reset auto-ingest counter if past reset time
  const now = new Date();
  const needsCounterReset =
    !settings.autoIngestResetsAt || now > settings.autoIngestResetsAt;
  if (needsCounterReset) {
    const nextMidnightUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    );
    await db
      .update(leadPipelineSettings)
      .set({
        autoIngestedToday: 0,
        autoIngestResetsAt: nextMidnightUtc,
        updatedAt: now,
      })
      .where(eq(leadPipelineSettings.id, 1));
    settings = {
      ...settings,
      autoIngestedToday: 0,
      autoIngestResetsAt: nextMidnightUtc,
    };
  }

  const remainingSlots =
    settings.autoIngestDailyLimit - settings.autoIngestedToday;
  if (remainingSlots <= 0) {
    pipelineLog('auto-approve', 'Daily limit reached', {
      limit: settings.autoIngestDailyLimit,
      used: settings.autoIngestedToday,
    });
    return {
      skipped: true,
      reason: 'daily_limit_reached',
      approved: 0,
      errors: 0,
    };
  }

  // Query eligible leads: qualified, scored, not high-profile, no representation
  const eligibleLeads = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.status, 'qualified'),
        isNotNull(leads.fitScore),
        gte(leads.fitScore, settings.autoIngestMinFitScore),
        eq(leads.hasRepresentation, false),
        or(
          lt(leads.spotifyFollowers, 50_001),
          drizzleSql`${leads.spotifyFollowers} IS NULL`
        ),
        or(
          lt(leads.spotifyPopularity, 73),
          drizzleSql`${leads.spotifyPopularity} IS NULL`
        )
      )
    )
    .orderBy(desc(leads.fitScore))
    .limit(remainingSlots);

  if (eligibleLeads.length === 0) {
    pipelineLog('auto-approve', 'No eligible leads to auto-approve');
    return { skipped: false, approved: 0, errors: 0 };
  }

  pipelineLog('auto-approve', 'Starting auto-approve batch', {
    eligible: eligibleLeads.length,
    remainingSlots,
    minFitScore: settings.autoIngestMinFitScore,
  });

  let approved = 0;
  let errors = 0;

  for (const lead of eligibleLeads) {
    try {
      const result = await approveLead(lead);
      if (result.ingestion?.success === false) {
        errors++;
        pipelineWarn('auto-approve', 'Auto-approve ingestion failed', {
          leadId: lead.id,
          error: result.ingestion?.error,
        });
      } else {
        approved++;
      }
    } catch (error) {
      errors++;
      await captureError('Auto-approve failed for lead', error, {
        route: 'leads/auto-approve',
        contextData: { leadId: lead.id },
      });
    }
  }

  // Update the auto-ingest counter
  await db
    .update(leadPipelineSettings)
    .set({
      autoIngestedToday: drizzleSql`${leadPipelineSettings.autoIngestedToday} + ${approved}`,
      updatedAt: new Date(),
    })
    .where(eq(leadPipelineSettings.id, 1));

  pipelineLog('auto-approve', 'Auto-approve batch complete', {
    approved,
    errors,
    newTotal: settings.autoIngestedToday + approved,
    dailyLimit: settings.autoIngestDailyLimit,
  });

  return { skipped: false, approved, errors };
}
