/**
 * GitHub API headroom for Ovie Fleet, from `api-quota-report.mjs headroom
 * --json` (schema `jovie-actions-quota-headroom/v1`, #23218): per bucket and
 * hour, the minimum and median calls remaining, the share of samples taken
 * with nothing left, and the limit. Pure so it is testable without a feed.
 */
export const HEADROOM_SCHEMA = 'jovie-actions-quota-headroom/v1';
export const GITHUB_CALL_LIMIT = 5000;
const HOUR_MS = 3_600_000;
/** CLAUDE.md: below 20 percent remaining, agents back off. */
const BACK_OFF_FRACTION = 0.2;

export interface HeadroomWindow {
  readonly bucket: string;
  readonly windowStart: string;
  readonly limit: number;
  readonly samples: number;
  readonly minRemaining: number;
  readonly medianRemaining: number;
  readonly exhaustedSamples: number;
  readonly emptyShare: number;
}

export interface HeadroomReport {
  readonly schema: typeof HEADROOM_SCHEMA;
  readonly generatedAt: string;
  readonly windows: readonly HeadroomWindow[];
}

export type HeadroomTone = 'good' | 'warn' | 'bad' | 'neutral';

export interface HeadroomTile {
  readonly value: string;
  readonly line: string;
  readonly tone: HeadroomTone;
  readonly measured: boolean;
}

const UNKNOWN = (why: string): HeadroomTile => ({
  value: 'Unknown',
  line: why,
  tone: 'neutral',
  measured: false,
});

function isWindow(value: unknown): value is HeadroomWindow {
  if (!value || typeof value !== 'object') return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.bucket === 'string' &&
    typeof w.windowStart === 'string' &&
    Number.isFinite(Date.parse(w.windowStart)) &&
    [w.limit, w.samples, w.minRemaining, w.medianRemaining, w.emptyShare].every(
      v => typeof v === 'number' && Number.isFinite(v)
    )
  );
}

/** Parse the CLI JSON; anything off-schema is null, never a guess. */
export function parseHeadroomReport(value: unknown): HeadroomReport | null {
  if (!value || typeof value !== 'object') return null;
  const report = value as Record<string, unknown>;
  if (report.schema !== HEADROOM_SCHEMA || !Array.isArray(report.windows))
    return null;
  return {
    schema: HEADROOM_SCHEMA,
    generatedAt: String(report.generatedAt ?? ''),
    windows: report.windows.filter(isWindow),
  };
}

/**
 * The current hour's tightest bucket against its limit. Red when any bucket
 * had an empty sample this hour, amber under the 20 percent back-off line.
 * Unknown with no report or no sample in the current hour: a quiet feed is
 * not headroom.
 */
export function buildGithubHeadroomTile(
  report: HeadroomReport | null,
  nowMs: number
): HeadroomTile {
  if (!report) return UNKNOWN('No quota samples yet.');
  const hourStart = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
  const current = report.windows.filter(
    window => Date.parse(window.windowStart) === hourStart && window.samples > 0
  );
  if (current.length === 0) return UNKNOWN('No quota samples this hour.');
  const tightest = current.reduce((a, b) =>
    b.minRemaining / (b.limit || GITHUB_CALL_LIMIT) <
    a.minRemaining / (a.limit || GITHUB_CALL_LIMIT)
      ? b
      : a
  );
  const limit = tightest.limit || GITHUB_CALL_LIMIT;
  const empty = current.some(window => window.emptyShare > 0);
  const worstEmpty = Math.max(...current.map(window => window.emptyShare));
  const tone: HeadroomTone = empty
    ? 'bad'
    : tightest.minRemaining < limit * BACK_OFF_FRACTION
      ? 'warn'
      : 'good';
  const parts = [
    `${tightest.bucket} bucket`,
    `median ${tightest.medianRemaining.toLocaleString('en-US')}`,
    empty
      ? `empty in ${(worstEmpty * 100).toFixed(worstEmpty < 0.1 ? 1 : 0)}% of samples`
      : 'never empty this hour',
  ];
  return {
    value: `${tightest.minRemaining.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')}`,
    line: parts.join(' · '),
    tone,
    measured: true,
  };
}
