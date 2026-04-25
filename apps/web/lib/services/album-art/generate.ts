import 'server-only';

import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import {
  fetchReleasesForChat,
  resolveAlbumArtReleaseTarget,
} from '@/lib/chat/tools/shared';
import { env } from '@/lib/env-server';
import {
  albumArtGenerationBurstLimiter,
  albumArtGenerationLimiter,
} from '@/lib/rate-limit';
import {
  buildAlbumArtBackgroundPrompt,
  generateAlbumArtBackgrounds,
} from './provider-xai';
import { renderAlbumArtCandidate } from './render';
import { uploadAlbumArtCandidate, uploadAlbumArtManifest } from './storage';
import { getAlbumArtStyle } from './styles';
import type {
  AlbumArtCandidate,
  AlbumArtStyleId,
  AlbumArtToolResult,
} from './types';

export class AlbumArtConfigurationError extends Error {}

function assertAlbumArtConfiguration(): void {
  if (!env.XAI_API_KEY?.trim()) {
    throw new AlbumArtConfigurationError(
      'Album art is temporarily unavailable.'
    );
  }
}

export async function generateAlbumArtForChat(params: {
  readonly profileId: string;
  readonly clerkUserId: string;
  readonly artistName: string;
  readonly releaseTitle?: string;
  readonly releaseId?: string;
  readonly styleId?: AlbumArtStyleId;
  readonly prompt?: string;
  readonly createRelease?: boolean;
}): Promise<AlbumArtToolResult> {
  const releases = await fetchReleasesForChat(params.profileId);
  const target = resolveAlbumArtReleaseTarget(releases, {
    releaseId: params.releaseId,
    releaseTitle: params.releaseTitle,
  });

  if (target.status === 'needs_target' && !params.createRelease) {
    return {
      success: true,
      state: 'needs_release_target',
      releaseTitle: params.releaseTitle ?? null,
      artistName: params.artistName,
      suggestedReleases: target.suggestedReleases,
    };
  }

  if (params.createRelease && !params.releaseTitle?.trim()) {
    return {
      success: true,
      state: 'needs_release_target',
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
      success: false,
      retryable: true,
      error:
        burstLimit.reason ??
        'Album art generation limit reached. Please try again later.',
    };
  }

  const dailyLimit = await albumArtGenerationLimiter.limit(params.clerkUserId);
  if (!dailyLimit.success) {
    return {
      success: false,
      retryable: true,
      error:
        dailyLimit.reason ??
        'Album art generation limit reached. Please try again later.',
    };
  }

  try {
    assertAlbumArtConfiguration();

    const style = getAlbumArtStyle(params.styleId);
    const generationId = randomUUID();
    const targetRelease =
      target.status === 'resolved'
        ? target.release
        : {
            id: null,
            title: params.releaseTitle?.trim() || 'Untitled Release',
            artworkUrl: null,
          };
    const providerPrompt = buildAlbumArtBackgroundPrompt({
      releaseTitle: targetRelease.title,
      artistName: params.artistName,
      style,
      prompt: params.prompt,
    });
    const generated = await generateAlbumArtBackgrounds({
      prompt: providerPrompt,
    });
    const now = new Date().toISOString();

    const candidates = await Promise.all(
      generated.images.slice(0, 3).map(async background => {
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

        return {
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
        } satisfies AlbumArtCandidate;
      })
    );

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
      success: true,
      state: 'generated',
      generationId,
      releaseId: targetRelease.id,
      releaseTitle: targetRelease.title,
      artistName: params.artistName,
      hasExistingArtwork: Boolean(targetRelease.artworkUrl),
      candidates,
    };
  } catch (error) {
    if (error instanceof AlbumArtConfigurationError) {
      return {
        success: false,
        retryable: false,
        error: error.message,
      };
    }

    Sentry.captureException(error, {
      tags: { feature: 'album-art-generation' },
      extra: {
        profileId: params.profileId,
        releaseId: params.releaseId,
        releaseTitle: params.releaseTitle,
      },
    });
    return {
      success: false,
      retryable: true,
      error: 'Unable to generate album art. Please try again.',
    };
  }
}
