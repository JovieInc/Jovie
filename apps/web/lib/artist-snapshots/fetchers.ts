import 'server-only';

import type { ArtistDailySnapshotProvenance } from '@/lib/db/schema/artist-daily-snapshots';
import {
  getMusicBrainzArtist,
  MusicBrainzError,
} from '@/lib/dsp-enrichment/providers/musicbrainz';
import { serverFetch } from '@/lib/http/server-fetch';
import {
  DEFAULT_USER_AGENT,
  ExtractionError,
} from '@/lib/ingestion/strategies/base';
import { fetchInstagramDocument } from '@/lib/ingestion/strategies/instagram';
import { fetchYouTubeAboutDocument } from '@/lib/ingestion/strategies/youtube';
import { parseYouTubeChannelInput } from '@/lib/youtube/resolve-channel';
import { publicUrlWithoutSecrets } from './contract';
import {
  hasInstagramCounts,
  hasYouTubeCounts,
  htmlLooksLoggedIn,
  parseInstagramOpenGraphCounts,
  parseYouTubeLoggedOutCounts,
  youtubeCountsFromApiStatistics,
} from './counts';
import { RobotsCache } from './robots';
import type { SourceFetchResult } from './run';
import {
  extractWikidataQid,
  readEnwikiTitle,
  readPageviews,
  wikidataSitelinksUrl,
  wikimediaPageviewsUrl,
} from './wikipedia';

const WIKIMEDIA_USER_AGENT =
  'JovieArtistSnapshots/1.0 (https://jov.ie; public-metrics)';

const YOUTUBE_DATA_API = 'https://www.googleapis.com/youtube/v3/channels';

function provenance(input: {
  method: string;
  publicUrl: string | null;
  httpStatus: number | null;
  robots: ArtistDailySnapshotProvenance['robots'];
  userAgent: string;
  wikidataQid?: string;
  musicbrainzId?: string;
}): ArtistDailySnapshotProvenance {
  return {
    method: input.method,
    publicUrl: input.publicUrl,
    httpStatus: input.httpStatus,
    robots: input.robots,
    userAgent: input.userAgent,
    access: 'logged_out',
    ...(input.wikidataQid ? { wikidataQid: input.wikidataQid } : {}),
    ...(input.musicbrainzId ? { musicbrainzId: input.musicbrainzId } : {}),
  };
}

function httpFailure(
  status: number,
  reason: string,
  backoff: boolean
): SourceFetchResult {
  return { kind: 'failure', reason, httpStatus: status, backoff };
}

function classifyStatus(status: number): SourceFetchResult | null {
  if (status >= 200 && status < 300) return null;
  if (status === 404) return { kind: 'skip', reason: 'not_found' };
  if (status === 429) return httpFailure(status, 'rate_limited', true);
  if (status >= 500) return httpFailure(status, 'upstream_error', true);
  return httpFailure(status, 'upstream_rejected', false);
}

function fromExtractionError(error: ExtractionError): SourceFetchResult {
  if (
    error.code === 'NOT_FOUND' ||
    error.code === 'INVALID_URL' ||
    error.code === 'INVALID_HOST'
  ) {
    return { kind: 'skip', reason: error.code.toLowerCase() };
  }
  const backoff =
    error.code === 'RATE_LIMITED' ||
    error.code === 'FETCH_TIMEOUT' ||
    (error.statusCode !== undefined && error.statusCode >= 500);
  return {
    kind: 'failure',
    reason: error.code.toLowerCase(),
    httpStatus: error.statusCode,
    backoff,
  };
}

async function readJson(response: Response): Promise<unknown> {
  return (await response.json()) as unknown;
}

export async function fetchRobotsText(
  url: string
): Promise<{ status: number; body: string } | null> {
  const response = await serverFetch(url, {
    method: 'GET',
    timeoutMs: 8_000,
    context: 'artist snapshot robots.txt',
    headers: {
      Accept: 'text/plain',
      'User-Agent': DEFAULT_USER_AGENT,
    },
  });
  const body = (await response.text()).slice(0, 200_000);
  return { status: response.status, body };
}

