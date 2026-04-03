import 'server-only';

import { randomUUID } from 'node:crypto';
import { gateway } from '@ai-sdk/gateway';
import { del } from '@vercel/blob';
import { generateImage } from 'ai';
import { and, desc, eq, or } from 'drizzle-orm';
import { processArtworkToSizes } from '@/app/api/images/artwork/upload/process';
import {
  getVercelBlobUploader,
  uploadBufferToBlob,
} from '@/app/api/images/upload/lib';
import { ALBUM_ART_IMAGE_MODEL } from '@/lib/constants/ai-models';
import { db } from '@/lib/db';
import {
  albumArtGenerationSessions,
  artistBrandKits,
} from '@/lib/db/schema/album-art';
import { discogReleases } from '@/lib/db/schema/content';
import { fetchWithTimeoutResponse } from '@/lib/queries/fetch';
import { buildAlbumArtPrompt } from './prompt-builder';
import { assertAlbumArtQuota, getRemainingAlbumArtRuns } from './quota';
import { fetchLogoBuffer, renderAlbumArt } from './renderer';
import { parseAlbumArtTitle } from './title-parser';
import type {
  AlbumArtGenerationContext,
  AlbumArtGenerationPayload,
  AlbumArtGenerationResult,
  AlbumArtGenerationSessionRecord,
  AlbumArtOverlayTone,
  AlbumArtTemplateLock,
  ApplyAlbumArtInput,
  GenerateAlbumArtInput,
} from './types';
import {
  mapBrandKitRecord,
  mapGenerationSessionRecord,
  mergeReleaseAlbumArtMetadata,
  readReleaseAlbumArtMetadata,
} from './types';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

async function deleteBlobUrlIfConfigured(url: string | null | undefined) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || !url) {
    return;
  }

  await del(url, { token });
}

async function uploadAlbumArtBuffer(params: {
  readonly profileId: string;
  readonly sessionId: string;
  readonly kind: 'preview' | 'background' | 'final';
  readonly optionId: string;
  readonly extension: 'png';
  readonly buffer: Buffer;
  readonly contentType: string;
}): Promise<string> {
  const put = await getVercelBlobUploader();
  return uploadBufferToBlob(
    put,
    `album-art/profiles/${params.profileId}/sessions/${params.sessionId}/${params.kind}-${params.optionId}.${params.extension}`,
    params.buffer,
    params.contentType
  );
}

function buildTemplate(params: {
  readonly context: AlbumArtGenerationContext;
  readonly backgroundUrl: string;
  readonly prompt: string;
  readonly overlayTone: AlbumArtOverlayTone;
}): AlbumArtTemplateLock {
  return {
    version: 1,
    source: 'ai_generated',
    mode:
      params.context.mode === 'series_background_refresh'
        ? 'artist_series_template'
        : 'release_family_locked',
    layoutPreset: 'v1-title-artist-version',
    baseTitle: params.context.parsedTitle.baseTitle,
    normalizedBaseTitle: params.context.parsedTitle.normalizedBaseTitle,
    versionLabel: params.context.parsedTitle.versionLabel,
    artistText: params.context.artistName,
    backgroundAssetUrl: params.backgroundUrl,
    backgroundPrompt: params.prompt,
    overlayTone: params.overlayTone,
    sourceReleaseId:
      params.context.sourceTemplate?.sourceReleaseId ??
      params.context.releaseId ??
      '',
    brandKitId: params.context.brandKit?.id ?? null,
    logoAssetUrl: params.context.brandKit?.logoAssetUrl ?? null,
    logoPosition: params.context.brandKit?.logoPosition ?? null,
    logoOpacity: params.context.brandKit?.logoOpacity ?? null,
    model: ALBUM_ART_IMAGE_MODEL,
    generatedAt: new Date().toISOString(),
  };
}

