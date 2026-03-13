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

function extractArtistId(spotifyUrl: string): string | null {
  const match = /\/artist\/([a-zA-Z0-9]+)/.exec(spotifyUrl);
  return match?.[1] ?? null;
}

export async function spotifyEnrichLead(leadId: string): Promise<void> {
  pipelineLog('enrich', 'Starting Spotify enrichment', { leadId });

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead?.spotifyUrl) {
    pipelineWarn('enrich', 'Skipped — no Spotify URL on lead', { leadId });
    return;
  }

  const artistId = extractArtistId(lead.spotifyUrl);
  if (!artistId) {
    pipelineWarn('enrich', 'Skipped — could not extract artist ID from URL', {
      leadId,
      spotifyUrl: lead.spotifyUrl,
    });
    return;
  }

  await Sentry.startSpan(
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
          spotifyUrl: lead.spotifyUrl,
          timestamp: new Date().toISOString(),
        },
        level: 'info',
      });

      try {
        // Get artist details
        const artist = await spotifyClient.getArtist(artistId);
        span.setAttribute('artist.name', artist.name);

        // Get albums via direct fetch using the client's access token
        const token = await spotifyClient.getAccessToken();
        if (!token) {
          pipelineWarn(
            'enrich',
            'Skipped — Spotify not configured or token unavailable',
            { leadId }
          );
          span.setStatus({ code: 2, message: 'no token' });
          return;
        }

        const albumsUrl = `${SPOTIFY_API_BASE}/artists/${artistId}/albums?include_groups=album,single&limit=50`;
        const albumsRes = await fetch(albumsUrl, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        });

        let releaseCount = 0;
        let latestReleaseDate: Date | null = null;

        if (albumsRes.ok) {
          const albumsData: SpotifyAlbumsResponse = await albumsRes.json();
          releaseCount = albumsData.total;

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

        const priorityScore = computePriorityScore({
          releaseCount,
          spotifyPopularity: artist.popularity,
          latestReleaseDate,
        });

        await db
          .update(leads)
          .set({
            spotifyPopularity: artist.popularity,
            spotifyFollowers: artist.followerCount,
            releaseCount,
            latestReleaseDate,
            priorityScore,
            updatedAt: new Date(),
          })
          .where(eq(leads.id, leadId));

        span.setStatus({ code: 1, message: 'ok' });
        span.setAttribute('releases.count', releaseCount);

        pipelineLog('enrich', 'Enrichment complete', {
          leadId,
          popularity: artist.popularity,
          followers: artist.followerCount,
          releaseCount,
          priorityScore,
        });
      } catch (error) {
        span.setStatus({ code: 2, message: 'error' });
        Sentry.captureException(error, {
          tags: { 'music.fetch.source': 'spotify' },
          extra: {
            leadId,
            artistId,
            spotifyUrl: lead.spotifyUrl,
            errorMessage:
              error instanceof Error ? error.message : 'Unknown error',
          },
        });
        await captureError('Spotify lead enrichment failed', error, {
          route: 'leads/spotify-enrich-lead',
          contextData: { leadId, spotifyUrl: lead.spotifyUrl },
        });
      }
    }
  );
}
