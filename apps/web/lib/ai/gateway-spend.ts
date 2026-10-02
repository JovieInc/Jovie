import 'server-only';

import {
  createGateway,
  type GatewaySpendReportParams,
  type GatewaySpendReportResponse,
  type GatewaySpendReportRow,
} from '@ai-sdk/gateway';
import { eq } from 'drizzle-orm';
import { formatUsd } from '@/lib/admin/format';
import { isGatewayBannedModel } from '@/lib/constants/ai-models';
import { db } from '@/lib/db';
import { adminCosts } from '@/lib/db/schema/admin';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';

/** Alert when one UTC day of Gateway spend exceeds this (summer-config#107). */
export const AI_GATEWAY_DAILY_SPEND_ALERT_USD = 5;
/** Alert when a model averages more input tokens per request than this. */
export const AI_GATEWAY_INPUT_TOKENS_PER_REQUEST_ALERT = 150_000;
/** The admin Costs row seeded in lib/admin/costs.ts. */
export const AI_GATEWAY_COST_LABEL = 'Vercel AI Gateway';

type SpendReporter = (
  params: GatewaySpendReportParams
) => Promise<GatewaySpendReportResponse>;

export interface GatewaySpendLine {
  readonly key: string;
  readonly costUsd: number;
  readonly requests: number;
  readonly inputTokensPerRequest: number | null;
}

export interface DailyGatewaySpend {
  readonly day: string;
  readonly totalUsd: number;
  readonly observed30dUsd: number;
  readonly byTag: readonly GatewaySpendLine[];
  readonly byModel: readonly GatewaySpendLine[];
  readonly alerts: readonly string[];
}

function toLine(key: string, row: GatewaySpendReportRow): GatewaySpendLine {
  const requests = row.requestCount ?? 0;
  return {
    key,
    costUsd: row.totalCost,
    requests,
    inputTokensPerRequest:
      requests > 0 && row.inputTokens != null
        ? Math.round(row.inputTokens / requests)
        : null,
  };
}

function sumCost(rows: readonly GatewaySpendReportRow[]): number {
  return rows.reduce((total, row) => total + row.totalCost, 0);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultReporter(): SpendReporter {
  // Reporting goes straight to the Gateway, not the optional Helicone proxy.
  const apiKey = env.AI_GATEWAY_API_KEY?.trim();
  const provider = createGateway(apiKey ? { apiKey } : undefined);
  return params => provider.getSpendReport(params);
}

/**
 * Reads the previous UTC day's Gateway spend by tag and by model, plus the
 * trailing 30-day total. Tag rows overlap (one request carries several tags),
 * so the daily total comes from the model grouping.
 */
export async function getDailyGatewaySpend(
  now = new Date(),
  report: SpendReporter = defaultReporter()
): Promise<DailyGatewaySpend> {
  const day = isoDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const monthStart = isoDay(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));

  const [tagReport, modelReport, monthReport] = await Promise.all([
    report({ startDate: day, endDate: day, groupBy: 'tag' }),
    report({ startDate: day, endDate: day, groupBy: 'model' }),
    report({ startDate: monthStart, endDate: day, groupBy: 'model' }),
  ]);

  const byTag = tagReport.results
    .map(row => toLine(row.tag ?? 'untagged', row))
    .sort((a, b) => b.costUsd - a.costUsd);
  const byModel = modelReport.results
    .map(row => toLine(row.model ?? 'unknown', row))
    .sort((a, b) => b.costUsd - a.costUsd);
  const totalUsd = sumCost(modelReport.results);

  const alerts: string[] = [];
  if (totalUsd > AI_GATEWAY_DAILY_SPEND_ALERT_USD) {
    alerts.push(
      `AI Gateway spend ${formatUsd(totalUsd)} on ${day} exceeds ${formatUsd(AI_GATEWAY_DAILY_SPEND_ALERT_USD)}/day`
    );
  }
  for (const line of byModel) {
    // JOV-7119: OpenAI/Anthropic are banned on the gateway — any spend line is
    // a policy violation and must alert regardless of amount.
    if (isGatewayBannedModel(line.key)) {
      alerts.push(
        `banned gateway model ${line.key} billed ${formatUsd(line.costUsd)} across ${line.requests} requests on ${day}`
      );
    }
    if (
      line.inputTokensPerRequest != null &&
      line.inputTokensPerRequest > AI_GATEWAY_INPUT_TOKENS_PER_REQUEST_ALERT
    ) {
      alerts.push(
        `${line.key} averaged ${line.inputTokensPerRequest} input tokens/request on ${day}`
      );
    }
  }

  return {
    day,
    totalUsd,
    observed30dUsd: sumCost(monthReport.results),
    byTag,
    byModel,
    alerts,
  };
}

export function formatGatewaySpendNotes(spend: DailyGatewaySpend): string {
  const top = spend.byTag
    .filter(line => line.key.startsWith('feature:'))
    .slice(0, 5)
    .map(
      line => `${line.key.slice('feature:'.length)} ${formatUsd(line.costUsd)}`
    )
    .join(', ');
  return `Auto: ${spend.day} ${formatUsd(spend.totalUsd)}${top ? ` (${top})` : ''}. Alert over ${formatUsd(AI_GATEWAY_DAILY_SPEND_ALERT_USD)}/day.`;
}

/**
 * Daily cron sub-job: records Gateway spend on the admin Costs row and raises
 * a Sentry alert when a threshold is crossed.
 */
export async function recordDailyGatewaySpend(
  now = new Date(),
  report?: SpendReporter
): Promise<DailyGatewaySpend> {
  const spend = await getDailyGatewaySpend(now, report);

  await db
    .update(adminCosts)
    .set({
      observed30dUsd: spend.observed30dUsd.toFixed(2),
      notes: formatGatewaySpendNotes(spend),
      updatedAt: now,
    })
    .where(eq(adminCosts.label, AI_GATEWAY_COST_LABEL));

  if (spend.alerts.length > 0) {
    await captureError(
      'AI Gateway daily spend alert',
      new Error(spend.alerts.join('; ')),
      {
        route: '/api/cron/daily-maintenance',
        subjob: 'aiGatewaySpend',
        alert: 'ai_gateway_daily_spend',
        day: spend.day,
        totalUsd: spend.totalUsd,
        topTags: spend.byTag.slice(0, 5),
      },
      'warning'
    );
  }

  return spend;
}
