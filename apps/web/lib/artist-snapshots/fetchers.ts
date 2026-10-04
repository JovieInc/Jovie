import 'server-only';
/**
 * Official APIs from core: YouTube Data API, MusicBrainz, Wikidata, and
 * Wikimedia pageviews. Social HTML is not requested from Jovie server IPs.
 */
import type { ArtistDailySnapshotProvenance } from '@/lib/db/schema/artist-daily-snapshots';
import {
  getMusicBrainzArtist,
  MusicBrainzError,
} from '@/lib/dsp-enrichment/providers/musicbrainz';
import { serverFetch } from '@/lib/http/server-fetch';
import { parseYouTubeChannelInput } from '@/lib/youtube/resolve-channel';
import { publicUrlWithoutSecrets } from './contract';
import { hasYouTubeCounts, youtubeCountsFromApiStatistics } from './counts';
import {
  instagramSnapshotFromCore,
  youtubeLoggedOutPageSnapshotFromCore,
} from './egress';
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

export const YOUTUBE_DATA_API_KEY_UNSET = 'youtube_data_api_key_unset' as const;
/** Logged-out social HTML stubs. Core calls Instagram only; YouTube uses the Data API. */

export const coreSocialHtmlSnapshots = {
  instagram: instagramSnapshotFromCore,
  youtubeLoggedOutPage: youtubeLoggedOutPageSnapshotFromCore,
} as const;

function provenance(input: {
  method: string;
  publicUrl: string | null;
  httpStatus: number | null;
  userAgent: string;
  wikidataQid?: string;
  musicbrainzId?: string;
}): ArtistDailySnapshotProvenance {
  return {
    method: input.method,
    publicUrl: input.publicUrl,
    httpStatus: input.httpStatus,
    robots: 'not_applicable',
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

const JSON_RETRY = {
  maxRetries: 1,
  baseDelayMs: 1_100,
  maxDelayMs: 4_000,
} as const;

async function fetchOfficial(
  url: string | URL,
  context: string,
  userAgent?: string
): Promise<Response | SourceFetchResult> {
  const response = await serverFetch(url, {
    method: 'GET',
    timeoutMs: 10_000,
    context,
    ...(userAgent
      ? { headers: { Accept: 'application/json', 'User-Agent': userAgent } }
      : {}),
    retry: JSON_RETRY,
  });
  return classifyStatus(response.status) ?? response;
}

export async function fetchYouTubeSnapshot(
  channelUrl: string
): Promise<SourceFetchResult> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey) return { kind: 'skip', reason: YOUTUBE_DATA_API_KEY_UNSET };
  const ref = parseYouTubeChannelInput(channelUrl);
  if (!ref) return { kind: 'skip', reason: 'invalid_channel' };
  const url = new URL(YOUTUBE_DATA_API);
  url.searchParams.set('part', 'statistics');
  url.searchParams.set('key', apiKey);
  if (ref.kind === 'handle') url.searchParams.set('forHandle', `@${ref.value}`);
  if (ref.kind === 'id') url.searchParams.set('id', ref.value);
  if (ref.kind === 'username') url.searchParams.set('forUsername', ref.value);
  const response = await fetchOfficial(url, 'artist snapshot youtube data api');
  if ('kind' in response) return response;
  const payload = (await response.json()) as {
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
  if ('refused' in counts) {
    return { kind: 'failure', reason: 'counts_not_exact', backoff: false };
  }
  if (!hasYouTubeCounts(counts)) {
    return { kind: 'failure', reason: 'no_public_counts', backoff: false };
  }
  return {
    kind: 'ready',
    rawValues: { ...counts },
    provenance: provenance({
      method: 'youtube_data_api_v3',
      publicUrl: publicUrlWithoutSecrets(channelUrl),
      httpStatus: response.status,
      userAgent: 'youtube-data-api-v3',
    }),
  };
}

export async function fetchInstagramSnapshot(): Promise<SourceFetchResult> {
  return coreSocialHtmlSnapshots.instagram();
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
  const sitelinkResponse = await fetchOfficial(
    wikidataSitelinksUrl(qid),
    'artist snapshot wikidata sitelinks',
    WIKIMEDIA_USER_AGENT
  );
  if ('kind' in sitelinkResponse) return sitelinkResponse;
  const title = readEnwikiTitle(await sitelinkResponse.json(), qid);
  if (!title) return { kind: 'skip', reason: 'no_enwiki' };
  const pageviewResponse = await fetchOfficial(
    wikimediaPageviewsUrl(title, input.pageviewDay),
    'artist snapshot wikimedia pageviews',
    WIKIMEDIA_USER_AGENT
  );
  if ('kind' in pageviewResponse && pageviewResponse.kind === 'skip') {
    return pageviewResponse.reason === 'not_found'
      ? { kind: 'skip', reason: 'pageviews_not_ready' }
      : pageviewResponse;
  }
  if ('kind' in pageviewResponse) return pageviewResponse;
  const pageviews = readPageviews(await pageviewResponse.json());
  if (pageviews === null) {
    return { kind: 'failure', reason: 'pageviews_unreadable', backoff: false };
  }
  const articleUrl = publicUrlWithoutSecrets(
    `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
  );
  return {
    kind: 'ready',
    rawValues: {
      precision: 'exact',
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
      userAgent: WIKIMEDIA_USER_AGENT,
      wikidataQid: qid,
      musicbrainzId: input.musicbrainzId,
    }),
  };
}
