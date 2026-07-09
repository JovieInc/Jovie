import type { OpportunityInboxReportData } from './opportunity-inbox-types';

/**
 * Pure measurement-payload → report-card mapping for the Opportunity Inbox
 * report variant (GH #13178). Emitted by measurement jobs (GH #13176) as
 * suggested_actions rows with kind `experiment.report`.
 *
 * No server imports so the parser stays unit-testable and safe to share with
 * client view code (same posture as opportunity-inbox-tour-dates.ts).
 */

/** Kind emitted by measurement jobs for experiment result reports. */
export const EXPERIMENT_REPORT_KIND = 'experiment.report';

/** Kinds that classify as report cards. Prefix match on `experiment.` keeps
 *  future report-family kinds (e.g. `experiment.summary`) in the family. */
const REPORT_KIND_PREFIXES = ['experiment.report', 'measurement.'] as const;

export function isReportKind(kind: string): boolean {
  return REPORT_KIND_PREFIXES.some(prefix => kind.startsWith(prefix));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function parseSeries(value: unknown): readonly number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const series = value.filter(
    (point): point is number =>
      typeof point === 'number' && Number.isFinite(point)
  );
  // A sparkline needs at least two real points to draw a line.
  return series.length >= 2 ? series : [];
}

function parseBreakdownItems(
  value: unknown
): readonly OpportunityInboxReportData['items'][number][] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: OpportunityInboxReportData['items'][number][] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    const label = asNonEmptyString(record?.label);
    if (!record || !label) {
      continue;
    }
    const deltaPercent = asFiniteNumber(record.deltaPercent);
    const detail = asNonEmptyString(record.detail);
    items.push({
      label,
      ...(deltaPercent === null ? {} : { deltaPercent }),
      ...(detail === null ? {} : { detail }),
    });
  }
  return items;
}

function parseNextStep(value: unknown): OpportunityInboxReportData['nextStep'] {
  const record = asRecord(value);
  const label = asNonEmptyString(record?.label);
  const kind = asNonEmptyString(record?.kind);
  if (!record || !label || !kind) {
    return null;
  }
  const payload = asRecord(record.payload);
  const rationale = asNonEmptyString(record.rationale);
  return {
    label,
    kind,
    ...(payload === null ? {} : { payload }),
    ...(rationale === null ? {} : { rationale }),
  };
}

/**
 * Formats a signed percent delta for display, e.g. `+5.4%` / `−2.1%`.
 * One decimal place, trailing `.0` trimmed.
 */
export function formatReportDelta(deltaPercent: number): string {
  const magnitude = Math.abs(deltaPercent).toFixed(1).replace(/\.0$/, '');
  if (deltaPercent > 0) {
    return `+${magnitude}%`;
  }
  if (deltaPercent < 0) {
    return `−${magnitude}%`;
  }
  return '0%';
}

/**
 * Parses a measurement payload into report-card data. Returns null when the
 * payload is missing the minimum viable shape (a metric label + finite delta),
 * so malformed measurement rows degrade to the plain suggestion card instead
 * of crashing the inbox feed.
 */
export function parseReportMeasurement(
  payload: unknown
): OpportunityInboxReportData | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const measurement = asRecord(record.measurement) ?? record;
  const metricLabel =
    asNonEmptyString(measurement.metricLabel) ??
    asNonEmptyString(measurement.metric);
  const deltaPercent = asFiniteNumber(measurement.deltaPercent);

  if (!metricLabel || deltaPercent === null) {
    return null;
  }

  return {
    metricLabel,
    deltaPercent,
    deltaDisplay: formatReportDelta(deltaPercent),
    direction: deltaPercent > 0 ? 'up' : deltaPercent < 0 ? 'down' : 'flat',
    series: parseSeries(measurement.series),
    items: parseBreakdownItems(measurement.items),
    experimentId: asNonEmptyString(record.experimentId),
    nextStep: parseNextStep(record.nextStep),
  };
}
