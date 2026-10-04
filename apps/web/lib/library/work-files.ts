import type { LibraryDownloadView } from './post-release-types';

export type WorkFileKind =
  | 'audio'
  | 'artwork'
  | 'video'
  | 'document'
  | 'download';

export interface WorkFileSource {
  readonly id: string;
  readonly title: string;
  readonly previewUrl?: string | null;
  readonly artworkUrl?: string | null;
  readonly videoUrl?: string | null;
  readonly hasVideoLinks?: boolean;
  readonly itemKind?: string | null;
  readonly documentStage?: string | null;
  readonly source?: { readonly provider: string } | null;
}

export interface WorkFileEntry {
  readonly id: string;
  readonly kind: WorkFileKind;
  readonly name: string;
  readonly roleLabel: string;
  readonly accessLabel: string;
  readonly thumbnailUrl?: string | null;
}

/** Extract a display file name from a media/blob URL path segment. */
export function fileNameFromMediaUrl(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  try {
    const { pathname } = new URL(url, 'https://media.invalid');
    const segment = pathname.split('/').filter(Boolean).pop() ?? '';
    return decodeURIComponent(segment).trim() || null;
  } catch {
    return null;
  }
}

/** List populated attachments, without empty media-type buckets. */
export function deriveWorkFiles(
  asset: WorkFileSource,
  downloads: readonly LibraryDownloadView[]
): WorkFileEntry[] {
  const files: WorkFileEntry[] = [];

  if (asset.previewUrl) {
    files.push({
      id: `audio:${asset.id}`,
      kind: 'audio',
      name: fileNameFromMediaUrl(asset.previewUrl) ?? 'Audio',
      roleLabel: 'Audio',
      accessLabel: 'Private recording',
    });
  }

  if (asset.artworkUrl) {
    files.push({
      id: `artwork:${asset.id}`,
      kind: 'artwork',
      name: fileNameFromMediaUrl(asset.artworkUrl) ?? 'Artwork',
      roleLabel: 'Artwork',
      accessLabel: 'Published artwork',
      thumbnailUrl: asset.artworkUrl,
    });
  }

  if (
    asset.videoUrl ||
    asset.hasVideoLinks ||
    asset.source?.provider === 'youtube'
  ) {
    files.push({
      id: `video:${asset.id}`,
      kind: 'video',
      name: asset.title,
      roleLabel: 'Video',
      accessLabel:
        asset.source?.provider === 'youtube'
          ? 'Linked from YouTube'
          : 'Linked video',
    });
  }

  if (asset.itemKind === 'document') {
    files.push({
      id: `document:${asset.id}`,
      kind: 'document',
      name: asset.title,
      roleLabel: 'Document',
      accessLabel: 'Private',
    });
  }

  for (const download of downloads) {
    files.push({
      id: `download:${download.id}`,
      kind: 'download',
      name: download.fileName || download.title,
      roleLabel: 'Download',
      accessLabel: 'Restricted',
    });
  }

  return files;
}
