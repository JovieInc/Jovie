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

function isAlbumArtMode(value: unknown): value is AlbumArtMode {
  return (
    value === 'base' ||
    value === 'matching_variant' ||
    value === 'series_background_refresh'
  );
}

function isTemplateSourceType(
  value: unknown
): value is AlbumArtTemplateSourceType {
  return (
    value === 'none' ||
    value === 'release_family' ||
    value === 'artist_brand_kit'
  );
}

function isSessionStatus(value: unknown): value is AlbumArtSessionStatus {
  return (
    value === 'pending' ||
    value === 'ready' ||
    value === 'applied' ||
    value === 'expired' ||
    value === 'failed'
  );
}

function isTemplateMode(value: unknown): value is AlbumArtTemplateMode {
  return (
    value === 'release_family_locked' || value === 'artist_series_template'
  );
}

function isLayoutPreset(value: unknown): value is AlbumArtLayoutPreset {
  return value === 'v1-title-artist-version';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseNullableString(value: unknown): string | null | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null) {
    return null;
  }

  return undefined;
}

function parseAlbumArtTemplate(
  rawTemplate: unknown
): AlbumArtTemplateLock | null | undefined {
  if (rawTemplate === null) {
    return null;
  }

  if (!isObjectRecord(rawTemplate)) {
    return undefined;
  }

  if (
    !isTemplateMode(rawTemplate.mode) ||
    !isLayoutPreset(rawTemplate.layoutPreset) ||
    !isNonEmptyString(rawTemplate.baseTitle) ||
    !isNonEmptyString(rawTemplate.normalizedBaseTitle) ||
    !isNonEmptyString(rawTemplate.artistText) ||
    !isNonEmptyString(rawTemplate.backgroundAssetUrl) ||
    !isNonEmptyString(rawTemplate.backgroundPrompt) ||
    !isOverlayTone(rawTemplate.overlayTone) ||
    !isNonEmptyString(rawTemplate.model) ||
    !isNonEmptyString(rawTemplate.generatedAt) ||
    Number.isNaN(Date.parse(rawTemplate.generatedAt))
  ) {
    return undefined;
  }

  const versionLabel = parseNullableString(rawTemplate.versionLabel);
  const brandKitId = parseNullableString(rawTemplate.brandKitId);
  const logoAssetUrl = parseNullableString(rawTemplate.logoAssetUrl);
  const logoPosition =
    rawTemplate.logoPosition === null
      ? null
      : isLogoPosition(rawTemplate.logoPosition)
        ? rawTemplate.logoPosition
        : undefined;
  const logoOpacity =
    typeof rawTemplate.logoOpacity === 'number'
      ? rawTemplate.logoOpacity
      : rawTemplate.logoOpacity === null
        ? null
        : undefined;

  if (
    versionLabel === undefined ||
    brandKitId === undefined ||
    logoAssetUrl === undefined ||
    logoPosition === undefined ||
    logoOpacity === undefined ||
    typeof rawTemplate.sourceReleaseId !== 'string'
  ) {
    return undefined;
  }

  return {
    version: 1,
    source: 'ai_generated',
    mode: rawTemplate.mode,
    layoutPreset: rawTemplate.layoutPreset,
    baseTitle: rawTemplate.baseTitle,
    normalizedBaseTitle: rawTemplate.normalizedBaseTitle,
    versionLabel,
    artistText: rawTemplate.artistText,
    backgroundAssetUrl: rawTemplate.backgroundAssetUrl,
    backgroundPrompt: rawTemplate.backgroundPrompt,
    overlayTone: rawTemplate.overlayTone,
    sourceReleaseId: rawTemplate.sourceReleaseId,
    brandKitId,
    logoAssetUrl,
    logoPosition,
    logoOpacity,
    model: rawTemplate.model,
    generatedAt: rawTemplate.generatedAt,
  };
}

function parseGenerationOption(
  rawOption: unknown
): AlbumArtGenerationOption | null {
  if (!isObjectRecord(rawOption)) {
    return null;
  }

  const template = parseAlbumArtTemplate(rawOption.template);
  if (
    !isNonEmptyString(rawOption.id) ||
    !isNonEmptyString(rawOption.previewUrl) ||
    !isNonEmptyString(rawOption.finalImageUrl) ||
    !isNonEmptyString(rawOption.backgroundUrl) ||
    !template
  ) {
    return null;
  }

  return {
    id: rawOption.id,
    previewUrl: rawOption.previewUrl,
    finalImageUrl: rawOption.finalImageUrl,
    backgroundUrl: rawOption.backgroundUrl,
    template,
  };
}

function createEmptyGenerationPayload(
  mode: AlbumArtMode
): AlbumArtGenerationPayload {
  return {
    title: '',
    artistName: '',
    prompt: '',
    mode,
    layoutPreset: 'v1-title-artist-version',
    options: [],
    sourceTemplateReleaseId: null,
    brandKitId: null,
  };
}

function parseGenerationPayload(
  payload: unknown,
  fallbackMode: AlbumArtMode
): AlbumArtGenerationPayload {
  if (!isObjectRecord(payload)) {
    return createEmptyGenerationPayload(fallbackMode);
  }

  const sourceTemplateReleaseId =
    parseNullableString(payload.sourceTemplateReleaseId) ?? null;
  const brandKitId = parseNullableString(payload.brandKitId) ?? null;
  const options = Array.isArray(payload.options)
    ? payload.options
        .map(rawOption => parseGenerationOption(rawOption))
        .filter((option): option is AlbumArtGenerationOption => option !== null)
    : [];

  return {
    title: typeof payload.title === 'string' ? payload.title : '',
    artistName:
      typeof payload.artistName === 'string' ? payload.artistName : '',
    prompt: typeof payload.prompt === 'string' ? payload.prompt : '',
    mode: isAlbumArtMode(payload.mode) ? payload.mode : fallbackMode,
    layoutPreset: isLayoutPreset(payload.layoutPreset)
      ? payload.layoutPreset
      : 'v1-title-artist-version',
    options,
    sourceTemplateReleaseId,
    brandKitId,
  };
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

  const parsedVersionLabel = parseNullableString(metadata.parsedVersionLabel);

  const brandKitId = parseNullableString(metadata.brandKitId);
  const albumArtTemplate = parseAlbumArtTemplate(metadata.albumArtTemplate);

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
  const mode = isAlbumArtMode(session.mode) ? session.mode : 'base';

  return {
    id: session.id,
    profileId: session.profileId,
    releaseId: session.releaseId ?? null,
    draftKey: session.draftKey ?? null,
    mode,
    templateSourceType: isTemplateSourceType(session.templateSourceType)
      ? session.templateSourceType
      : 'none',
    templateSourceId: session.templateSourceId ?? null,
    status: isSessionStatus(session.status) ? session.status : 'failed',
    consumedRuns: session.consumedRuns,
    expiresAt: session.expiresAt.toISOString(),
    payload: parseGenerationPayload(session.payloadJson, mode),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}
