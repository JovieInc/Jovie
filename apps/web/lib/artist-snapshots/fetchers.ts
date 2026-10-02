import 'server-only';

import type { ArtistDailySnapshotProvenance } from '@/lib/db/schema/artist-daily-snapshots';
import {
  getMusicBrainzArtist,
  MusicBrainzError,
} from '@/lib/dsp-enrichment/providers/musicbrainz';
import { serverFetch } from '@/lib/http/server-fetch';
import { parseYouTubeChannelInput } from '@/lib/youtube/resolve-channel';
import { publicUrlWithoutSecrets } from './contract';
import { hasYouTubeCounts, youtubeCountsFromApiStatistics } from './counts';
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

const JSON_API_RETRY = {
  maxRetries: 1,
  baseDelayMs: 1_100,
  maxDelayMs: 4_000,
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

function classifyStatus(status: number): SourceFetchResult | null {
  if (status >= 200 && status < 300) return null;
  if (status === 404) return { kind: 'skip', reason: 'not_found' };
  if (status === 429)
    return {
      kind: 'failure',
      reason: 'rate_limited',
      httpStatus: 429,
      backoff: true,
    };
  if (status >= 500)
    return {
      kind: 'failure',
      reason: 'upstream_error',
      httpStatus: status,
      backoff: true,
    };
  return {
    kind: 'failure',
    reason: 'upstream_rejected',
    httpStatus: status,
    backoff: false,
  };
}

export async function fetchYouTubeSnapshot(
  channelUrl: string
): Promise<SourceFetchResult> {
  const publicUrl = publicUrlWithoutSecrets(channelUrl);
  const apiKey = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey) return { kind: 'skip', reason: 'no_youtube_api_key' };
  const ref = parseYouTubeChannelInput(channelUrl);
  if (!ref) return { kind: 'skip', reason: 'invalid_channel' };
  const url = new URL(YOUTUBE_DATA_API);
  url.searchParams.set('part', 'statistics');
  url.searchParams.set('key', apiKey);
  if (ref.kind === 'handle') url.searchParams.set('forHandle', `@${ref.value}`);
  else if (ref.kind === 'id') url.searchParams.set('id', ref.value);
  else url.searchParams.set('forUsername', ref.value);

  const response = await serverFetch(url, {
    method: 'GET',
    timeoutMs: 10_000,
    context: 'artist snapshot youtube data api',
    retry: JSON_API_RETRY,
  });
  const classified = classifyStatus(response.status);
  if (classified) return classified;
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
      userAgent: 'youtube-data-api-v3',
    }),
  };
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

  const wikimediaHeaders = {
    Accept: 'application/json',
    'User-Agent': WIKIMEDIA_USER_AGENT,
  } as const;
  const sitelinkResponse = await serverFetch(wikidataSitelinksUrl(qid), {
    method: 'GET',
    timeoutMs: 10_000,
    context: 'artist snapshot wikidata sitelinks',
    headers: wikimediaHeaders,
    retry: JSON_API_RETRY,
  });
  const sitelinkStatus = classifyStatus(sitelinkResponse.status);
  if (sitelinkStatus) return sitelinkStatus;
  const title = readEnwikiTitle(await sitelinkResponse.json(), qid);
  if (!title) return { kind: 'skip', reason: 'no_enwiki' };

  const pageviewResponse = await serverFetch(
    wikimediaPageviewsUrl(title, input.pageviewDay),
    {
      method: 'GET',
      timeoutMs: 10_000,
      context: 'artist snapshot wikimedia pageviews',
      headers: wikimediaHeaders,
      retry: JSON_API_RETRY,
    }
  );
  if (pageviewResponse.status === 404) {
    return { kind: 'skip', reason: 'pageviews_not_ready' };
  }
  const pageviewStatus = classifyStatus(pageviewResponse.status);
  if (pageviewStatus) return pageviewStatus;
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
