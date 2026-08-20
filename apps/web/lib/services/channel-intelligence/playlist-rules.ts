/**
 * Playlist freshness + no-invent gate for channelIntelligenceReport.
 * Recoup playlist-target RULES only (taxonomy, no HTTP): no invented
 * placements; distinguish past vs current; warmest = lists hosting 2+
 * peers the artist is not on. PlaylistMap dormant study (2026-07-27):
 * 68.8% of 70,365 independent lists untouched >12 months; 17.4% updated
 * in 90 days.
 */

import type {
  ChannelPlaylistGateResult,
  FetchedPlaylistRow,
  GatedPlaylistRecommendation,
  PlaylistFreshness,
  PlaylistPlacementStatus,
} from './types';

export const CHANNEL_PLAYLIST_TARGET_RULES = `PLAYLIST-TARGET — Recoup playlist-target RULES only. No invented placements. Never emit a playlist name, URL, or follower count that was not in the fetched data. Missing row → omit or unknown. Empty data → say empty. Distinguish past vs current. Drop lists with no add/activity in 12 months. Prefer 90-day freshness when timestamps exist. Missing activity timestamps → unknown, never claim "active". Cap recommended lists at 15–25. Warmest = lists hosting 2+ peers the artist is not on, when peer-placement data exists.`;

export const PLAYLIST_DORMANT_MS = 365 * 24 * 60 * 60 * 1000;
export const PLAYLIST_FRESH_90D_MS = 90 * 24 * 60 * 60 * 1000;
export const PLAYLIST_RECOMMENDATION_CAP_MIN = 15;
export const PLAYLIST_RECOMMENDATION_CAP_MAX = 25;

export const CHANNEL_PLAYLIST_RULE_CASE_IDS = [
  'invented-refused',
  'dormant-dropped',
  'missing-activity-unknown',
  'empty-fetch-empty',
  'cap-15-25',
] as const;

export type ChannelPlaylistRuleCaseId =
  (typeof CHANNEL_PLAYLIST_RULE_CASE_IDS)[number];

export type ChannelPlaylistRuleCaseResult = {
  readonly id: ChannelPlaylistRuleCaseId;
  readonly passed: boolean;
  readonly reason: string;
};

const FRESHNESS_RANK: Record<PlaylistFreshness, number> = {
  '90d': 0,
  '12m': 1,
  unknown: 2,
};

const EMPTY_FETCH_REASON = 'No playlist data fetched.';
const NO_FRESH_REASON = 'No playlists with add/activity in the last 12 months.';

type ActivityClass = PlaylistFreshness | 'dormant';

function parseActivityAt(
  lastActivityAt: string | null | undefined,
  nowMs: number
): ActivityClass {
  const trimmed = lastActivityAt?.trim();
  if (!trimmed) return 'unknown';
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return 'unknown';
  const ageMs = nowMs - parsed;
  if (ageMs > PLAYLIST_DORMANT_MS) return 'dormant';
  if (ageMs <= PLAYLIST_FRESH_90D_MS) return '90d';
  return '12m';
}

function copiedName(row: FetchedPlaylistRow): string | undefined {
  const name = row.name?.trim();
  return name ? name : undefined;
}

function copiedUrl(row: FetchedPlaylistRow): string | undefined {
  const url = row.url?.trim();
  return url ? url : undefined;
}

function copiedFollowerCount(row: FetchedPlaylistRow): number | undefined {
  if (
    typeof row.followerCount !== 'number' ||
    !Number.isFinite(row.followerCount) ||
    row.followerCount < 0
  ) {
    return undefined;
  }
  return row.followerCount;
}

function copiedPlacement(row: FetchedPlaylistRow): PlaylistPlacementStatus {
  return row.placementStatus === 'current' || row.placementStatus === 'past'
    ? row.placementStatus
    : 'unknown';
}

function peerWarmth(row: FetchedPlaylistRow): boolean {
  return (
    typeof row.peerCount === 'number' &&
    Number.isFinite(row.peerCount) &&
    row.peerCount >= 2 &&
    row.artistIsOnList === false
  );
}

function sanitizeFetchedRow(
  row: FetchedPlaylistRow,
  nowMs: number
): GatedPlaylistRecommendation | null {
  const id = row.id?.trim();
  if (!id) return null;
  const activity = parseActivityAt(row.lastActivityAt, nowMs);
  if (activity === 'dormant') return null;

  const recommendation: GatedPlaylistRecommendation = {
    id,
    freshness: activity,
    placementStatus: copiedPlacement(row),
    peerWarmth: peerWarmth(row),
  };
  const name = copiedName(row);
  const url = copiedUrl(row);
  const followerCount = copiedFollowerCount(row);
  return {
    ...recommendation,
    ...(name ? { name } : {}),
    ...(url ? { url } : {}),
    ...(followerCount !== undefined ? { followerCount } : {}),
  };
}