export function createSnapshotRobotsCache(): RobotsCache {
  return new RobotsCache(fetchRobotsText);
}

export async function fetchYouTubeSnapshot(
  channelUrl: string,
  robots: RobotsCache
): Promise<SourceFetchResult> {
  const publicUrl = publicUrlWithoutSecrets(channelUrl);
  const apiKey = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (apiKey) {
    const ref = parseYouTubeChannelInput(channelUrl);
    if (!ref) return { kind: 'skip', reason: 'invalid_channel' };
    const url = new URL(YOUTUBE_DATA_API);
    url.searchParams.set('part', 'statistics');
    url.searchParams.set('key', apiKey);
    if (ref.kind === 'handle')
      url.searchParams.set('forHandle', `@${ref.value}`);
    if (ref.kind === 'id') url.searchParams.set('id', ref.value);
    if (ref.kind === 'username') url.searchParams.set('forUsername', ref.value);

    const response = await serverFetch(url, {
      method: 'GET',
      timeoutMs: 10_000,
      context: 'artist snapshot youtube data api',
      retry: { maxRetries: 1, baseDelayMs: 1_100, maxDelayMs: 4_000 },
    });
    const classified = classifyStatus(response.status);
    if (classified) return classified;
    const payload = (await readJson(response)) as {
      items?: Array<{
        id?: string;
        statistics?: {
          viewCount?: string;
          subscriberCount?: string;
          videoCount?: string;
          hiddenSubscriberCount?: boolean;
        };
      }>;
    };
    const item = payload.items?.[0];
    if (!item?.id) return { kind: 'skip', reason: 'channel_not_found' };
    const counts = youtubeCountsFromApiStatistics({
      channelId: item.id,
      ...item.statistics,
    });
    if (!hasYouTubeCounts(counts)) {
      return { kind: 'failure', reason: 'no_public_counts', backoff: false };
    }
    return {
      kind: 'ready',
      rawValues: { ...counts },
      provenance: provenance({
        method: 'youtube_data_api_v3',
        publicUrl,
        httpStatus: response.status,
        robots: 'not_applicable',
        userAgent: 'youtube-data-api-v3',
      }),
    };
  }

  const decision = await robots.decide(channelUrl, DEFAULT_USER_AGENT);
  if (decision === 'disallowed')
    return { kind: 'skip', reason: 'robots_disallowed' };
  if (decision === 'unavailable') {
    return { kind: 'failure', reason: 'robots_unavailable', backoff: true };
  }

  try {
    const html = await fetchYouTubeAboutDocument(channelUrl, {
      headers: { 'User-Agent': DEFAULT_USER_AGENT },
    });
    if (htmlLooksLoggedIn(html)) {
      return { kind: 'failure', reason: 'logged_in_payload', backoff: false };
    }
    const counts = parseYouTubeLoggedOutCounts(html);
    if ('refused' in counts) {
      return { kind: 'failure', reason: 'logged_in_payload', backoff: false };
    }
    if (!hasYouTubeCounts(counts)) {
      return { kind: 'failure', reason: 'no_public_counts', backoff: false };
    }
    return {
      kind: 'ready',
      rawValues: { ...counts },
      provenance: provenance({
        method: 'youtube_logged_out_page',
        publicUrl,
        httpStatus: 200,
        robots: 'allowed',
        userAgent: DEFAULT_USER_AGENT,
      }),
    };
  } catch (error) {
    if (error instanceof ExtractionError) return fromExtractionError(error);
    throw error;
  }
}

