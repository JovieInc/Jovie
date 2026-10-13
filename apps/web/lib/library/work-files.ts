import { getAudioFormat } from '@/lib/audio/constants';
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

/** What one dropped, pasted or picked file becomes on a work. */
export type WorkAttachmentKind =
  | 'audio'
  | 'artwork'
  | 'video'
  | 'document'
  | 'download'
  | 'unknown';

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi']);
const DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'txt',
  'md',
  'rtf',
  'pages',
]);
const DOWNLOAD_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz']);
const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'avif',
  'heic',
  'heif',
]);

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Detect the attachment kind after the user hands over a file, so the
 * inspector needs one Attach control instead of one button per media type.
 * MIME wins when the browser provides one; the extension covers blank MIME.
 */
export function classifyWorkAttachment(file: {
  readonly name: string;
  readonly type: string;
}): WorkAttachmentKind {
  const mime = file.type.toLowerCase();
  const extension = fileExtension(file.name);
  if (getAudioFormat(file)) return 'audio';
  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) {
    return 'artwork';
  }
  if (mime.startsWith('video/') || VIDEO_EXTENSIONS.has(extension)) {
    return 'video';
  }
  if (
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    DOCUMENT_EXTENSIONS.has(extension)
  ) {
    return 'document';
  }
  if (mime.includes('zip') || DOWNLOAD_EXTENSIONS.has(extension)) {
    return 'download';
  }
  return 'unknown';
}