function rankRecommendations(
  a: GatedPlaylistRecommendation,
  b: GatedPlaylistRecommendation
): number {
  if (a.peerWarmth !== b.peerWarmth) return a.peerWarmth ? -1 : 1;
  return FRESHNESS_RANK[a.freshness] - FRESHNESS_RANK[b.freshness];
}

export interface GateChannelPlaylistsInput {
  readonly fetched: readonly FetchedPlaylistRow[] | null | undefined;
  /**
   * Draft recommendations to reconcile. IDs absent from `fetched` are
   * refused; emitted fields always come from the fetched row.
   */
  readonly proposed?: readonly FetchedPlaylistRow[] | null;
  readonly nowIso?: string;
}

/**
 * Hard freshness + no-invent gate. Only fetched names/URLs/follower
 * counts may appear. Dormant lists are dropped. Missing activity is
 * unknown, never "active". Cap is 25 (inside 15–25).
 */
export function gateChannelPlaylists(
  input: GateChannelPlaylistsInput
): ChannelPlaylistGateResult {
  const nowMs = Date.parse(input.nowIso ?? new Date().toISOString());
  const fetched = input.fetched ?? [];
  if (fetched.length === 0) {
    return {
      recommendations: [],
      empty: true,
      emptyReason: EMPTY_FETCH_REASON,
    };
  }

  const fetchedById = new Map<string, FetchedPlaylistRow>();
  for (const row of fetched) {
    const id = row.id?.trim();
    if (id && !fetchedById.has(id)) fetchedById.set(id, row);
  }

  const inventedProposedIds = new Set(
    (input.proposed ?? [])
      .map(row => row.id?.trim())
      .filter((id): id is string => Boolean(id) && !fetchedById.has(id))
  );

  const recommendations = fetched
    .map(row => sanitizeFetchedRow(row, nowMs))
    .filter((row): row is GatedPlaylistRecommendation => row !== null)
    .filter(row => !inventedProposedIds.has(row.id))
    .toSorted(rankRecommendations)
    .slice(0, PLAYLIST_RECOMMENDATION_CAP_MAX);

  if (recommendations.length === 0) {
    return {
      recommendations: [],
      empty: true,
      emptyReason: NO_FRESH_REASON,
    };
  }

  return {
    recommendations,
    empty: false,
    emptyReason: null,
  };
}

const RULE_CASE_NOW = '2026-08-20T00:00:00.000Z';

