import { DEFAULT_LIBRARY_APPROVAL_STATUS } from '@/lib/library/approval-status';
import {
  deriveWorkInspectorPresentation,
  type WorkInspectorPresentation,
} from '@/lib/library/work-inspector-read-model';
import type { TeleprompterTakeSummary } from '@/lib/teleprompter/takes/contract';
import type { LibraryReleaseAsset } from './library-data';
import { hashLibraryWaveformSeed } from './library-waveform-peaks';

export const LIBRARY_TAKE_ID_PREFIX = 'take-';

/**
 * Studio takes are private recordings. They never show on the profile and
 * have no share, approval or archive state; the Work grid only opens them.
 */
export function isLibraryTakeAsset(asset: Pick<LibraryReleaseAsset, 'id'>) {
  return asset.id.startsWith(LIBRARY_TAKE_ID_PREFIX);
}

/** Whether the drawer shows a private take, and its public presentation. */
export function libraryWorkView(asset: LibraryReleaseAsset | null): {
  readonly isTake: boolean;
  readonly presentation: WorkInspectorPresentation | null;
} {
  return {
    isTake: asset !== null && isLibraryTakeAsset(asset),
    presentation: libraryWorkPresentation(asset),
  };
}

/** The Work rail's public presentation; a private take has none. */
export function libraryWorkPresentation(
  asset: LibraryReleaseAsset | null
): WorkInspectorPresentation | null {
  if (!asset || isLibraryTakeAsset(asset)) return null;
  return deriveWorkInspectorPresentation(asset);
}

function takeTitle(take: TeleprompterTakeSummary): string {
  const base = take.title.trim();
  return base ? `${base} · Take ${take.takeNumber}` : `Take ${take.takeNumber}`;
}

export function buildLibraryTakeAssets(
  takes: readonly TeleprompterTakeSummary[],
  artistName: string
): LibraryReleaseAsset[] {
  return takes.map(take => {
    const assetId = `${LIBRARY_TAKE_ID_PREFIX}${take.takeId}`;
    return {
      itemKind: 'video',
      catalogType: 'media',
      id: assetId,
      title: takeTitle(take),
      artist: artistName,
      artworkUrl: null,
      previewUrl: null,
      videoUrl: take.mediaUrl,
      waveformSeed: hashLibraryWaveformSeed(assetId),
      smartLinkPath: take.mediaUrl,
      releaseDate: take.createdAt,
      releaseType: 'single',
      status: 'draft',
      approvalStatus: DEFAULT_LIBRARY_APPROVAL_STATUS,
      profileVisibility: 'hidden',
      lifecycleStatus: 'active',
      lifecycleStage: take.kept ? 'in_progress' : 'idea',
      trackCount: 0,
      providerCount: 0,
      providers: [],
      hasLyrics: false,
      hasArtwork: false,
      hasVideoLinks: false,
      assetKinds: ['video'],
      genres: [],
      spotifyPopularity: null,
      targetPlaylistCount: 0,
      isExplicit: false,
      label: null,
      upc: null,
      primaryIsrc: null,
      distributor: null,
      totalDurationMs: take.durationMs,
      itemStatusLabel: take.kept ? 'Kept Take' : 'Take',
      primaryActionLabel: 'Watch Take',
      primaryActionHref: take.mediaUrl,
      createdAt: take.createdAt,
      updatedAt: take.createdAt,
      mediaOrientation: 'landscape',
      ...(take.question ? { description: take.question } : {}),
    };
  });
}
