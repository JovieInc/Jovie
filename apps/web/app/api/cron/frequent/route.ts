/**
 * Consolidated Frequent Cron Handler
 *
 * Runs every 15 minutes. Orchestrates sub-jobs that need sub-hourly frequency.
 * One cold start + one DB connection serves all jobs.
 *
 * Sub-jobs:
 * - DB warm ping: every invocation (15 min) — keeps Neon from auto-suspending
 * - Process campaigns: every invocation (15 min)
 * - Pixel forwarding retry: every other invocation (~30 min)
 * - Schedule + send release notifications: every invocation (15 min)
 *
 * Each sub-job runs in an independent try-catch so one failure
 * doesn't block the others.
 *
 * Schedule: every 15 minutes (configured in vercel.json)
 */

import { sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getOperationalControls } from '@/lib/admin/operational-controls';
import { verifyCronRequest } from '@/lib/cron/auth';
import { runMonitoredCron } from '@/lib/cron/monitoring';
import { db } from '@/lib/db';
import {
  discoveryKeywords,
  leadPipelineSettings,
  leads,
} from '@/lib/db/schema/leads';
import { processCampaigns } from '@/lib/email/campaigns/processor';
import { captureError } from '@/lib/error-tracking';
import {
  claimPendingJobs,
  handleIngestionJobFailure,
  processJob,
  succeedJob,
} from '@/lib/ingestion/processor';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { runAutoApprove } from '@/lib/leads/auto-approve';
import { resetBudgetIfNeeded, runDiscovery } from '@/lib/leads/discovery';
import { processOutreachBatch } from '@/lib/leads/outreach-batch';
import { pipelineWarn } from '@/lib/leads/pipeline-logger';
import { processLeadBatch } from '@/lib/leads/process-batch';
import { cleanupExpiredSuppressions } from '@/lib/notifications/suppression';
import { warmAlphabetCache } from '@/lib/spotify/alphabet-cache';
import { processPendingEvents } from '@/lib/tracking/forwarding';
import { logger } from '@/lib/utils/logger';
import { scheduleReleaseNotifications } from '../schedule-release-notifications/route';
import { sendPendingNotifications } from '../send-release-notifications/route';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const FREQUENT_CRON_MONITOR = {
  slug: 'cron-frequent',
  schedule: '*/15 * * * *',
  maxRuntime: 1,
  checkinMargin: 5,
} as const;

interface SubJobResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

function getOutreachBatchSize(startTime: number): number {
  const remainingMs = 50_000 - (Date.now() - startTime);
  if (remainingMs <= 10_000) {
    return 0;
  }
  if (remainingMs <= 20_000) {
    return 5;
  }
  return 10;
}

