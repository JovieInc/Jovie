/**
 * Playlist freshness + no-invent gate for channelIntelligenceReport.
 *
 * Stolen RULES only from Recoup recoup-research-playlist-targets
 * (no API, hooks, or HTTP). Freshness floors from PlaylistMap
 * 2026-07-27 dormant study + 2026-08-13 pitching workflow.
 */

export const PLAYLIST_DORMANT_DAYS = 365;
export const PLAYLIST_FRESH_DAYS = 90;
export const PLAYLIST_RECOMMEND_MIN = 15;
export const PLAYLIST_RECOMMEND_MAX = 25;

export const CHANNEL_INTEL_PLAYLIST_FRESHNESS_RULES = `PLAYLIST FRESHNESS + NO-INVENT GATE — evidence, not vibes.
Never emit a playlist name, URL, or follower count that was not in the fetched data. If a row is missing, omit it or mark unknown. Empty fetch → empty. Do not fabricate.
Drop lists with no add (or equivalent activity) in 12 months. Prefer lists updated in 90 days when activity timestamps exist.
Cap recommended lists at 15–25. Quality over a graveyard dump.
If activity timestamps are absent, do not invent them; mark unknown and do not claim "active."
Optional peer-warmth: if peer-placement data exists, prefer lists that already host 2+ peers and not this artist. Skip if that data is not in the payload.`;

export const CHANNEL_INTEL_PLAYLIST_CASE_IDS = [
  'invented-playlist-refused',
  'dormant-12m-dropped',
  'missing-activity-unknown',
  'empty-fetch-empty',
  'recommend-cap-15-25',
] as const;

export type ChannelIntelPlaylistCaseId =
  (typeof CHANNEL_INTEL_PLAYLIST_CASE_IDS)[number];

export type PlaylistActivityStatus =
  | 'fresh_90d'
  | 'active_12m'
  | 'dormant'
  | 'unknown';

export type PlaylistPeerWarmth = 'warm' | 'none' | 'skipped';

export type PlaylistDropReason =
  | 'invented'
  | 'dormant'
  | 'missing_identity'
  | 'unknown_activity'
  | 'cap'
  | null;

export interface FetchedPlaylistRow {
  readonly name?: string | null;
  readonly url?: string | null;
  readonly followerCount?: number | null;
  readonly lastAddAt?: string | null;
  readonly lastActivityAt?: string | null;
  readonly peerPlacementCount?: number | null;
  readonly artistIsOnList?: boolean | null;
}

export interface GatedPlaylistTarget {
  readonly name: string | null;
  readonly url: string | null;
  readonly followerCount: number | null;
  readonly activityStatus: PlaylistActivityStatus;
  readonly recommended: boolean;
  readonly peerWarmth: PlaylistPeerWarmth;
  readonly dropReason: PlaylistDropReason;
}

export interface PlaylistFreshnessGateResult {
  readonly fetchedCount: number;
  readonly recommended: readonly GatedPlaylistTarget[];
  readonly reviewed: readonly GatedPlaylistTarget[];
  readonly empty: boolean;
  readonly summary: string;
}