async function createGenerationContext(
  input: GenerateAlbumArtInput
): Promise<AlbumArtGenerationContext> {
  const parsedTitle = parseAlbumArtTitle(input.title);
  const brandKit = input.brandKitId
    ? mapBrandKitRecord(
        (await db.query.artistBrandKits.findFirst({
          where: eq(artistBrandKits.id, input.brandKitId),
        })) ?? null
      )
    : null;
  const sourceTemplate = input.sourceTemplateReleaseId
    ? (readReleaseAlbumArtMetadata(
        (
          await db.query.discogReleases.findFirst({
            where: eq(discogReleases.id, input.sourceTemplateReleaseId),
            columns: { metadata: true },
          })
        )?.metadata as Record<string, unknown> | null
      ).albumArtTemplate ?? null)
    : null;

  return {
    releaseId: input.releaseId,
    draftKey: input.draftKey,
    profileId: input.profileId,
    title: input.title,
    artistName: input.artistName,
    releaseType: input.releaseType,
    genres: [...(input.genres ?? [])],
    mode: input.mode,
    parsedTitle,
    brandKit,
    sourceTemplate,
  };
}

async function buildGeneratedOptions(
  context: AlbumArtGenerationContext,
  prompt: string,
  sessionId: string
) {
  const logoBuffer = await fetchLogoBuffer(
    context.brandKit?.logoAssetUrl ?? null
  );

  if (context.mode === 'matching_variant' && context.sourceTemplate) {
    const response = await fetchWithTimeoutResponse(
      context.sourceTemplate.backgroundAssetUrl,
      { timeout: 10000 }
    );
    if (!response.ok) {
      throw new Error('Failed to load matching design background');
    }
    const backgroundBuffer = Buffer.from(await response.arrayBuffer());
    const rendered = await renderAlbumArt({
      title: context.title,
      artistName: context.artistName,
      versionLabel: context.parsedTitle.versionLabel,
      backgroundBuffer,
      layoutPreset: 'v1-title-artist-version',
      overlayTone: context.sourceTemplate.overlayTone,
      logoBuffer,
      logoPosition:
        context.brandKit?.logoPosition ?? context.sourceTemplate.logoPosition,
      logoOpacity:
        context.brandKit?.logoOpacity ?? context.sourceTemplate.logoOpacity,
    });
    const optionId = randomUUID();
    const backgroundUrl = await uploadAlbumArtBuffer({
      profileId: context.profileId,
      sessionId,
      kind: 'background',
      optionId,
      extension: 'png',
      buffer: backgroundBuffer,
      contentType: 'image/png',
    });
    const finalImageUrl = await uploadAlbumArtBuffer({
      profileId: context.profileId,
      sessionId,
      kind: 'final',
      optionId,
      extension: 'png',
      buffer: rendered.buffer,
      contentType: 'image/png',
    });

    return [
      {
        id: optionId,
        previewUrl: finalImageUrl,
        finalImageUrl,
        backgroundUrl,
        template: buildTemplate({
          context,
          backgroundUrl,
          prompt,
          overlayTone: rendered.overlayTone,
        }),
      },
    ] as const;
  }

  const generated = await generateImage({
    model: gateway.imageModel(ALBUM_ART_IMAGE_MODEL),
    prompt,
    n: 3,
    aspectRatio: '1:1',
  });

  const options = [];
  for (const image of generated.images) {
    const optionId = randomUUID();
    const backgroundBuffer = Buffer.from(image.uint8Array);
    const rendered = await renderAlbumArt({
      title: context.title,
      artistName: context.artistName,
      versionLabel: context.parsedTitle.versionLabel,
      backgroundBuffer,
      layoutPreset: 'v1-title-artist-version',
      logoBuffer,
      logoPosition: context.brandKit?.logoPosition ?? null,
      logoOpacity: context.brandKit?.logoOpacity ?? null,
    });

    const backgroundUrl = await uploadAlbumArtBuffer({
      profileId: context.profileId,
      sessionId,
      kind: 'background',
      optionId,
      extension: 'png',
      buffer: backgroundBuffer,
      contentType: image.mediaType || 'image/png',
    });
    const finalImageUrl = await uploadAlbumArtBuffer({
      profileId: context.profileId,
      sessionId,
      kind: 'final',
      optionId,
      extension: 'png',
      buffer: rendered.buffer,
      contentType: 'image/png',
    });

    options.push({
      id: optionId,
      previewUrl: finalImageUrl,
      finalImageUrl,
      backgroundUrl,
      template: buildTemplate({
        context,
        backgroundUrl,
        prompt,
        overlayTone: rendered.overlayTone,
      }),
    });
  }

  return options;
}