async function runSubJob(
  name: string,
  fn: () => Promise<Record<string, unknown>>
): Promise<SubJobResult> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[frequent-cron] ${name} failed:`, error);
    await captureError(`Frequent cron: ${name} failed`, error, {
      route: '/api/cron/frequent',
      subjob: name,
    });
    return { success: false, error: msg };
  }
}

export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/frequent',
  });
  if (authError) return authError;

  return runMonitoredCron(
    {
      monitor: FREQUENT_CRON_MONITOR,
      shouldFailResult: response => response.status !== 200,
    },
    async () => {
      const controls = await getOperationalControls();
      if (!controls.cronFanoutEnabled) {
        return NextResponse.json(
          {
            success: true,
            skipped: true,
            reason: 'cron_fanout_disabled',
          },
          { headers: NO_STORE_HEADERS }
        );
      }

      return runFrequentCron();
    }
  );
}

async function runFrequentCron() {
  const startTime = Date.now();

  const minute = new Date().getMinutes();
  const results: Record<string, SubJobResult> = {};

  // 1. DB warm ping — keeps Neon compute from auto-suspending
  results.dbWarmPing = await runSubJob('dbWarmPing', async () => {
    const pingStart = Date.now();
    await db.execute(drizzleSql`SELECT 1`);
    return { latencyMs: Date.now() - pingStart };
  });

  // 2. Process campaigns — every invocation (15 min)
  results.campaigns = await runSubJob('campaigns', async () => {
    const campaignResult = await processCampaigns();
    const suppressionsCleared = await cleanupExpiredSuppressions();
    return { ...campaignResult, suppressionsCleared };
  });

  // 3. Pixel forwarding retry — every other invocation (~30 min)
  results.pixelRetry =
    minute >= 30
      ? await runSubJob('pixelRetry', async () => {
          const pixelResult = await processPendingEvents();
          return pixelResult as unknown as Record<string, unknown>;
        })
      : { success: true, skipped: true };

  // 4. Schedule release notifications — every invocation (15 min)
  results.scheduleNotifications = await runSubJob(
    'scheduleNotifications',
    async () => {
      const scheduleResult = await scheduleReleaseNotifications();
      return scheduleResult as unknown as Record<string, unknown>;
    }
  );

  // 5. Send release notifications — every invocation (15 min)
  results.sendNotifications = await runSubJob('sendNotifications', async () => {
    const notifResult = await sendPendingNotifications();
    return notifResult as unknown as Record<string, unknown>;
  });

  // 6. Lead discovery + qualification + auto-approve — every invocation (15 min)
  results.leadDiscovery = await runSubJob('leadDiscovery', async () => {
    // Fetch settings (upsert default if missing)
    let [settings] = await db
      .select()
      .from(leadPipelineSettings)
      .where(eq(leadPipelineSettings.id, 1))
      .limit(1);

    if (!settings) {
      [settings] = await db
        .insert(leadPipelineSettings)
        .values({ id: 1 })
        .returning();
    }

    if (!settings?.enabled || !settings.discoveryEnabled) {
      return { skipped: true, reason: 'pipeline_disabled' };
    }

    // Reset daily query budget if past reset time (or never initialized)
    settings = await resetBudgetIfNeeded(settings);

    const keywords = await db.select().from(discoveryKeywords);
    const discoveryResult = await runDiscovery(settings, keywords);

    // Health warning: zero results across all queries
    if (
      discoveryResult.queriesUsed > 0 &&
      discoveryResult.newLeadsFound === 0 &&
      discoveryResult.candidatesProcessed === 0
    ) {
      pipelineWarn(
        'discovery',
        'Zero results across all queries — check SerpAPI key and quota',
        {
          queriesUsed: discoveryResult.queriesUsed,
          budgetRemaining: discoveryResult.budgetRemaining,
        }
      );
    }

    // Qualify any newly discovered leads
    let qualificationResult = null;
    if (discoveryResult.newLeadsFound > 0) {
      const newLeads = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.status, 'discovered'))
        .limit(30);
      if (newLeads.length > 0) {
        qualificationResult = await processLeadBatch(newLeads.map(l => l.id));

        // Health warning: high qualification error rate
        if (
          qualificationResult.total > 0 &&
          qualificationResult.error > qualificationResult.total * 0.5
        ) {
          pipelineWarn('qualify', 'High error rate in qualification batch', {
            errorRate: qualificationResult.error / qualificationResult.total,
            errors: qualificationResult.error,
            total: qualificationResult.total,
          });
        }
      }
    }

    // Auto-approve qualified leads if enabled
    const autoApproveResult = await runAutoApprove(settings);

    return {
      discovery: discoveryResult,
      qualification: qualificationResult,
      autoApprove: autoApproveResult,
    } as unknown as Record<string, unknown>;
  });

  // 6.5 Outreach — send a batch of pending emails after auto-approve
  results.outreach = await runSubJob('outreach', async () => {
    const [settings] = await db
      .select()
      .from(leadPipelineSettings)
      .where(eq(leadPipelineSettings.id, 1))
      .limit(1);

    if (settings?.enabled === false) {
      return { skipped: true, reason: 'pipeline_disabled' };
    }

    const batchSize = getOutreachBatchSize(startTime);
    if (batchSize === 0) {
      return { skipped: true, reason: 'insufficient_budget' };
    }

    const outreachResult = await processOutreachBatch(batchSize);
    return outreachResult as unknown as Record<string, unknown>;
  });

  // 7. Warm Spotify alphabet cache — every 6 hours
  const hour = new Date().getHours();
  if (hour % 6 === 0 && minute < 15) {
    try {
      const warmResult = await warmAlphabetCache();
      results.alphabetCache = {
        success: true,
        data: warmResult as unknown as Record<string, unknown>,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[frequent-cron] Alphabet cache warming failed:', error);
      await captureError(
        'Frequent cron: alphabet cache warming failed',
        error,
        {
          route: '/api/cron/frequent',
          subjob: 'alphabetCache',
        }
      );
      results.alphabetCache = { success: false, error: msg };
    }
  } else {
    results.alphabetCache = { success: true, skipped: true };
  }

  // 8. Fallback ingestion job processing — drains up to 2 jobs if the
  //    dedicated cron hasn't picked them up. Runs last to stay within budget.
  const elapsed = Date.now() - startTime;
  if (elapsed < 50_000) {
    results.ingestionFallback = await runSubJob(
      'ingestionFallback',
      async () => {
        const fallbackNow = new Date();
        const claimed = await withSystemIngestionSession(tx =>
          claimPendingJobs(tx, fallbackNow, 2)
        );
        let processed = 0;
        for (const job of claimed) {
          try {
            await withSystemIngestionSession(async tx => {
              await processJob(tx, job);
              await succeedJob(tx, job);
            });
            processed++;
          } catch (error) {
            await withSystemIngestionSession(tx =>
              handleIngestionJobFailure(tx, job, error)
            );
            logger.error('[frequent-cron] ingestion fallback job failed', {
              jobId: job.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        return { claimed: claimed.length, processed };
      }
    );
  } else {
    results.ingestionFallback = { success: true, skipped: true };
  }

  const duration = Date.now() - startTime;
  const allSuccessful = Object.values(results).every(r => r.success);

  logger.info(`[frequent-cron] Completed in ${duration}ms`, results);

  return NextResponse.json(
    {
      success: allSuccessful,
      results,
      duration,
    },
    {
      status: allSuccessful ? 200 : 207,
      headers: NO_STORE_HEADERS,
    }
  );
}