export type ChannelIntelPlaylistCaseResult = {
  readonly id: ChannelIntelPlaylistCaseId;
  readonly passed: boolean;
  readonly reason: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function normalizeToken(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function finiteFollowerCount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseActivityMs(row: FetchedPlaylistRow): number | null {
  const raw = row.lastAddAt ?? row.lastActivityAt;
  if (!raw?.trim()) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function activityStatusAt(
  activityMs: number | null,
  nowMs: number
): PlaylistActivityStatus {
  if (activityMs == null) return 'unknown';
  const ageDays = (nowMs - activityMs) / MS_PER_DAY;
  if (ageDays > PLAYLIST_DORMANT_DAYS) return 'dormant';
  if (ageDays <= PLAYLIST_FRESH_DAYS) return 'fresh_90d';
  return 'active_12m';
}

function peerWarmthFor(
  row: FetchedPlaylistRow,
  peerDataPresent: boolean
): PlaylistPeerWarmth {
  if (!peerDataPresent) return 'skipped';
  if (
    typeof row.peerPlacementCount === 'number' &&
    Number.isFinite(row.peerPlacementCount) &&
    row.peerPlacementCount >= 2 &&
    row.artistIsOnList === false
  ) {
    return 'warm';
  }
  return 'none';
}

function recommendationRank(target: GatedPlaylistTarget): number {
  const warmth = target.peerWarmth === 'warm' ? 0 : 1;
  const freshness =
    target.activityStatus === 'fresh_90d'
      ? 0
      : target.activityStatus === 'active_12m'
        ? 1
        : 2;
  return warmth * 10 + freshness;
}

function identityFromFetched(fetched: readonly FetchedPlaylistRow[]): {
  readonly names: ReadonlySet<string>;
  readonly urls: ReadonlySet<string>;
  readonly followerByName: ReadonlyMap<string, number | null>;
  readonly followerByUrl: ReadonlyMap<string, number | null>;
} {
  const names = new Set<string>();
  const urls = new Set<string>();
  const followerByName = new Map<string, number | null>();
  const followerByUrl = new Map<string, number | null>();

  for (const row of fetched) {
    const name = normalizeToken(row.name);
    const url = normalizeToken(row.url);
    const followers = finiteFollowerCount(row.followerCount);
    if (name) {
      names.add(name);
      if (!followerByName.has(name)) followerByName.set(name, followers);
    }
    if (url) {
      urls.add(url);
      if (!followerByUrl.has(url)) followerByUrl.set(url, followers);
    }
  }

  return { names, urls, followerByName, followerByUrl };
}

function fetchedFollowerFor(
  identity: { readonly name: string | null; readonly url: string | null },
  index: ReturnType<typeof identityFromFetched>
): number | null {
  if (identity.name && index.followerByName.has(identity.name)) {
    return index.followerByName.get(identity.name) ?? null;
  }
  if (identity.url && index.followerByUrl.has(identity.url)) {
    return index.followerByUrl.get(identity.url) ?? null;
  }
  return null;
}

function buildSummary(result: {
  readonly empty: boolean;
  readonly fetchedCount: number;
  readonly recommendedCount: number;
  readonly unknownCount: number;
  readonly dormantCount: number;
  readonly inventedCount: number;
}): string {
  if (result.empty) {
    return 'Empty playlist fetch. No names, URLs, or follower counts to emit.';
  }
  const parts = [
    `${result.fetchedCount} fetched`,
    `${result.recommendedCount} recommended (capped ${PLAYLIST_RECOMMEND_MIN}–${PLAYLIST_RECOMMEND_MAX})`,
  ];
  if (result.unknownCount > 0) {
    parts.push(`${result.unknownCount} activity unknown`);
  }
  if (result.dormantCount > 0) {
    parts.push(`${result.dormantCount} dormant dropped`);
  }
  if (result.inventedCount > 0) {
    parts.push(`${result.inventedCount} invented refused`);
  }
  return parts.join('. ');
}

/**
 * Gate playlist rows to fetched evidence only. Proposed names/URLs/counts
 * that were never fetched are refused. Dormant lists are dropped.
 */
export function gatePlaylistTargets(input: {
  readonly fetched: readonly FetchedPlaylistRow[];
  readonly proposed?: readonly FetchedPlaylistRow[];
  readonly nowIso?: string;
}): PlaylistFreshnessGateResult {
  const fetched = input.fetched;
  const nowMs = Date.parse(input.nowIso ?? new Date().toISOString());
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const index = identityFromFetched(fetched);
  const peerDataPresent = fetched.some(
    row =>
      typeof row.peerPlacementCount === 'number' &&
      Number.isFinite(row.peerPlacementCount)
  );

  if (fetched.length === 0) {
    const inventedCount = input.proposed?.length ?? 0;
    const inventedRows = (input.proposed ?? []).map(() => ({
      name: null,
      url: null,
      followerCount: null,
      activityStatus: 'unknown' as const,
      recommended: false,
      peerWarmth: 'skipped' as const,
      dropReason: 'invented' as const,
    }));
    return {
      fetchedCount: 0,
      recommended: [],
      reviewed: inventedRows,
      empty: true,
      summary: buildSummary({
        empty: true,
        fetchedCount: 0,
        recommendedCount: 0,
        unknownCount: 0,
        dormantCount: 0,
        inventedCount,
      }),
    };
  }

  const reviewed: GatedPlaylistTarget[] = [];

  for (const row of input.proposed ?? []) {
    const nameKey = normalizeToken(row.name);
    const urlKey = normalizeToken(row.url);
    const nameKnown = nameKey ? index.names.has(nameKey) : false;
    const urlKnown = urlKey ? index.urls.has(urlKey) : false;
    if (nameKnown || urlKnown) continue;
    reviewed.push({
      name: null,
      url: null,
      followerCount: null,
      activityStatus: 'unknown',
      recommended: false,
      peerWarmth: 'skipped',
      dropReason: 'invented',
    });
  }

  for (const row of fetched) {
    const rawName = row.name?.trim() || null;
    const rawUrl = row.url?.trim() || null;
    const nameKey = normalizeToken(rawName);
    const urlKey = normalizeToken(rawUrl);
    const hasIdentity = Boolean(nameKey || urlKey);

    if (!hasIdentity) {
      reviewed.push({
        name: null,
        url: null,
        followerCount: null,
        activityStatus: 'unknown',
        recommended: false,
        peerWarmth: 'skipped',
        dropReason: 'missing_identity',
      });
      continue;
    }

    const nameKnown = nameKey ? index.names.has(nameKey) : true;
    const urlKnown = urlKey ? index.urls.has(urlKey) : true;
    if (!nameKnown || !urlKnown) {
      reviewed.push({
        name: null,
        url: null,
        followerCount: null,
        activityStatus: 'unknown',
        recommended: false,
        peerWarmth: 'skipped',
        dropReason: 'invented',
      });
      continue;
    }

    const fetchedFollowers = fetchedFollowerFor(
      { name: nameKey, url: urlKey },
      index
    );
    const proposedFollowers = finiteFollowerCount(row.followerCount);
    const followerCount =
      proposedFollowers != null &&
      fetchedFollowers != null &&
      proposedFollowers !== fetchedFollowers
        ? null
        : fetchedFollowers;

    const status = activityStatusAt(parseActivityMs(row), safeNowMs);
    const warmth = peerWarmthFor(row, peerDataPresent);
    const dropReason: PlaylistDropReason =
      status === 'dormant'
        ? 'dormant'
        : status === 'unknown'
          ? 'unknown_activity'
          : null;

    reviewed.push({
      name: nameKnown ? rawName : null,
      url: urlKnown ? rawUrl : null,
      followerCount,
      activityStatus: status,
      recommended: false,
      peerWarmth: warmth,
      dropReason,
    });
  }

  const eligible = reviewed
    .map((target, indexInReviewed) => ({ target, indexInReviewed }))
    .filter(
      ({ target }) =>
        target.dropReason == null &&
        (target.activityStatus === 'fresh_90d' ||
          target.activityStatus === 'active_12m')
    )
    .toSorted((a, b) => {
      const rankDelta =
        recommendationRank(a.target) - recommendationRank(b.target);
      if (rankDelta !== 0) return rankDelta;
      return a.indexInReviewed - b.indexInReviewed;
    });

  const kept = eligible.slice(0, PLAYLIST_RECOMMEND_MAX);
  const keptIndexes = new Set(kept.map(item => item.indexInReviewed));

  const finalized = reviewed.map((target, indexInReviewed) => {
    if (keptIndexes.has(indexInReviewed)) {
      return { ...target, recommended: true, dropReason: null };
    }
    if (
      target.dropReason == null &&
      (target.activityStatus === 'fresh_90d' ||
        target.activityStatus === 'active_12m')
    ) {
      return { ...target, recommended: false, dropReason: 'cap' };
    }
    return target;
  });

  const recommended = finalized.filter(target => target.recommended);
  const unknownCount = finalized.filter(
    target => target.activityStatus === 'unknown'
  ).length;
  const dormantCount = finalized.filter(
    target => target.dropReason === 'dormant'
  ).length;
  const inventedCount = finalized.filter(
    target => target.dropReason === 'invented'
  ).length;

  return {
    fetchedCount: fetched.length,
    recommended,
    reviewed: finalized,
    empty: false,
    summary: buildSummary({
      empty: false,
      fetchedCount: fetched.length,
      recommendedCount: recommended.length,
      unknownCount,
      dormantCount,
      inventedCount,
    }),
  };
}

export function formatPlaylistFollowerCount(
  followerCount: number | null
): string {
  return followerCount == null ? 'unknown' : String(followerCount);
}

export function formatPlaylistActivity(status: PlaylistActivityStatus): string {
  switch (status) {
    case 'fresh_90d':
      return 'updated in 90 days';
    case 'active_12m':
      return 'updated in 12 months';
    case 'dormant':
      return 'dormant';
    case 'unknown':
      return 'unknown';
  }
}

function daysAgoIso(nowIso: string, days: number): string {
  const nowMs = Date.parse(nowIso);
  return new Date(nowMs - days * MS_PER_DAY).toISOString();
}

const EVAL_NOW = '2026-08-20T00:00:00.000Z';

export function evaluateChannelIntelPlaylistCase(
  id: ChannelIntelPlaylistCaseId
): ChannelIntelPlaylistCaseResult {
  switch (id) {
    case 'invented-playlist-refused': {
      const gated = gatePlaylistTargets({
        nowIso: EVAL_NOW,
        fetched: [
          {
            name: 'Late Night Indie',
            url: 'https://open.spotify.com/playlist/fetched01',
            followerCount: 1200,
            lastAddAt: daysAgoIso(EVAL_NOW, 20),
          },
        ],
        proposed: [
          {
            name: 'Late Night Indie',
            url: 'https://open.spotify.com/playlist/fetched01',
            followerCount: 1200,
            lastAddAt: daysAgoIso(EVAL_NOW, 20),
          },
          {
            name: "Today's Top Hits",
            url: 'https://open.spotify.com/playlist/invented99',
            followerCount: 30_000_000,
          },
        ],
      });
      const emittedNames = gated.reviewed
        .flatMap(row => (row.name ? [row.name] : []))
        .concat(gated.recommended.flatMap(row => (row.name ? [row.name] : [])));
      const emittedFollowers = [
        ...gated.reviewed.map(row => row.followerCount),
        ...gated.recommended.map(row => row.followerCount),
      ];
      const inventedRefused = gated.reviewed.some(
        row => row.dropReason === 'invented'
      );
      const passed =
        gated.recommended.length === 1 &&
        gated.recommended[0]?.name === 'Late Night Indie' &&
        inventedRefused &&
        !emittedNames.includes("Today's Top Hits") &&
        !emittedFollowers.includes(30_000_000);
      return {
        id,
        passed,
        reason: passed
          ? 'Invented playlist name and follower count were refused'
          : 'Invented playlist name or follower count leaked',
      };
    }
    case 'dormant-12m-dropped': {
      const gated = gatePlaylistTargets({
        nowIso: EVAL_NOW,
        fetched: [
          {
            name: 'Fresh Cuts',
            followerCount: 800,
            lastAddAt: daysAgoIso(EVAL_NOW, 30),
          },
          {
            name: 'Graveyard Vibes',
            followerCount: 50_000,
            lastAddAt: daysAgoIso(EVAL_NOW, 400),
          },
        ],
      });
      const dropped = gated.reviewed.find(
        row => row.name === 'Graveyard Vibes'
      );
      const kept = gated.recommended.find(row => row.name === 'Fresh Cuts');
      const passed =
        kept != null &&
        dropped?.dropReason === 'dormant' &&
        dropped.recommended === false &&
        !gated.recommended.some(row => row.name === 'Graveyard Vibes');
      return {
        id,
        passed,
        reason: passed
          ? 'List with no add in 12 months was dropped'
          : 'Dormant list was recommended or not marked dormant',
      };
    }
    case 'missing-activity-unknown': {
      const gated = gatePlaylistTargets({
        nowIso: EVAL_NOW,
        fetched: [
          {
            name: 'Mystery List',
            followerCount: 900,
          },
        ],
      });
      const row = gated.reviewed[0];
      const claimsActive = /\bactive\b/i.test(gated.summary);
      const passed =
        row?.activityStatus === 'unknown' &&
        row.recommended === false &&
        row.dropReason === 'unknown_activity' &&
        gated.recommended.length === 0 &&
        !claimsActive;
      return {
        id,
        passed,
        reason: passed
          ? 'Missing activity is unknown and is not claimed active'
          : 'Missing activity was treated as active or recommended',
      };
    }
    case 'empty-fetch-empty': {
      const gated = gatePlaylistTargets({
        nowIso: EVAL_NOW,
        fetched: [],
        proposed: [
          {
            name: 'Invented Chill',
            followerCount: 9999,
          },
        ],
      });
      const leakedName = [...gated.recommended, ...gated.reviewed].some(
        row => row.name === 'Invented Chill'
      );
      const passed =
        gated.empty &&
        gated.recommended.length === 0 &&
        gated.summary.toLowerCase().includes('empty') &&
        !leakedName;
      return {
        id,
        passed,
        reason: passed
          ? 'Empty fetch stays empty and refuses invented names'
          : 'Empty fetch invented a playlist name or was not empty',
      };
    }
    case 'recommend-cap-15-25': {
      const fetched = Array.from({ length: 40 }, (_, i) => ({
        name: `Fresh List ${String(i + 1).padStart(2, '0')}`,
        followerCount: 100 + i,
        lastAddAt: daysAgoIso(EVAL_NOW, 10),
      }));
      const gated = gatePlaylistTargets({
        nowIso: EVAL_NOW,
        fetched,
      });
      const passed =
        gated.recommended.length >= PLAYLIST_RECOMMEND_MIN &&
        gated.recommended.length <= PLAYLIST_RECOMMEND_MAX &&
        gated.recommended.length === PLAYLIST_RECOMMEND_MAX &&
        gated.reviewed.filter(row => row.dropReason === 'cap').length ===
          fetched.length - PLAYLIST_RECOMMEND_MAX;
      return {
        id,
        passed,
        reason: passed
          ? 'Recommended lists are capped at 15–25'
          : `Recommended ${gated.recommended.length} lists; expected ${PLAYLIST_RECOMMEND_MAX}`,
      };
    }
  }
}

export function evaluateAllChannelIntelPlaylistCases(): ChannelIntelPlaylistCaseResult[] {
  return CHANNEL_INTEL_PLAYLIST_CASE_IDS.map(evaluateChannelIntelPlaylistCase);
}