export async function generateAlbumArt(
  input: GenerateAlbumArtInput
): Promise<AlbumArtGenerationResult> {
  await assertAlbumArtQuota({
    profileId: input.profileId,
    releaseId: input.releaseId,
    runLimit: input.runLimit,
  });

  const context = await createGenerationContext(input);
  const prompt = buildAlbumArtPrompt(input);
  const sessionId = randomUUID();
  const options = await buildGeneratedOptions(context, prompt, sessionId);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const payload: AlbumArtGenerationPayload = {
    title: context.title,
    artistName: context.artistName,
    prompt,
    mode: context.mode,
    layoutPreset: 'v1-title-artist-version',
    options,
    sourceTemplateReleaseId: input.sourceTemplateReleaseId ?? null,
    brandKitId: input.brandKitId ?? null,
  };

  await db.insert(albumArtGenerationSessions).values({
    id: sessionId,
    profileId: input.profileId,
    releaseId: input.releaseId ?? null,
    draftKey: input.draftKey ?? null,
    mode: input.mode,
    templateSourceType: input.brandKitId
      ? 'artist_brand_kit'
      : input.sourceTemplateReleaseId
        ? 'release_family'
        : 'none',
    templateSourceId: input.brandKitId ?? input.sourceTemplateReleaseId ?? null,
    status: 'ready',
    consumedRuns: 1,
    expiresAt,
    payloadJson: payload as unknown as Record<string, unknown>,
  });

  const remainingRuns = await getRemainingAlbumArtRuns({
    profileId: input.profileId,
    releaseId: input.releaseId,
    runLimit: input.runLimit,
  });

  return {
    sessionId,
    success: true,
    quota: {
      remainingRunsForRelease: remainingRuns,
      consumedThisRun: 1,
    },
    options,
    mode: input.mode,
    usedMatchingTemplate: Boolean(input.sourceTemplateReleaseId),
    usedBrandKit: Boolean(input.brandKitId),
  };
}

export async function getLatestReadySession(params: {
  readonly profileId: string;
  readonly sessionId: string;
}): Promise<AlbumArtGenerationSessionRecord | null> {
  const session = await db.query.albumArtGenerationSessions.findFirst({
    where: and(
      eq(albumArtGenerationSessions.profileId, params.profileId),
      eq(albumArtGenerationSessions.id, params.sessionId)
    ),
    orderBy: [desc(albumArtGenerationSessions.createdAt)],
  });

  if (!session) {
    return null;
  }

  if (
    session.expiresAt.getTime() < Date.now() &&
    session.status !== 'expired'
  ) {
    await db
      .update(albumArtGenerationSessions)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(albumArtGenerationSessions.id, session.id));
    return null;
  }

  return mapGenerationSessionRecord(session);
}

export async function listArtistBrandKits(profileId: string) {
  const kits = await db.query.artistBrandKits.findMany({
    where: eq(artistBrandKits.profileId, profileId),
    orderBy: [desc(artistBrandKits.isDefault), desc(artistBrandKits.updatedAt)],
  });

  return kits.filter(Boolean).map(brandKit => mapBrandKitRecord(brandKit)!);
}

export async function createArtistBrandKit(params: {
  readonly profileId: string;
  readonly name: string;
  readonly logoAssetUrl?: string | null;
  readonly logoPosition?:
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right';
  readonly logoOpacity?: number;
  readonly isDefault?: boolean;
}) {
  if (params.isDefault) {
    await db
      .update(artistBrandKits)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(artistBrandKits.profileId, params.profileId));
  }

  const [created] = await db
    .insert(artistBrandKits)
    .values({
      profileId: params.profileId,
      name: params.name.trim(),
      logoAssetUrl: params.logoAssetUrl ?? null,
      logoPosition: params.logoPosition ?? 'top-left',
      logoOpacity: String(params.logoOpacity ?? 1),
      isDefault: params.isDefault ?? false,
    })
    .returning();

  return mapBrandKitRecord(created);
}

