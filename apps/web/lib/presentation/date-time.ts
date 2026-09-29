/**
 * Canonical locale/date/time presentation contract (JOV-7092).
 *
 * Two distinct temporal kinds must never be conflated:
 *
 * - **Calendar dates** (`YYYY-MM-DD`, date-only fields) describe a semantic
 *   day. They are formatted and compared without timezone conversion, so
 *   they never shift across days when the viewer's zone changes.
 * - **Instants** (`Date`, ISO timestamps) are a point in time. They render
 *   in the user's intended/current zone unless the domain requires a fixed
 *   zone, which must be declared explicitly. Authoritative timestamps are
 *   persisted independently of presentation.
 *
 * Context precedence (strongest first): explicit user preference →
 * persisted account/workspace preference → task/domain context →
 * locale/device settings → product default. An explicit or persisted
 * preference is never silently overridden by inferred locale changes.
 */

export interface TemporalContext {
  /** BCP-47 locale tag, e.g. 'en-US', 'de-DE'. */
  readonly locale: string;
  /** IANA time zone, e.g. 'America/New_York'. */
  readonly timeZone: string;
  /** 12/24-hour presentation; follows locale when unset. */
  readonly hourCycle?: 'h11' | 'h12' | 'h23' | 'h24';
}

export interface TemporalContextSignals {
  /** Explicit in-session user preference. */
  readonly preference?: Partial<TemporalContext> | null;
  /** Persisted account/workspace preference. */
  readonly persisted?: Partial<TemporalContext> | null;
  /** Task/domain-required values (e.g. an event's fixed zone). */
  readonly domain?: Partial<TemporalContext> | null;
  /** Locale/device-detected values. */
  readonly detected?: Partial<TemporalContext> | null;
}

export const DEFAULT_TEMPORAL_CONTEXT: TemporalContext = {
  locale: 'en-US',
  timeZone: 'UTC',
};

/**
 * Merge context signals in precedence order. The first non-empty value in
 * explicit → persisted → domain → detected → product default order wins.
 */
export function resolveTemporalContext(
  signals: TemporalContextSignals
): TemporalContext {
  const layers = [
    signals.preference,
    signals.persisted,
    signals.domain,
    signals.detected,
  ];
  const pick = <K extends keyof TemporalContext>(
    key: K
  ): TemporalContext[K] | undefined => {
    for (const layer of layers) {
      const value = layer?.[key];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
    return undefined;
  };
  return {
    locale: pick('locale') ?? DEFAULT_TEMPORAL_CONTEXT.locale,
    timeZone: pick('timeZone') ?? DEFAULT_TEMPORAL_CONTEXT.timeZone,
    hourCycle: pick('hourCycle'),
  };
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True when the input is a calendar-date string with no time component. */
export function isDateOnlyString(
  value: string | Date | null | undefined
): boolean {
  return typeof value === 'string' && DATE_ONLY_RE.test(value);
}

function safeFormatter(
  locale: string,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch {
    return new Intl.DateTimeFormat(DEFAULT_TEMPORAL_CONTEXT.locale, {
      ...options,
      timeZone: 'UTC',
    });
  }
}

/**
 * Key an instant to its `YYYY-MM-DD` calendar date **in the given zone**.
 * The zone is always explicit — callers declare which zone owns the day
 * boundary (viewer zone, event zone, reporting zone).
 */
export function instantToDateKey(instant: Date, timeZone: string): string {
  const formatter = safeFormatter('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(instant);
  const get = (type: string) => parts.find(part => part.type === type)?.value;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  if (!year || !month || !day) {
    throw new TypeError('Could not format date parts');
  }
  return `${year}-${month}-${day}`;
}

/**
 * Format a calendar date without timezone conversion. `YYYY-MM-DD` input
 * stays on the same semantic day for every viewer and every zone.
 */
export function formatCalendarDate(
  value: string,
  context: Partial<TemporalContext> = {},
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  const match = DATE_ONLY_RE.exec(value);
  if (!match) {
    throw new TypeError(`Expected a YYYY-MM-DD calendar date, got: ${value}`);
  }
  const utc = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );
  return safeFormatter(context.locale ?? DEFAULT_TEMPORAL_CONTEXT.locale, {
    ...options,
    timeZone: 'UTC',
  }).format(utc);
}

/**
 * Format an instant in the resolved context. Renders in the declared zone
 * with locale date ordering and the context's 12/24-hour cycle.
 */
export function formatInstant(
  instant: Date | string,
  context: Partial<TemporalContext> = {},
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }
): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Invalid instant');
  }
  return safeFormatter(context.locale ?? DEFAULT_TEMPORAL_CONTEXT.locale, {
    ...options,
    timeZone: context.timeZone ?? DEFAULT_TEMPORAL_CONTEXT.timeZone,
    hourCycle: context.hourCycle,
  }).format(date);
}
