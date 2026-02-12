import * as Sentry from '@sentry/nextjs';
import { tool } from 'ai';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import {
  buildCanvasMetadata,
  summarizeCanvasStatus,
} from '@/lib/services/canvas/service';
import { fetchReleasesForChat } from '../context';
import {
  findReleaseByTitle,
  formatAvailableReleases,
  type ReleaseContext,
} from '../helpers';

function buildCanvasPlan(
  release: ReleaseContext,
  motionPreference = 'ambient'
) {
  const motion = motionPreference;
  const hasArtwork = Boolean(release.artworkUrl);

  return {
    success: true,
    plan: {
      release: {
        title: release.title,
        type: release.releaseType,
        hasArtwork,
        artworkUrl: release.artworkUrl,
        currentCanvasStatus: release.canvasStatus,
      },
      steps: [
        {
          step: 1,
          action: 'Process Artwork',
          description: hasArtwork
            ? 'AI removes text/logos from album art and upscales to 1080x1920 (9:16 portrait)'
            : 'No artwork available — upload album art first, then we can generate a canvas',
          status: hasArtwork ? 'ready' : 'blocked',
        },
        {
          step: 2,
          action: 'Generate Video',
          description: `Create a ${motion} animation loop (3-8 seconds) from the processed artwork`,
          status: hasArtwork ? 'ready' : 'blocked',
        },
        {
          step: 3,
          action: 'Encode & Download',
          description:
            'Encode to H.264 MP4 at 30fps, ready for upload to Spotify for Artists',
          status: hasArtwork ? 'ready' : 'blocked',
        },
        {
          step: 4,
          action: 'Upload to Spotify',
          description:
            'Download the video and upload it via Spotify for Artists → Music → Select track → Canvas',
          status: 'manual',
        },
      ],
      motionStyle: motion,
      specs: {
        resolution: '1080x1920',
        aspectRatio: '9:16',
        duration: '3-8 seconds (loops)',
        format: 'MP4 (H.264)',
        fps: 30,
      },
    },
  };
}

/**
 * Creates the consolidated manageCanvas tool.
 * Combines check, plan, and markUploaded actions into a single tool.
 */
export function createManageCanvasTool(profileId: string | null) {
  return tool({
    description:
      "Manage Spotify Canvas videos for the artist's releases. Use action 'check' to see which releases have or are missing canvas videos, 'plan' to generate a detailed canvas creation plan for a specific release, or 'markUploaded' when the artist confirms they've uploaded a canvas.",
    inputSchema: z.object({
      action: z
        .enum(['check', 'plan', 'markUploaded'])
        .describe('The canvas operation to perform'),
      includeAll: z
        .boolean()
        .optional()
        .describe(
          '(check only) If true, include all releases. If false (default), only show releases missing canvas.'
        ),
      releaseTitle: z
        .string()
        .optional()
        .describe('(plan/markUploaded) The title of the target release'),
      motionPreference: z
        .enum(['zoom', 'pan', 'particles', 'morph', 'ambient'])
        .optional()
        .describe('(plan only) Preferred animation style. Default: ambient'),
    }),
    execute: async ({ action, includeAll, releaseTitle, motionPreference }) => {
      if (!profileId) {
        return {
          success: false,
          error: 'Profile ID required for canvas operations',
        };
      }

      try {
        switch (action) {
          case 'check': {
            const releases = await fetchReleasesForChat(profileId);

            if (releases.length === 0) {
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
              releases.map(r => ({
                id: r.id,
                title: r.title,
                metadata: r.metadata,
                artworkUrl: r.artworkUrl,
              }))
            );

            const releaseList = includeAll
              ? releases.map(r => ({
                  title: r.title,
                  releaseType: r.releaseType,
                  canvasStatus: r.canvasStatus,
                  hasArtwork: Boolean(r.artworkUrl),
                  spotifyPopularity: r.spotifyPopularity,
                }))
              : summary.releasesNeedingCanvas.map(r => ({
                  title: r.title,
                  hasArtwork: r.hasArtwork,
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
          }

          case 'plan': {
            if (!releaseTitle) {
              return {
                success: false,
                error: 'releaseTitle is required for the plan action',
              };
            }

            const releases = await fetchReleasesForChat(profileId);
            const release = findReleaseByTitle(releases, releaseTitle);

            if (!release) {
              return {
                success: false,
                error: `Release "${releaseTitle}" not found. Available releases: ${formatAvailableReleases(releases)}`,
              };
            }

            return buildCanvasPlan(release, motionPreference);
          }

          case 'markUploaded': {
            if (!releaseTitle) {
              return {
                success: false,
                error: 'releaseTitle is required for the markUploaded action',
              };
            }

            const releases = await fetchReleasesForChat(profileId);
            const release = findReleaseByTitle(releases, releaseTitle);

            if (!release) {
              return {
                success: false,
                error: `Release "${releaseTitle}" not found. Available releases: ${formatAvailableReleases(releases)}`,
              };
            }

            // Update the release metadata with canvas status
            await db
              .update(discogReleases)
              .set({
                metadata: {
                  ...(release.metadata ?? {}),
                  ...buildCanvasMetadata('uploaded'),
                },
                updatedAt: new Date(),
              })
              .where(eq(discogReleases.id, release.id));

            return {
              success: true,
              release: {
                title: release.title,
                previousStatus: release.canvasStatus,
                newStatus: 'uploaded',
              },
              message: `Marked "${release.title}" as having a Spotify Canvas uploaded.`,
            };
          }
        }
      } catch (error) {
        Sentry.captureException(error, {
          tags: { feature: 'ai-chat', tool: 'manageCanvas' },
          extra: { profileId, action },
        });
        return {
          success: false,
          error: 'Canvas operation failed. Please try again.',
        };
      }
    },
  });
}
