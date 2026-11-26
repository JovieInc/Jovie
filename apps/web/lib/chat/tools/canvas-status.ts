import { tool } from 'ai';
import { z } from 'zod';
import {
  buildCanvasMetadata,
  summarizeCanvasStatus,
} from '@/lib/services/canvas/service';
import { resolveChatRelease } from '../catalog-query';
import { updateOwnedReleaseMetadata } from '../release-writes';
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

/**
 * Creates the markCanvasUploaded tool.
 * Lets artists self-report that they've uploaded a canvas to Spotify for Artists.
 * Since Spotify has no public API for canvas status, this is the only reliable way to track it.
 * Lives beside the status tool so the chat-creative outcome check can call the
 * real write (docs/product/outcome-coverage.json).
 */
export function createMarkCanvasUploadedTool(
  profileId: string | null,
  releases: ReleaseContext[]
) {
  return tool({
    description:
      "Mark a release as having a Spotify Canvas video uploaded. Use this when the artist confirms they've already set a canvas for a track/release in Spotify for Artists, or when they tell you a canvas is already uploaded.",
    inputSchema: chatToolSchema({
      releaseTitle: z
        .string()
        .describe('The title of the release that has a canvas uploaded'),
    }),
    execute: async ({ releaseTitle }) => {
      if (!profileId) {
        return { success: false, error: 'Profile ID required' };
      }

      const release = await resolveChatRelease(profileId, releases, {
        releaseTitle,
      });

      if (!release) {
        return {
          success: false,
          error: `Release "${releaseTitle}" not found. Available releases: ${releases
            .slice(0, 10)
            .map(r => r.title)
            .join(', ')}`,
        };
      }

      const updated = await updateOwnedReleaseMetadata({
        releaseId: release.id,
        creatorProfileId: profileId,
        metadata: {
          ...release.metadata,
          ...buildCanvasMetadata('uploaded'),
        },
      });

      if (!updated) {
        return {
          success: false,
          error: 'Release not found or unauthorized',
        };
      }

      return {
        success: true,
        release: {
          title: release.title,
          previousStatus: release.canvasStatus,
          newStatus: 'uploaded',
        },
        message: `Marked "${release.title}" as having a Spotify Canvas uploaded.`,
      };
    },
  });
}