function evaluateInventedRefused(): ChannelPlaylistRuleCaseResult {
  const fetched: FetchedPlaylistRow[] = [
    {
      id: 'pl_warm',
      name: 'Late Night Indie',
      url: 'https://open.spotify.com/playlist/pl_warm',
      followerCount: 1200,
      lastActivityAt: '2026-07-01T00:00:00.000Z',
    },
  ];
  const gated = gateChannelPlaylists({
    fetched,
    proposed: [
      ...fetched,
      {
        id: 'invented',
        name: 'New Music Friday',
        url: 'https://open.spotify.com/playlist/invented',
        followerCount: 9_000_000,
        lastActivityAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    nowIso: RULE_CASE_NOW,
  });
  const serialized = JSON.stringify(gated);
  const missingFollowers = gateChannelPlaylists({
    fetched: [
      { id: 'pl_nameless', lastActivityAt: '2026-07-01T00:00:00.000Z' },
    ],
    nowIso: RULE_CASE_NOW,
  });
  const passed =
    gated.recommendations.length === 1 &&
    gated.recommendations[0]?.name === 'Late Night Indie' &&
    gated.recommendations[0]?.followerCount === 1200 &&
    gated.recommendations[0]?.url ===
      'https://open.spotify.com/playlist/pl_warm' &&
    !serialized.includes('New Music Friday') &&
    !serialized.includes('9000000') &&
    missingFollowers.recommendations[0]?.name === undefined &&
    missingFollowers.recommendations[0]?.followerCount === undefined &&
    missingFollowers.recommendations[0]?.url === undefined;
  return {
    id: 'invented-refused',
    passed,
    reason: passed
      ? 'Invented name/URL/followers are refused; missing fields are omitted'
      : 'Invented playlist fields were emitted or fetched fields were dropped',
  };
}

function evaluateDormantDropped(): ChannelPlaylistRuleCaseResult {
  const gated = gateChannelPlaylists({
    fetched: [
      {
        id: 'pl_dormant',
        name: 'Abandoned 2019 Mix',
        lastActivityAt: '2025-07-01T00:00:00.000Z',
      },
      {
        id: 'pl_fresh',
        name: 'August Adds',
        lastActivityAt: '2026-07-15T00:00:00.000Z',
      },
      {
        id: 'pl_year',
        name: 'Winter Lane',
        lastActivityAt: '2026-02-01T00:00:00.000Z',
      },
    ],
    nowIso: RULE_CASE_NOW,
  });
  const ids = gated.recommendations.map(row => row.id);
  const passed =
    !ids.includes('pl_dormant') &&
    ids.includes('pl_fresh') &&
    ids.includes('pl_year') &&
    gated.recommendations[0]?.id === 'pl_fresh';
  return {
    id: 'dormant-dropped',
    passed,
    reason: passed
      ? 'Lists with no add/activity in 12 months are dropped; 90-day preferred'
      : 'Dormant list was kept or 90-day list was not preferred',
  };
}

function evaluateMissingActivityUnknown(): ChannelPlaylistRuleCaseResult {
  const gated = gateChannelPlaylists({
    fetched: [{ id: 'pl_unknown', name: 'Undated Editorial' }],
    nowIso: RULE_CASE_NOW,
  });
  const serialized = JSON.stringify(gated).toLowerCase();
  const passed =
    gated.recommendations.length === 1 &&
    gated.recommendations[0]?.freshness === 'unknown' &&
    !serialized.includes('active');
  return {
    id: 'missing-activity-unknown',
    passed,
    reason: passed
      ? 'Missing activity timestamps are unknown and never claimed active'
      : 'Missing activity was not marked unknown or claimed active',
  };
}

function evaluateEmptyFetchEmpty(): ChannelPlaylistRuleCaseResult {
  const gated = gateChannelPlaylists({
    fetched: [],
    proposed: [
      {
        id: 'invented',
        name: 'New Music Friday',
        followerCount: 9_000_000,
      },
    ],
    nowIso: RULE_CASE_NOW,
  });
  const omitted = gateChannelPlaylists({
    nowIso: RULE_CASE_NOW,
    fetched: null,
  });
  const passed =
    gated.empty === true &&
    gated.recommendations.length === 0 &&
    gated.emptyReason === EMPTY_FETCH_REASON &&
    omitted.empty === true &&
    omitted.recommendations.length === 0 &&
    omitted.emptyReason === EMPTY_FETCH_REASON;
  return {
    id: 'empty-fetch-empty',
    passed,
    reason: passed
      ? 'Empty fetch says empty and refuses invented proposed lists'
      : 'Empty fetch did not stay empty',
  };
}

function evaluateCap15To25(): ChannelPlaylistRuleCaseResult {
  const fetched = Array.from({ length: 40 }, (_, index) => ({
    id: `pl_${index}`,
    name: `Fresh List ${index}`,
    lastActivityAt: '2026-07-01T00:00:00.000Z',
  }));
  const gated = gateChannelPlaylists({ fetched, nowIso: RULE_CASE_NOW });
  const underCap = gateChannelPlaylists({
    fetched: fetched.slice(0, 10),
    nowIso: RULE_CASE_NOW,
  });
  const passed =
    gated.recommendations.length >= PLAYLIST_RECOMMENDATION_CAP_MIN &&
    gated.recommendations.length <= PLAYLIST_RECOMMENDATION_CAP_MAX &&
    gated.recommendations.length === PLAYLIST_RECOMMENDATION_CAP_MAX &&
    underCap.recommendations.length === 10;
  return {
    id: 'cap-15-25',
    passed,
    reason: passed
      ? 'Recommendations cap at 25 and do not pad below available rows'
      : 'Recommendation cap is outside 15–25 or padded invented rows',
  };
}

export function evaluateChannelPlaylistRuleCase(
  id: ChannelPlaylistRuleCaseId
): ChannelPlaylistRuleCaseResult {
  switch (id) {
    case 'invented-refused':
      return evaluateInventedRefused();
    case 'dormant-dropped':
      return evaluateDormantDropped();
    case 'missing-activity-unknown':
      return evaluateMissingActivityUnknown();
    case 'empty-fetch-empty':
      return evaluateEmptyFetchEmpty();
    case 'cap-15-25':
      return evaluateCap15To25();
  }
}

export function evaluateAllChannelPlaylistRuleCases(): ChannelPlaylistRuleCaseResult[] {
  return CHANNEL_PLAYLIST_RULE_CASE_IDS.map(evaluateChannelPlaylistRuleCase);
}