export async function updateArtistBrandKit(params: {
  readonly profileId: string;
  readonly brandKitId: string;
  readonly name: string;
  readonly logoAssetUrl?: string | null;
  readonly logoPosition?:
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right';
  readonly logoOpacity?: number;
  readonly isDefault?: boolean;
}) {
  const existing = await db.query.artistBrandKits.findFirst({
    where: and(
      eq(artistBrandKits.id, params.brandKitId),
      eq(artistBrandKits.profileId, params.profileId)
    ),
  });

  if (!existing) {
    return null;
  }

  if (params.isDefault) {
    await db
      .update(artistBrandKits)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(artistBrandKits.profileId, params.profileId),
          or(eq(artistBrandKits.isDefault, true))
        )
      );
  }

  const [updated] = await db
    .update(artistBrandKits)
    .set({
      name: params.name.trim(),
      logoAssetUrl: params.logoAssetUrl ?? null,
      logoPosition: params.logoPosition ?? 'top-left',
      logoOpacity: String(params.logoOpacity ?? 1),
      isDefault: params.isDefault ?? false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(artistBrandKits.id, params.brandKitId),
        eq(artistBrandKits.profileId, params.profileId)
      )
    )
    .returning();

  if (
    existing.logoAssetUrl &&
    existing.logoAssetUrl !== (params.logoAssetUrl ?? null)
  ) {
    try {
      await deleteBlobUrlIfConfigured(existing.logoAssetUrl);
    } catch {
      // Blob cleanup is best-effort; DB state is authoritative.
    }
  }

  return mapBrandKitRecord(updated ?? null);
}

export async function deleteArtistBrandKit(params: {
  readonly profileId: string;
  readonly brandKitId: string;
}) {
  const existing = await db.query.artistBrandKits.findFirst({
    where: and(
      eq(artistBrandKits.id, params.brandKitId),
      eq(artistBrandKits.profileId, params.profileId)
    ),
  });

  await db
    .delete(artistBrandKits)
    .where(
      and(
        eq(artistBrandKits.id, params.brandKitId),
        eq(artistBrandKits.profileId, params.profileId)
      )
    );

  if (existing?.logoAssetUrl) {
    try {
      await deleteBlobUrlIfConfigured(existing.logoAssetUrl);
    } catch {
      // Blob cleanup is best-effort; DB state is authoritative.
    }
  }
}

export async function applyGeneratedAlbumArt(
  input: ApplyAlbumArtInput
): Promise<{ artworkUrl: string; sizes: Record<string, string> }> {
  const session = await getLatestReadySession({
    profileId: input.profileId,
    sessionId: input.sessionId,
  });

  if (!session) {
    throw new Error('Album art session not found or expired');
  }

  const option = session.payload.options.find(
    item => item.id === input.optionId
  );
  if (!option) {
    throw new Error('Album art option not found');
  }

  const finalImageResponse = await fetchWithTimeoutResponse(
    option.finalImageUrl,
    { timeout: 10000 }
  );
  if (!finalImageResponse.ok) {
    throw new Error('Failed to load generated artwork');
  }

  const artworkFile = new File(
    [await finalImageResponse.arrayBuffer()],
    `${input.releaseId}-album-art.png`,
    { type: 'image/png' }
  );
  const processed = await processArtworkToSizes(artworkFile);
  const put = await getVercelBlobUploader();

  const sizes: Record<string, string> = {};
  for (const [sizeKey, buffer] of Object.entries(processed)) {
    sizes[sizeKey] = await uploadBufferToBlob(
      put,
      `artwork/releases/${input.releaseId}/${sizeKey}.avif`,
      buffer,
      'image/avif'
    );
  }

  const artworkUrl = sizes['1000'] ?? sizes.original;
  if (!artworkUrl) {
    throw new Error('Processed artwork missing primary URL');
  }

  const [release] = await db
    .select({
      metadata: discogReleases.metadata,
      artworkUrl: discogReleases.artworkUrl,
    })
    .from(discogReleases)
    .where(eq(discogReleases.id, input.releaseId))
    .limit(1);

  const existingMetadata = (release?.metadata ?? {}) as Record<string, unknown>;
  const nextMetadata = mergeReleaseAlbumArtMetadata(existingMetadata, {
    artworkOrigin: 'ai_generated',
    albumArtTemplate: option.template,
    parsedVersionLabel: option.template.versionLabel,
    brandKitId: option.template.brandKitId,
  });

  await db
    .update(discogReleases)
    .set({
      artworkUrl,
      metadata: {
        ...nextMetadata,
        artworkSizes: sizes,
        originalArtworkUrl:
          existingMetadata.originalArtworkUrl ??
          release?.artworkUrl ??
          undefined,
      },
      updatedAt: new Date(),
    })
    .where(eq(discogReleases.id, input.releaseId));

  await db
    .update(albumArtGenerationSessions)
    .set({ status: 'applied', updatedAt: new Date() })
    .where(eq(albumArtGenerationSessions.id, input.sessionId));

  return { artworkUrl, sizes };
}
