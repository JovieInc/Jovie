import { count, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getDeepErrorMessage } from '@/lib/db/errors';
import { leadPipelineSettings, leads } from '@/lib/db/schema/leads';
import { captureError, captureWarning } from '@/lib/error-tracking';

export type LeadFunnelCounts = Record<string, number>;

function isMissingLeadPipelineSettingsSchemaError(error: unknown): boolean {
  const message = getDeepErrorMessage(error).toLowerCase();
  return (
    message.includes('does not exist') &&
    [
      'lead_pipeline_settings',
      'column "daily_send_cap"',
      'column "max_per_hour"',
      'column "ramp_mode"',
      'column "guardrails_enabled"',
      'column "guardrail_thresholds"',
      'column "auto_ingest_daily_limit"',
      'column "auto_ingested_today"',
    ].some(pattern => message.includes(pattern))
  );
}

/** Single GROUP BY query for all lead status counts. */
export async function getLeadFunnelCounts(): Promise<LeadFunnelCounts> {
  try {
    const rows = await db
      .select({
        status: leads.status,
        count: count(),
      })
      .from(leads)
      .groupBy(leads.status);

    const counts: LeadFunnelCounts = {
      discovered: 0,
      qualified: 0,
      disqualified: 0,
      approved: 0,
      ingested: 0,
      rejected: 0,
    };
    for (const row of rows) {
      counts[row.status] = row.count;
    }
    return counts;
  } catch (error) {
    await captureError(
      '[admin/leads/kpis] Failed to fetch funnel counts',
      error
    );
    return {};
  }
}

export interface PipelineSettingsSummary {
  queriesUsedToday: number;
  dailyQueryBudget: number;
  pipelineEnabled: boolean;
}

export async function getPipelineSettingsSummary(): Promise<PipelineSettingsSummary> {
  try {
    const [settingsRow] = await db
      .select()
      .from(leadPipelineSettings)
      .where(eq(leadPipelineSettings.id, 1))
      .limit(1);
    return {
      queriesUsedToday: settingsRow?.queriesUsedToday ?? 0,
      dailyQueryBudget: settingsRow?.dailyQueryBudget ?? 100,
      pipelineEnabled: settingsRow?.enabled ?? false,
    };
  } catch (error) {
    if (isMissingLeadPipelineSettingsSchemaError(error)) {
      await captureWarning(
        '[admin/leads/kpis] lead pipeline settings schema missing; using defaults',
        error
      );
      return {
        queriesUsedToday: 0,
        dailyQueryBudget: 100,
        pipelineEnabled: false,
      };
    }
    throw error;
  }
}
