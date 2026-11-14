import type { ReactElement } from 'react';
import type { WindowSummary } from './contract';
import { formatMetricValue, type MetricFormat } from './daily-metrics';
import {
  Axis,
  Bars,
  CHART_TOKENS,
  chartClock,
  SHIPPING_CHART_SIZE,
  Stat,
  shortDate,
  weekday,
} from './shipping-chart';

/**
 * The shipping chart's layout for any daily metric: signups, spend, CI,
 * Linear. Same tokens, same type, same bars, so every company chart Summer
 * sends looks like one system. Pure: same input, same tree.
 */
export const METRIC_CHART_SIZE = SHIPPING_CHART_SIZE;

export interface MetricChartInput {
  readonly title: string;
  readonly unit: string;
  readonly format: MetricFormat;
  readonly higherIsBetter: boolean;
  readonly summary: WindowSummary;
  readonly observedAt: string | null;
}

function changeLine(summary: WindowSummary, higherIsBetter: boolean) {
  if (summary.changePercent === null) return null;
  const pct = summary.changePercent;
  const good = higherIsBetter ? pct > 0 : pct < 0;
  return {
    text: `${pct > 0 ? '+' : ''}${pct}% vs the ${summary.days} days before`,
    color:
      pct === 0
        ? CHART_TOKENS.secondary
        : good
          ? CHART_TOKENS.success
          : CHART_TOKENS.error,
  };
}

export function MetricChart({
  title,
  unit,
  format,
  higherIsBetter,
  summary,
  observedAt,
}: MetricChartInput): ReactElement {
  const show = (n: number) => formatMetricValue(format, n);
  const barLabel = (n: number) =>
    formatMetricValue(format, n, { wholeDollars: true });
  const today = summary.points[summary.points.length - 1];
  const change = changeLine(summary, higherIsBetter);
  const clock = chartClock(observedAt);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: 64,
        backgroundColor: CHART_TOKENS.canvas,
        fontFamily: 'Inter',
        color: CHART_TOKENS.primary,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 26,
            fontWeight: 600,
            color: CHART_TOKENS.secondary,
          }}
        >
          {`${title}, last ${summary.days} days`}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            color: CHART_TOKENS.quaternary,
          }}
        >
          {`${shortDate(summary.from)} – ${shortDate(summary.to)}`}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 18 }}>
        <div
          style={{
            display: 'flex',
            fontSize: 112,
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: -3,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {summary.total === null ? '–' : show(summary.total)}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginLeft: 24,
            marginBottom: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              color: CHART_TOKENS.secondary,
            }}
          >
            {unit}
          </div>
          {change ? (
            <div
              style={{
                display: 'flex',
                fontSize: 24,
                fontWeight: 600,
                color: change.color,
                marginTop: 6,
              }}
            >
              {change.text}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', marginTop: 30 }}>
        <Stat
          label='Per full day'
          value={
            summary.averagePerFullDay === null
              ? '–'
              : show(Math.round(summary.averagePerFullDay))
          }
        />
        <Stat
          label={higherIsBetter ? 'Best day' : 'Highest day'}
          value={
            summary.best === null
              ? '–'
              : `${show(summary.best.count)} · ${summary.days <= 14 ? weekday(summary.best.date) : shortDate(summary.best.date)}`
          }
        />
        <Stat
          label='Today so far'
          value={today?.count == null ? '–' : show(today.count)}
        />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 36,
          padding: '28px 32px 22px 32px',
          backgroundColor: CHART_TOKENS.card,
          border: `1px solid ${CHART_TOKENS.borderDefault}`,
          borderRadius: 20,
        }}
      >
        <Bars summary={summary} format={barLabel} />
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: 1,
            backgroundColor: CHART_TOKENS.borderDefault,
          }}
        />
        <Axis summary={summary} />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 'auto',
          paddingTop: 28,
          fontSize: 20,
          color: CHART_TOKENS.quaternary,
        }}
      >
        <div style={{ display: 'flex' }}>
          {summary.complete ? '' : 'Some days are still loading'}
        </div>
        <div style={{ display: 'flex' }}>
          {clock ? `Pacific days · as of ${clock}` : 'Pacific days'}
        </div>
      </div>
    </div>
  );
}
