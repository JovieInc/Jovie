import type { ReactElement } from 'react';
import designTokens from '../../../../../design.tokens.json';
import {
  COMPANY_HISTORY_TIMEZONE,
  MERGED_PR_SCOPES,
  type MergedPrScope,
  type WindowPoint,
  type WindowSummary,
} from './contract';

/**
 * Deterministic shipping chart for iMessage and any agent that wants a
 * picture of the numbers. Same window summaries in, same image out: no
 * clock, no randomness, no provider or model call. Colors and type are the
 * System B tokens, read from design.tokens.json itself, and Inter for
 * every glyph, so the chart cannot drift from the design system.
 *
 * Satori subset: flex layout and inline styles only.
 */
type TokenFile = { color: Record<string, { $value: string }> };
const color = (name: string) =>
  String((designTokens as TokenFile).color[name]!.$value).toLowerCase();

export const CHART_TOKENS = {
  canvas: color('surface.canvas'),
  card: color('surface.card'),
  elevated: color('surface.elevated'),
  borderSubtle: color('border.subtle'),
  borderDefault: color('border.default'),
  primary: color('text.primary'),
  secondary: color('text.secondary'),
  quaternary: color('text.quaternary'),
  ion: color('accent.ion'),
  selected: color('accent.selected'),
  success: color('status.success'),
  error: color('status.error'),
} as const;

export const SHIPPING_CHART_SIZE = { width: 1200, height: 880 } as const;

const PAD = 64;
const PLOT_HEIGHT = 300;
const SCOPE_LABEL: Record<Exclude<MergedPrScope, 'org'>, string> = {
  Jovie: 'Jovie',
  LogYourBody: 'LogYourBody',
  'summer-config': 'Summer',
};

const int = (n: number) => n.toLocaleString('en-US');

export const shortDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

export const weekday = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });

/** "1:04 PM" in Pacific, from the cache's own observation time. */
export function chartClock(iso: string | null): string | null {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: COMPANY_HISTORY_TIMEZONE,
  });
}

export interface ShippingChartInput {
  /** One summary per scope, all for the same window. */
  readonly windows: Readonly<Record<MergedPrScope, WindowSummary>>;
  readonly observedAt: string | null;
}

function changeLine(summary: WindowSummary) {
  if (summary.changePercent === null) return null;
  const pct = summary.changePercent;
  return {
    text: `${pct > 0 ? '+' : ''}${pct}% vs the ${summary.days} days before`,
    color:
      pct > 0
        ? CHART_TOKENS.success
        : pct < 0
          ? CHART_TOKENS.error
          : CHART_TOKENS.secondary,
  };
}

function axisLabel(point: WindowPoint, index: number, days: number) {
  if (days <= 14) return weekday(point.date);
  // Every seventh day, counted back from today, so today is always labeled.
  return (days - 1 - index) % 7 === 0 ? shortDate(point.date) : '';
}

