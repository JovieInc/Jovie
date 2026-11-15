import { NextResponse } from 'next/server';
import { defineRoute } from '@/lib/api/route-pipeline';
import { summerOidcAccess } from '@/lib/api/summer-oidc-access';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { isDailyMetric } from '@/lib/ovie/company-history/daily-metrics';
import { readCompanyMetrics } from '@/lib/ovie/company-history/daily-metrics.server';
import { renderMetricChart } from '@/lib/ovie/company-history/render.server';
import { parseHistoryWindows } from '@/lib/ovie/company-history/windows';

export const runtime = 'nodejs';

const ROUTE = '/api/internal/ovie/summer-company/charts/metric';

const headerNumber = (value: number | null) =>
  value === null ? 'unknown' : String(value);

/**
 * Chart PNG for one daily metric and window (`?metric=signups&days=30`), in
 * the shipping chart's layout. The numbers it shows ride along as headers so
 * the caption comes from the same read. Zero provider and model calls.
 */
export const GET = defineRoute(
  { route: ROUTE, access: summerOidcAccess() },
  async ({ request }) => {
    const params = new URL(request.url).searchParams;
    const metric = params.get('metric');
    if (!isDailyMetric(metric)) {
      return NextResponse.json(
        { error: 'unknown_metric' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    try {
      const [days] = parseHistoryWindows(params.get('days'), [7]);
      const readback = await readCompanyMetrics([metric], [days!]);
      const entry = readback?.metrics[metric];
      const summary = entry?.windows[String(days)];
      if (!entry || !summary) {
        return NextResponse.json(
          { error: 'company_metrics_unavailable' },
          { status: 503, headers: NO_STORE_HEADERS }
        );
      }
      const today = summary.points[summary.points.length - 1];
      const image = await renderMetricChart({
        title: entry.title,
        unit: entry.unit,
        format: entry.format,
        higherIsBetter: entry.higherIsBetter,
        summary,
        observedAt: entry.observedAt,
      });
      return new Response(await image.arrayBuffer(), {
        headers: {
          ...NO_STORE_HEADERS,
          'content-type': 'image/png',
          'x-company-history-metric': metric,
          'x-company-history-format': entry.format,
          'x-company-history-days': String(days),
          'x-company-history-from': summary.from,
          'x-company-history-to': summary.to,
          'x-company-history-total': headerNumber(summary.total),
          'x-company-history-prior-total': headerNumber(summary.priorTotal),
          'x-company-history-change-percent': headerNumber(
            summary.changePercent
          ),
          'x-company-history-today': headerNumber(today?.count ?? null),
          'x-company-history-complete': String(summary.complete),
          'x-company-history-observed-at': entry.observedAt ?? 'unknown',
        },
      });
    } catch (error) {
      await captureError('Summer metric chart failed', error, { route: ROUTE });
      return NextResponse.json(
        { error: 'company_chart_unavailable' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }
  }
);
