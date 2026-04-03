import type {
  AlbumArtGenerationSession,
  ArtistBrandKit,
} from '@/lib/db/schema/album-art';
import type { ReleaseType } from '@/lib/discography/types';

export type AlbumArtMode =
  | 'base'
  | 'matching_variant'
  | 'series_background_refresh';

export type AlbumArtTemplateSourceType =
  | 'none'
  | 'release_family'
  | 'artist_brand_kit';

export type AlbumArtSessionStatus =
  | 'pending'
  | 'ready'
  | 'applied'
  | 'expired'
  | 'failed';

export type AlbumArtTemplateMode =
  | 'release_family_locked'
  | 'artist_series_template';

export type AlbumArtLayoutPreset = 'v1-title-artist-version';

export type AlbumArtLogoPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export type AlbumArtOverlayTone = 'light' | 'dark';

export type ReleaseArtworkOrigin = 'ingested' | 'uploaded' | 'ai_generated';

export interface ParsedAlbumArtTitle {
  readonly displayTitle: string;
  readonly baseTitle: string;
  readonly normalizedBaseTitle: string;
  readonly versionLabel: string | null;
}

export interface AlbumArtTemplateLock {
  readonly version: 1;
  readonly source: 'ai_generated';
  readonly mode: AlbumArtTemplateMode;
  readonly layoutPreset: AlbumArtLayoutPreset;
  readonly baseTitle: string;
  readonly normalizedBaseTitle: string;
  readonly versionLabel: string | null;
  readonly artistText: string;
  readonly backgroundAssetUrl: string;
  readonly backgroundPrompt: string;
  readonly overlayTone: AlbumArtOverlayTone;
  readonly sourceReleaseId: string;
  readonly brandKitId: string | null;
  readonly logoAssetUrl: string | null;
  readonly logoPosition: AlbumArtLogoPosition | null;
  readonly logoOpacity: number | null;
  readonly model: string;
  readonly generatedAt: string;
}

export interface ReleaseAlbumArtMetadata {
  readonly artworkOrigin?: ReleaseArtworkOrigin;
  readonly albumArtTemplate?: AlbumArtTemplateLock | null;
  readonly parsedVersionLabel?: string | null;
  readonly brandKitId?: string | null;
}

export interface AlbumArtRenderInput {
  readonly title: string;
  readonly artistName: string;
  readonly versionLabel: string | null;
  readonly backgroundBuffer: Buffer;
  readonly layoutPreset: AlbumArtLayoutPreset;
  readonly overlayTone?: AlbumArtOverlayTone;
  readonly logoBuffer?: Buffer | null;
  readonly logoPosition?: AlbumArtLogoPosition | null;
  readonly logoOpacity?: number | null;
}

export interface AlbumArtRenderResult {
  readonly buffer: Buffer;
  readonly overlayTone: AlbumArtOverlayTone;
}

export interface AlbumArtGenerationContext {
  readonly releaseId?: string;
  readonly draftKey?: string;
  readonly profileId: string;
  readonly title: string;
  readonly artistName: string;
  readonly releaseType: ReleaseType;
  readonly genres: string[];
  readonly mode: AlbumArtMode;
  readonly parsedTitle: ParsedAlbumArtTitle;
  readonly brandKit: AlbumArtBrandKitRecord | null;
  readonly sourceTemplate: AlbumArtTemplateLock | null;
}

export interface AlbumArtGenerationOption {
  readonly id: string;
  readonly previewUrl: string;
  readonly finalImageUrl: string;
  readonly backgroundUrl: string;
  readonly template: AlbumArtTemplateLock;
}

export interface AlbumArtGenerationPayload {
  readonly title: string;
  readonly artistName: string;
  readonly prompt: string;
  readonly mode: AlbumArtMode;
  readonly layoutPreset: AlbumArtLayoutPreset;
  readonly options: readonly AlbumArtGenerationOption[];
  readonly sourceTemplateReleaseId: string | null;
  readonly brandKitId: string | null;
}

export interface AlbumArtGenerationResult {
  readonly sessionId: string;
  readonly success: boolean;
  readonly quota: {
    readonly remainingRunsForRelease: number | null;
    readonly consumedThisRun: number;
  };
  readonly options: readonly AlbumArtGenerationOption[];
  readonly mode: AlbumArtMode;
  readonly usedMatchingTemplate: boolean;
  readonly usedBrandKit: boolean;
  readonly error?: string;
}

export interface GenerateAlbumArtInput {
  readonly releaseId?: string;
  readonly draftKey?: string;
  readonly profileId: string;
  readonly title: string;
  readonly artistName: string;
  readonly releaseType: ReleaseType;
  readonly genres?: readonly string[];
  readonly mode: AlbumArtMode;
  readonly sourceTemplateReleaseId?: string | null;
  readonly brandKitId?: string | null;
  readonly runLimit: number | null;
}

export interface ApplyAlbumArtInput {
  readonly releaseId: string;
  readonly profileId: string;
  readonly sessionId: string;
  readonly optionId: string;
}