export function Bars({
  summary,
  format = int,
}: {
  readonly summary: WindowSummary;
  readonly format?: (n: number) => string;
}) {
  const values = summary.points.map(p => p.count ?? 0);
  const max = Math.max(1, ...values);
  const showEveryValue = summary.days <= 14;
  const gap = summary.days <= 14 ? 20 : 6;
  const lastIndex = summary.points.length - 1;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        height: PLOT_HEIGHT,
        width: '100%',
      }}
    >
      {summary.points.map((point, index) => {
        const isToday = index === lastIndex;
        const isBest =
          summary.best !== null && point.date === summary.best.date;
        const height =
          point.count === null
            ? 0
            : Math.max(4, Math.round((point.count / max) * (PLOT_HEIGHT - 44)));
        const showValue =
          point.count !== null && (showEveryValue || isBest || isToday);
        return (
          <div
            key={point.date}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
              flexGrow: 1,
              flexBasis: 0,
              height: '100%',
              marginLeft: index === 0 ? 0 : gap / 2,
              marginRight: index === lastIndex ? 0 : gap / 2,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: summary.days <= 14 ? 22 : 18,
                fontWeight: 600,
                color: isToday ? CHART_TOKENS.secondary : CHART_TOKENS.primary,
                marginBottom: 8,
                opacity: showValue ? 1 : 0,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {point.count === null ? '–' : format(point.count)}
            </div>
            {point.count === null ? (
              <div
                style={{
                  display: 'flex',
                  width: '100%',
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: CHART_TOKENS.borderDefault,
                }}
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  width: '100%',
                  height,
                  borderRadius: summary.days <= 14 ? 8 : 4,
                  backgroundColor: isToday
                    ? CHART_TOKENS.selected
                    : CHART_TOKENS.ion,
                  border: isToday
                    ? `2px solid ${CHART_TOKENS.ion}`
                    : `0px solid ${CHART_TOKENS.ion}`,
                  opacity: isToday || isBest ? 1 : 0.78,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Axis({ summary }: { readonly summary: WindowSummary }) {
  const gap = summary.days <= 14 ? 20 : 6;
  const lastIndex = summary.points.length - 1;
  return (
    <div style={{ display: 'flex', width: '100%', marginTop: 16 }}>
      {summary.points.map((point, index) => (
        <div
          key={point.date}
          style={{
            display: 'flex',
            justifyContent: 'center',
            flexGrow: 1,
            flexBasis: 0,
            marginLeft: index === 0 ? 0 : gap / 2,
            marginRight: index === lastIndex ? 0 : gap / 2,
            fontSize: 20,
            color:
              index === lastIndex
                ? CHART_TOKENS.secondary
                : CHART_TOKENS.quaternary,
            whiteSpace: 'nowrap',
          }}
        >
          {index === lastIndex
            ? 'Today'
            : axisLabel(point, index, summary.days)}
        </div>
      ))}
    </div>
  );
}

export function Stat({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginRight: 56 }}>
      <div
        style={{
          display: 'flex',
          fontSize: 20,
          color: CHART_TOKENS.quaternary,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 30,
          fontWeight: 600,
          color: CHART_TOKENS.primary,
          marginTop: 6,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** The chart element for next/og. Pure: same input, same tree. */
export function ShippingChart({
  windows,
  observedAt,
}: ShippingChartInput): ReactElement {
  const org = windows.org;
  const today = org.points[org.points.length - 1];
  const change = changeLine(org);
  const clock = chartClock(observedAt);
  const repoParts = MERGED_PR_SCOPES.filter(
    (scope): scope is Exclude<MergedPrScope, 'org'> => scope !== 'org'
  )
    .map(scope => ({ label: SCOPE_LABEL[scope], total: windows[scope].total }))
    .filter(part => part.total !== null && part.total > 0)
    .map(part => `${part.label} ${int(part.total ?? 0)}`);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: PAD,
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
          {`Shipped, last ${org.days} days`}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            color: CHART_TOKENS.quaternary,
          }}
        >
          {`${shortDate(org.from)} – ${shortDate(org.to)}`}
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
          {org.total === null ? '–' : int(org.total)}
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
            merged pull requests
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
            org.averagePerFullDay === null
              ? '–'
              : int(Math.round(org.averagePerFullDay))
          }
        />
        <Stat
          label='Best day'
          value={
            org.best === null
              ? '–'
              : `${int(org.best.count)} · ${org.days <= 14 ? weekday(org.best.date) : shortDate(org.best.date)}`
          }
        />
        <Stat
          label='Today so far'
          value={today?.count == null ? '–' : int(today.count)}
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
        <Bars summary={org} />
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: 1,
            backgroundColor: CHART_TOKENS.borderDefault,
          }}
        />
        <Axis summary={org} />
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
          {org.complete
            ? repoParts.join('  ·  ')
            : 'Some days are still loading'}
        </div>
        <div style={{ display: 'flex' }}>
          {clock ? `Pacific days · as of ${clock}` : 'Pacific days'}
        </div>
      </div>
    </div>
  );
}
