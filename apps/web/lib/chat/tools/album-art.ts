import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { tool } from 'ai';
import { z } from 'zod';
import { COPY_FALLBACKS } from '@/data/copyFallbacks';
import { getPlanDisplayName } from '@/lib/entitlements/registry';
import {
  albumArtGenerationBurstLimiter,
  albumArtGenerationLimiter,
} from '@/lib/rate-limit';
import {
  AlbumArtGatewayUnconfiguredError,
  buildAlbumArtBackgroundPrompt,
  generateAlbumArtBackgrounds,
  isAlbumArtGatewayConfigured,
} from '@/lib/services/album-art/provider-xai';
import { renderAlbumArtCandidate } from '@/lib/services/album-art/render';
import {
  uploadAlbumArtCandidate,
  uploadAlbumArtManifest,
} from '@/lib/services/album-art/storage';
import {
  ALBUM_ART_STYLES,
  getAlbumArtStyle,
} from '@/lib/services/album-art/styles';
import type {
  AlbumArtCandidate,
  AlbumArtStyleId,
} from '@/lib/services/album-art/types';
import { resolveAlbumArtReleaseTarget } from '../album-art-release-target';
import { chatToolSchema } from '../strict-schema';
import type { ReleaseContext } from '../types';

/**
 * Chat tool: generate three album art candidates for a release. The pick is
 * applied by `applyGeneratedAlbumArt` from the chat album-art routes.
 */
