/**
 * Shared formatting utilities for promo download files.
 * Used by both the client-side gate component and email templates.
 */

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const MIME_EXTENSION_MAP: Record<string, string> = {
  'audio/mpeg': 'MP3',
  'audio/wav': 'WAV',
  'audio/flac': 'FLAC',
  'audio/aiff': 'AIFF',
  'audio/mp4': 'M4A',
  'audio/x-m4a': 'M4A',
};

export function formatExtension(mimeType: string): string {
  return MIME_EXTENSION_MAP[mimeType] ?? 'Audio';
}
