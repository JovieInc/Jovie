import type { Experimental_DownloadFunction } from 'ai';
import { UPLOADABLE_FILE_CONTENT_TYPES } from '@/lib/media/file-policy';

const BLOB_UPLOAD_HOST =
  /^[a-z0-9-]+(?:\.public)?\.blob\.vercel-storage\.com$/u;
const BASE64_DATA =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

/** Chat's upload transport produces public HTTPS Vercel Blob URLs. */
export function isChatUploadUrl(value: string): boolean {
  if (/\s/u.test(value) || value.includes('\\')) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      BLOB_UPLOAD_HOST.test(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname !== '/'
    );
  } catch {
    return false;
  }
}

function isInlineAttachment(url: string, mediaType: string): boolean {
  const prefix = `data:${mediaType};base64,`;
  if (!url.startsWith(prefix)) return false;
  const data = url.slice(prefix.length);
  return data.length > 0 && BASE64_DATA.test(data);
}

/** Validate parts before text extraction or AI SDK conversion on either route. */
export function validateChatMessageParts(
  parts: readonly unknown[]
): string | null {
  for (const part of parts) {
    if (!part || typeof part !== 'object' || Array.isArray(part)) {
      return 'Invalid message part';
    }
    const value = part as Record<string, unknown>;
    if (typeof value.type !== 'string' || value.type.length === 0) {
      return 'Invalid message part';
    }
    if (value.type === 'text' && typeof value.text !== 'string') {
      return 'Invalid text part';
    }
    if (value.type !== 'file') continue;
    if (
      typeof value.url !== 'string' ||
      typeof value.mediaType !== 'string' ||
      !UPLOADABLE_FILE_CONTENT_TYPES.includes(value.mediaType) ||
      !(
        isChatUploadUrl(value.url) ||
        isInlineAttachment(value.url, value.mediaType)
      )
    ) {
      return 'Invalid file attachment';
    }
  }
  return null;
}

/** Never let SDK fallback downloads turn a chat attachment into server HTTP. */
export const downloadChatAttachments: Experimental_DownloadFunction =
  async downloads =>
    downloads.map(({ url, isUrlSupportedByModel }) => {
      if (!isChatUploadUrl(url.href) || !isUrlSupportedByModel) {
        throw new Error('Unsupported chat attachment');
      }
      return null;
    });
