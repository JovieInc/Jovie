import { tool } from 'ai';
import { z } from 'zod';
import { summarizeCanvasStatus } from '@/lib/services/canvas/service';
import { chatToolSchema } from '../strict-schema';
import type { ReleaseCatalogMeta, ReleaseContext } from '../types';

/**
 * Canvas-status tool, extracted from the chat route so that file stays under
 * the company size ceiling. The loaded slice is passed in; this tool does not
 * re-read the catalog. An unavailable read is a retry, never "no releases".
 */
export function createCheckCanvasStatusTool(
  profileId: string | null,
  releases: ReleaseContext[],
  releaseCatalog?: ReleaseCatalogMeta
) {
  return tool({
    description:
      "Check which of the artist's releases have Spotify Canvas videos set and which are missing them. Use this when the artist asks about canvas videos or wants to generate them.",
    inputSchema: chatToolSchema({
      includeAll: z
        .boolean()
        .optional()
        .describe(
          'If true, include all releases. If false (default), only show releases missing canvas.'
        ),
    }),
    execute: async ({ includeAll }) => {
      if (!profileId) {
        return {
          success: false,
          error: 'Profile ID required for release data',
        };
      }

      if (releases.length === 0) {
        // A failed catalog read must not masquerade as "no releases" (dogfood
        // 2026-11-10).
        if (releaseCatalog?.status === 'unavailable') {
          // No numeric total: an unavailable read is not a measured zero.
          return {
            success: true,
            unavailable: true,
            summary: {
              message:
                'The release catalog is temporarily unavailable. Try again in a moment.',
            },
          };
        }
        return {
          success: true,
          summary: {
            total: 0,
            message:
              'No releases found. Connect your Spotify account and sync your releases first.',
          },
        };
      }

      const summary = summarizeCanvasStatus(
        releases.map(release => ({
          id: release.id,
          title: release.title,
          metadata: release.metadata,
          artworkUrl: release.artworkUrl,
        }))
      );

      const releaseList = includeAll
        ? releases.map(release => ({
            title: release.title,
            releaseType: release.releaseType,
            canvasStatus: release.canvasStatus,
            hasArtwork: Boolean(release.artworkUrl),
            spotifyPopularity: release.spotifyPopularity,
          }))
        : summary.releasesNeedingCanvas.map(release => ({
            title: release.title,
            hasArtwork: release.hasArtwork,
          }));

      return {
        success: true,
        summary: {
          total: summary.total,
          withCanvas: summary.withCanvas,
          withoutCanvas: summary.withoutCanvas,
        },
        releases: releaseList,
      };
    },
  });
}
