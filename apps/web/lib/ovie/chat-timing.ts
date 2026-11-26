/**
 * Hop timing for founder Ovie (`ov`) chat turns. Numbers and fixed tokens
 * only: never message text, ids, or user data.
 *
 * Hops, measured from the request entering POST:
 * - auth: request in -> auth, gates, body parse and founder access done
 * - preflight: access done -> Summer fetch about to start (ingest + session)
 * - session: response built -> Summer fetch started (session history read)
 * - summer_connect: Summer fetch started -> response headers received
 * - summer_first_token: Summer fetch started -> first text delta forwarded
 *
 * `auth` and `preflight` are known when response headers are built, so they
 * ride the Server-Timing header. `summer_connect` and `summer_first_token`
 * are only known once the stream is running; they ride a transient stream
 * data part and the single structured log line.
 */

export const OVIE_TIMING_HOPS = [
  'auth',
  'preflight',
  'session',
  'summer_connect',
  'summer_first_token',
] as const;

export type OvieTimingHop = (typeof OVIE_TIMING_HOPS)[number];

export type OvieTurnTiming = {
  /** Marks the end of a pre-Summer hop (auth or preflight). First call wins. */
  readonly endHop: (hop: 'auth' | 'preflight') => void;
  readonly markSummerFetchStart: () => void;
  readonly markSummerConnect: () => void;
  readonly markFirstToken: () => void;
  readonly snapshot: () => Partial<Record<OvieTimingHop, number>>;
};

export function createOvieTurnTiming(
  now: () => number = () => performance.now()
): OvieTurnTiming {
  const startedAt = now();
  let lastBoundary = startedAt;
  let fetchStartedAt: number | null = null;
  const hops: Partial<Record<OvieTimingHop, number>> = {};
  const round = (value: number) => Math.max(0, Math.round(value * 10) / 10);
  return {
    endHop: hop => {
      if (hops[hop] !== undefined) return;
      const at = now();
      hops[hop] = round(at - lastBoundary);
      lastBoundary = at;
    },
    markSummerFetchStart: () => {
      if (fetchStartedAt !== null) return;
      fetchStartedAt = now();
      hops.session = round(fetchStartedAt - lastBoundary);
    },
    markSummerConnect: () => {
      if (fetchStartedAt === null || hops.summer_connect !== undefined) return;
      hops.summer_connect = round(now() - fetchStartedAt);
    },
    markFirstToken: () => {
      if (fetchStartedAt === null || hops.summer_first_token !== undefined) {
        return;
      }
      hops.summer_first_token = round(now() - fetchStartedAt);
    },
    snapshot: () => ({ ...hops }),
  };
}

/** `Server-Timing` value for whichever hops are known so far. */
export function ovieServerTiming(
  hops: Partial<Record<OvieTimingHop, number>>
): string {
  return OVIE_TIMING_HOPS.filter(hop => hops[hop] !== undefined)
    .map(hop => `${hop};dur=${hops[hop]}`)
    .join(', ');
}

/** The single structured log line for an ov turn: fixed tokens and numbers. */
export function ovieTimingLogLine(
  hops: Partial<Record<OvieTimingHop, number>>
): string {
  const parts = OVIE_TIMING_HOPS.map(hop => `${hop}_ms=${hops[hop] ?? -1}`);
  return `ovie_turn_timing ${parts.join(' ')}`;
}