export function createGenerateAlbumArtTool(params: {
  readonly profileId: string | null;
  readonly clerkUserId: string;
  readonly artistName: string;
  readonly canGenerateAlbumArt: boolean;
  readonly releases: ReleaseContext[];
}) {
  return tool({
    description:
      'Generate three album art options for a release. Use this when the artist asks to generate, create, or design album artwork or cover art. If no matching release exists, return a target-selection result so the client can ask whether to create a release or attach the art to an existing release.',
    inputSchema: chatToolSchema({
      releaseTitle: z
        .string()
        .max(200)
        .optional()
        .describe('Release title to generate album art for, if known.'),
      releaseId: z
        .string()
        .uuid()
        .optional()
        .describe(
          'Exact release ID when the request came from a release menu.'
        ),
      styleId: z
        .enum([
          'neo_pop_collage',
          'chrome_noir',
          'analog_dream',
          'minimal_icon',
        ])
        .optional()
        .describe('Visual style preset for the generated cover.'),
      prompt: z
        .string()
        .max(500)
        .optional()
        .describe('Optional extra visual direction from the artist.'),
      createRelease: z
        .boolean()
        .optional()
        .describe(
          'Set true when the artist wants to generate candidates for a new release that does not exist yet.'
        ),
    }),
    execute: async ({
      releaseTitle,
      releaseId,
      styleId,
      prompt,
      createRelease,
    }) => {
      if (!params.profileId) {
        return {
          success: false as const,
          retryable: false,
          errorCode: 'PROFILE_REQUIRED' as const,
          error: 'Profile ID required',
        };
      }
      if (!params.canGenerateAlbumArt) {
        return {
          success: false as const,
          retryable: false,
          errorCode: 'PLAN_UNAVAILABLE' as const,
          error: `Album art generation requires the ${getPlanDisplayName('pro')} plan.`,
        };
      }

      if (!isAlbumArtGatewayConfigured()) {
        return {
          success: false as const,
          retryable: false,
          errorCode: 'PROVIDER_UNAVAILABLE' as const,
          error: 'Album art generation is temporarily unavailable.',
        };
      }

      const target = await resolveAlbumArtReleaseTarget(
        params.profileId,
        params.releases,
        {
          releaseId,
          releaseTitle,
        }
      );

      if (target.status === 'needs_target' && !createRelease) {
        return {
          success: true as const,
          state: 'needs_release_target' as const,
          releaseTitle: releaseTitle ?? null,
          artistName: params.artistName,
          suggestedReleases: target.suggestedReleases,
        };
      }

      if (createRelease && !releaseTitle?.trim()) {
        return {
          success: true as const,
          state: 'needs_release_target' as const,
          releaseTitle: null,
          artistName: params.artistName,
          suggestedReleases:
            target.status === 'needs_target' ? target.suggestedReleases : [],
        };
      }

      const burstLimit = await albumArtGenerationBurstLimiter.limit(
        params.clerkUserId
      );
      if (!burstLimit.success) {
        return {
          success: false as const,
          retryable: true,
          errorCode: 'RATE_LIMITED' as const,
          error:
            burstLimit.reason ??
            'Album art generation limit reached. Please try again later.',
        };
      }

      const dailyLimit = await albumArtGenerationLimiter.limit(
        params.clerkUserId
      );
      if (!dailyLimit.success) {
        return {
          success: false as const,
          retryable: true,
          errorCode: 'RATE_LIMITED' as const,
          error:
            dailyLimit.reason ??
            'Album art generation limit reached. Please try again later.',
        };
      }

      try {
        const style = getAlbumArtStyle(styleId as AlbumArtStyleId | undefined);
        const generationId = randomUUID();
        const targetRelease =
          target.status === 'resolved'
            ? target.release
            : {
                id: null,
                title: releaseTitle?.trim() || COPY_FALLBACKS.release,
                artworkUrl: null,
              };
        const providerPrompt = buildAlbumArtBackgroundPrompt({
          releaseTitle: targetRelease.title,
          artistName: params.artistName,
          style,
          prompt,
        });
        const generated = await generateAlbumArtBackgrounds({
          prompt: providerPrompt,
        });
        const now = new Date().toISOString();
        const candidates: AlbumArtCandidate[] = [];

        for (const [index, background] of generated.images.entries()) {
          const candidateId = randomUUID();
          const rendered = await renderAlbumArtCandidate({
            background,
            releaseTitle: targetRelease.title,
            artistName: params.artistName,
            style,
          });
          const urls = await uploadAlbumArtCandidate({
            profileId: params.profileId,
            generationId,
            candidateId,
            fullRes: rendered.fullRes,
            preview: rendered.preview,
          });

          candidates.push({
            id: candidateId,
            generationId,
            styleId: style.id,
            styleLabel: style.label,
            previewUrl: urls.previewUrl,
            fullResUrl: urls.fullResUrl,
            generatedAt: now,
            provider: 'xai',
            model: generated.model,
            releaseTitle: targetRelease.title,
            artistName: params.artistName,
            prompt: providerPrompt,
          });

          if (index >= 2) break;
        }

        await uploadAlbumArtManifest({
          generationId,
          profileId: params.profileId,
          releaseId: targetRelease.id,
          releaseTitle: targetRelease.title,
          artistName: params.artistName,
          provider: 'xai',
          model: generated.model,
          styleId: style.id,
          prompt: providerPrompt,
          candidates,
          createdAt: now,
        });

        return {
          success: true as const,
          state: 'generated' as const,
          generationId,
          releaseId: targetRelease.id,
          releaseTitle: targetRelease.title,
          artistName: params.artistName,
          hasExistingArtwork: Boolean(targetRelease.artworkUrl),
          candidates,
          styles: Object.values(ALBUM_ART_STYLES).map(item => ({
            id: item.id,
            label: item.label,
            description: item.description,
          })),
        };
      } catch (error) {
        if (error instanceof AlbumArtGatewayUnconfiguredError) {
          // Gateway auth may be missing between the early check and the call
          // (e.g. env reload). Treat as feature_disabled, do not capture.
          return {
            success: false as const,
            retryable: false,
            errorCode: 'PROVIDER_UNAVAILABLE' as const,
            error: 'Album art generation is temporarily unavailable.',
          };
        }
        Sentry.captureException(error, {
          tags: { feature: 'album-art-generation' },
          extra: { profileId: params.profileId, releaseId, releaseTitle },
        });
        return {
          success: false as const,
          retryable: true,
          errorCode: 'TOOL_EXECUTION_FAILED' as const,
          error: 'Unable to generate album art. Please try again.',
        };
      }
    },
  });
}
