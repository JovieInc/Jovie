import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema/leads';
import { captureError } from '@/lib/error-tracking';
import { spotifyClient } from '@/lib/spotify';
import { SPOTIFY_API_BASE } from '@/lib/spotify/env';
import { pipelineLog, pipelineWarn } from './pipeline-logger';
import { computePriorityScore } from './priority-score';

interface SpotifyAlbumsResponse {
  items: Array<{
    release_date: string;
    album_type: string;
  }>;
  total: number;
}

export type SpotifyLeadEnrichmentStatus =
  | 'enriched'
  | 'partial'
  | 'skipped'
  | 'error';

export interface SpotifyLeadEnrichment {
  status: SpotifyLeadEnrichmentStatus;
  artistId: string | null;
  spotifyPopularity: number | null;
  spotifyFollowers: number | null;
  spotifyGenres: string[];
  releaseCount: number | null;
  latestReleaseDate: Date | null;
  priorityScore: number | null;
  reason?: string;
}

export interface SpotifyEnrichLeadOptions {
  /**
   * Fetch public Spotify observations without mutating the lead row. Public
   * requalification uses this mode and commits the complete observation in
   * its own public-only update after its revision has been checked.
   */
  persist?: boolean;
  /** Public Spotify URL already observed by the caller. */
  spotifyUrl?: string | null;
}

function extractArtistId(spotifyUrl: string): string | null {
  const match = /\/artist\/([a-zA-Z0-9]+)/.exec(spotifyUrl);
  return match?.[1] ?? null;
}

function skipped(reason: string): SpotifyLeadEnrichment {
  return {
    status: 'skipped',
    artistId: null,
    spotifyPopularity: null,
    spotifyFollowers: null,
    spotifyGenres: [],
    releaseCount: null,
    latestReleaseDate: null,
    priorityScore: null,
    reason,
  };
}

/**
 * Enriches a lead from its public Spotify artist URL.
 *
 * The lead lookup intentionally selects only the Spotify URL when the caller
 * does not provide one. In particular, this path never reads contactEmail or
 * any other private outreach field.
 */
export async function spotifyEnrichLead(
  leadId: string,
  options: SpotifyEnrichLeadOptions = {}
): Promise<SpotifyLeadEnrichment> {
  const shouldPersist = options.persist !== false;
  pipelineLog('enrich', 'Starting Spotify enrichment', { leadId });

  const spotifyUrl = Object.hasOwn(options, 'spotifyUrl')
    ? options.spotifyUrl
    : (
        await db
          .select({ spotifyUrl: leads.spotifyUrl })
          .from(leads)
          .where(eq(leads.id, leadId))
          .limit(1)
      )[0]?.spotifyUrl;
  if (!spotifyUrl) {
    pipelineWarn('enrich', 'Skipped — no Spotify URL on lead', { leadId });
    return skipped('no_spotify_url');
  }

  const artistId = extractArtistId(spotifyUrl);
  if (!artistId) {
    pipelineWarn('enrich', 'Skipped — could not extract artist ID from URL', {
      leadId,
      spotifyUrl,
    });
    return {
      ...skipped('invalid_spotify_url'),
      artistId: null,
    };
  }

  return Sentry.startSpan(
    {
      op: 'music.fetch',
      name: 'Spotify: enrich lead',
      attributes: { 'artist.id': artistId, 'lead.id': leadId },
    },
    async span => {
      Sentry.addBreadcrumb({
        category: 'music.fetch',
        message: `Fetching Spotify data for lead enrichment`,
        data: {
          leadId,
          artistId,
          spotifyUrl,
          timestamp: new Date().toISOString(),
        },
        level: 'info',
      });

      try {
        const artist = await spotifyClient.getArtist(artistId);
        span.setAttribute('artist.name', artist.name);

        const token = await spotifyClient.getAccessToken();
        if (!token) {
          pipelineWarn(
            'enrich',
            'Skipped — Spotify not configured or token unavailable',
            { leadId }
          );
          span.setStatus({ code: 2, message: 'no token' });
          return {
            ...skipped('spotify_unavailable'),
            artistId,
          };
        }

        const albumsUrl = `${SPOTIFY_API_BASE}/artists/${artistId}/albums?include_groups=album,single&limit=50`;
        const albumsRes = await fetch(albumsUrl, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        });

        let releaseCount: number | null = null;
        let latestReleaseDate: Date | null = null;
        let albumsAvailable = false;

        if (albumsRes.ok) {
          const albumsData: SpotifyAlbumsResponse = await albumsRes.json();
          releaseCount = albumsData.total;
          albumsAvailable = true;

          for (const item of albumsData.items) {
            if (item.release_date) {
              const date = new Date(item.release_date);
              if (!latestReleaseDate || date > latestReleaseDate) {
                latestReleaseDate = date;
              }
            }
          }
        } else {
          Sentry.captureException(
            new Error(`Spotify albums fetch failed: ${albumsRes.status}`),
            {
              tags: { 'music.fetch.source': 'spotify' },
              extra: {
                artistId,
                artistName: artist.name,
                spotifyUrl: albumsUrl,
                httpStatus: albumsRes.status,
                leadId,
              },
            }
          );
        }

        const priorityScore = albumsAvailable
          ? computePriorityScore({
              releaseCount: releaseCount ?? 0,
              spotifyPopularity: artist.popularity,
              latestReleaseDate,
            })
          : null;
        const result: SpotifyLeadEnrichment = {
          status: albumsAvailable ? 'enriched' : 'partial',
          artistId,
          spotifyPopularity: artist.popularity,
          spotifyFollowers: artist.followerCount,
          spotifyGenres: [...artist.genres].sort((a, b) => a.localeCompare(b)),
          releaseCount,
          latestReleaseDate,
          priorityScore,
          ...(albumsAvailable ? {} : { reason: 'albums_unavailable' }),
        };

        if (shouldPersist) {
          await db
            .update(leads)
            .set({
              spotifyPopularity: result.spotifyPopularity,
              spotifyFollowers: result.spotifyFollowers,
              ...(albumsAvailable
                ? {
                    releaseCount: result.releaseCount,
                    latestReleaseDate: result.latestReleaseDate,
                    priorityScore: result.priorityScore,
                  }
                : {}),
              updatedAt: new Date(),
            })
            .where(eq(leads.id, leadId));
        }

        span.setStatus({ code: 1, message: result.status });
        if (result.releaseCount !== null) {
          span.setAttribute('releases.count', result.releaseCount);
        }

        pipelineLog('enrich', 'Enrichment complete', {
          leadId,
          popularity: result.spotifyPopularity,
          followers: result.spotifyFollowers,
          releaseCount: result.releaseCount,
          priorityScore: result.priorityScore,
          persisted: shouldPersist,
        });

        return result;
      } catch (error) {
        span.setStatus({ code: 2, message: 'error' });
        Sentry.captureException(error, {
          tags: { 'music.fetch.source': 'spotify' },
          extra: {
            leadId,
            artistId,
            spotifyUrl,
            errorMessage:
              error instanceof Error ? error.message : 'Unknown error',
          },
        });
        await captureError('Spotify lead enrichment failed', error, {
          route: 'leads/spotify-enrich-lead',
          contextData: { leadId, spotifyUrl },
        });

        return {
          ...skipped('spotify_error'),
          status: 'error',
          artistId,
        };
      }
    }
  );
}