export interface AlbumArtBrandKitRecord {
  readonly id: string;
  readonly profileId: string;
  readonly name: string;
  readonly layoutPreset: AlbumArtLayoutPreset;
  readonly logoAssetUrl: string | null;
  readonly logoPosition: AlbumArtLogoPosition;
  readonly logoOpacity: number;
  readonly textStyleJson: Record<string, unknown>;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AlbumArtGenerationSessionRecord {
  readonly id: string;
  readonly profileId: string;
  readonly releaseId: string | null;
  readonly draftKey: string | null;
  readonly mode: AlbumArtMode;
  readonly templateSourceType: AlbumArtTemplateSourceType;
  readonly templateSourceId: string | null;
  readonly status: AlbumArtSessionStatus;
  readonly consumedRuns: number;
  readonly expiresAt: string;
  readonly payload: AlbumArtGenerationPayload;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  if (value === null) {
    return false;
  }

  return typeof value === 'object';
}

function isLogoPosition(value: unknown): value is AlbumArtLogoPosition {
  return (
    value === 'top-left' ||
    value === 'top-right' ||
    value === 'bottom-left' ||
    value === 'bottom-right'
  );
}

function isOverlayTone(value: unknown): value is AlbumArtOverlayTone {
  return value === 'light' || value === 'dark';
}

export function readReleaseAlbumArtMetadata(
  metadata: Record<string, unknown> | null | undefined
): ReleaseAlbumArtMetadata {
  if (!metadata) {
    return {};
  }

  const artworkOrigin =
    metadata.artworkOrigin === 'ingested' ||
    metadata.artworkOrigin === 'uploaded' ||
    metadata.artworkOrigin === 'ai_generated'
      ? metadata.artworkOrigin
      : undefined;

  const parsedVersionLabel =
    typeof metadata.parsedVersionLabel === 'string'
      ? metadata.parsedVersionLabel
      : metadata.parsedVersionLabel === null
        ? null
        : undefined;

  const brandKitId =
    typeof metadata.brandKitId === 'string'
      ? metadata.brandKitId
      : metadata.brandKitId === null
        ? null
        : undefined;

  const rawTemplate = metadata.albumArtTemplate;
  let albumArtTemplate: AlbumArtTemplateLock | null | undefined;

  if (rawTemplate === null) {
    albumArtTemplate = null;
  } else if (isObjectRecord(rawTemplate)) {
    albumArtTemplate = {
      version: 1,
      source: 'ai_generated',
      mode:
        rawTemplate.mode === 'artist_series_template'
          ? 'artist_series_template'
          : 'release_family_locked',
      layoutPreset: 'v1-title-artist-version',
      baseTitle:
        typeof rawTemplate.baseTitle === 'string' ? rawTemplate.baseTitle : '',
      normalizedBaseTitle:
        typeof rawTemplate.normalizedBaseTitle === 'string'
          ? rawTemplate.normalizedBaseTitle
          : '',
      versionLabel:
        typeof rawTemplate.versionLabel === 'string'
          ? rawTemplate.versionLabel
          : null,
      artistText:
        typeof rawTemplate.artistText === 'string'
          ? rawTemplate.artistText
          : '',
      backgroundAssetUrl:
        typeof rawTemplate.backgroundAssetUrl === 'string'
          ? rawTemplate.backgroundAssetUrl
          : '',
      backgroundPrompt:
        typeof rawTemplate.backgroundPrompt === 'string'
          ? rawTemplate.backgroundPrompt
          : '',
      overlayTone: isOverlayTone(rawTemplate.overlayTone)
        ? rawTemplate.overlayTone
        : 'light',
      sourceReleaseId:
        typeof rawTemplate.sourceReleaseId === 'string'
          ? rawTemplate.sourceReleaseId
          : '',
      brandKitId:
        typeof rawTemplate.brandKitId === 'string'
          ? rawTemplate.brandKitId
          : null,
      logoAssetUrl:
        typeof rawTemplate.logoAssetUrl === 'string'
          ? rawTemplate.logoAssetUrl
          : null,
      logoPosition: isLogoPosition(rawTemplate.logoPosition)
        ? rawTemplate.logoPosition
        : null,
      logoOpacity:
        typeof rawTemplate.logoOpacity === 'number'
          ? rawTemplate.logoOpacity
          : null,
      model: typeof rawTemplate.model === 'string' ? rawTemplate.model : '',
      generatedAt:
        typeof rawTemplate.generatedAt === 'string'
          ? rawTemplate.generatedAt
          : new Date(0).toISOString(),
    };
  }

  return {
    artworkOrigin,
    albumArtTemplate,
    parsedVersionLabel,
    brandKitId,
  };
}

export function mergeReleaseAlbumArtMetadata(
  metadata: Record<string, unknown> | null | undefined,
  updates: ReleaseAlbumArtMetadata
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    ...updates,
  };
}

export function mapBrandKitRecord(
  brandKit: ArtistBrandKit | null
): AlbumArtBrandKitRecord | null {
  if (!brandKit) {
    return null;
  }

  return {
    id: brandKit.id,
    profileId: brandKit.profileId,
    name: brandKit.name,
    layoutPreset: 'v1-title-artist-version',
    logoAssetUrl: brandKit.logoAssetUrl,
    logoPosition: isLogoPosition(brandKit.logoPosition)
      ? brandKit.logoPosition
      : 'top-left',
    logoOpacity: Number(brandKit.logoOpacity ?? 1),
    textStyleJson: brandKit.textStyleJson ?? {},
    isDefault: brandKit.isDefault,
    createdAt: brandKit.createdAt.toISOString(),
    updatedAt: brandKit.updatedAt.toISOString(),
  };
}

export function mapGenerationSessionRecord(
  session: AlbumArtGenerationSession
): AlbumArtGenerationSessionRecord {
  return {
    id: session.id,
    profileId: session.profileId,
    releaseId: session.releaseId ?? null,
    draftKey: session.draftKey ?? null,
    mode: session.mode as AlbumArtMode,
    templateSourceType:
      session.templateSourceType as AlbumArtTemplateSourceType,
    templateSourceId: session.templateSourceId ?? null,
    status: session.status as AlbumArtSessionStatus,
    consumedRuns: session.consumedRuns,
    expiresAt: session.expiresAt.toISOString(),
    payload: (session.payloadJson ??
      {}) as unknown as AlbumArtGenerationPayload,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}