export async function fetchInstagramSnapshot(
  profileUrl: string,
  robots: RobotsCache
): Promise<SourceFetchResult> {
  const decision = await robots.decide(profileUrl, DEFAULT_USER_AGENT);
  if (decision === 'disallowed')
    return { kind: 'skip', reason: 'robots_disallowed' };
  if (decision === 'unavailable') {
    return { kind: 'failure', reason: 'robots_unavailable', backoff: true };
  }

  try {
    const html = await fetchInstagramDocument(profileUrl, {
      headers: { 'User-Agent': DEFAULT_USER_AGENT },
    });
    const counts = parseInstagramOpenGraphCounts(html);
    if ('refused' in counts) {
      return { kind: 'failure', reason: 'logged_in_payload', backoff: false };
    }
    if (!hasInstagramCounts(counts)) {
      return { kind: 'failure', reason: 'no_public_counts', backoff: false };
    }
    return {
      kind: 'ready',
      rawValues: { ...counts },
      provenance: provenance({
        method: 'instagram_opengraph',
        publicUrl: publicUrlWithoutSecrets(profileUrl),
        httpStatus: 200,
        robots: 'allowed',
        userAgent: DEFAULT_USER_AGENT,
      }),
    };
  } catch (error) {
    if (error instanceof ExtractionError) return fromExtractionError(error);
    throw error;
  }
}

export async function fetchWikipediaSnapshot(input: {
  readonly musicbrainzId: string;
  readonly pageviewDay: string;
}): Promise<SourceFetchResult> {
  let artist: Awaited<ReturnType<typeof getMusicBrainzArtist>>;
  try {
    artist = await getMusicBrainzArtist(input.musicbrainzId);
  } catch (error) {
    if (error instanceof MusicBrainzError && error.statusCode === 404) {
      return { kind: 'skip', reason: 'musicbrainz_not_found' };
    }
    const status =
      error instanceof MusicBrainzError ? error.statusCode : undefined;
    return {
      kind: 'failure',
      reason: 'musicbrainz_error',
      httpStatus: status,
      backoff: status === 429 || status === undefined || status >= 500,
    };
  }

  const qid = extractWikidataQid(artist?.relations);
  if (!qid) return { kind: 'skip', reason: 'no_wikidata' };

  const sitelinkResponse = await serverFetch(wikidataSitelinksUrl(qid), {
    method: 'GET',
    timeoutMs: 10_000,
    context: 'artist snapshot wikidata sitelinks',
    headers: {
      Accept: 'application/json',
      'User-Agent': WIKIMEDIA_USER_AGENT,
    },
    retry: { maxRetries: 1, baseDelayMs: 1_100, maxDelayMs: 4_000 },
  });
  const sitelinkStatus = classifyStatus(sitelinkResponse.status);
  if (sitelinkStatus) return sitelinkStatus;
  const title = readEnwikiTitle(await readJson(sitelinkResponse), qid);
  if (!title) return { kind: 'skip', reason: 'no_enwiki' };

  const pageviewResponse = await serverFetch(
    wikimediaPageviewsUrl(title, input.pageviewDay),
    {
      method: 'GET',
      timeoutMs: 10_000,
      context: 'artist snapshot wikimedia pageviews',
      headers: {
        Accept: 'application/json',
        'User-Agent': WIKIMEDIA_USER_AGENT,
      },
      retry: { maxRetries: 1, baseDelayMs: 1_100, maxDelayMs: 4_000 },
    }
  );
  if (pageviewResponse.status === 404) {
    return { kind: 'skip', reason: 'pageviews_not_ready' };
  }
  const pageviewStatus = classifyStatus(pageviewResponse.status);
  if (pageviewStatus) return pageviewStatus;
  const pageviews = readPageviews(await readJson(pageviewResponse));
  if (pageviews === null) {
    return { kind: 'failure', reason: 'pageviews_unreadable', backoff: false };
  }

  const articleUrl = publicUrlWithoutSecrets(
    `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
  );
  return {
    kind: 'ready',
    rawValues: {
      qid,
      project: 'en.wikipedia',
      article: title,
      pageviews,
      pageviewDay: input.pageviewDay,
    },
    provenance: provenance({
      method: 'wikimedia_pageviews',
      publicUrl: articleUrl,
      httpStatus: pageviewResponse.status,
      robots: 'not_applicable',
      userAgent: WIKIMEDIA_USER_AGENT,
      wikidataQid: qid,
      musicbrainzId: input.musicbrainzId,
    }),
  };
}
