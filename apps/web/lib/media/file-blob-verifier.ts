/**
 * Non-audio file blob verifier (JOV-5872 follow-up to the file-policy schema).
 *
 * Chat image/video/document uploads land in Vercel Blob via a presigned token
 * and were previously trusted as-is: the client's declared MIME type was never
 * checked against the actual bytes. This mirrors `lib/audio/blob-verifier.ts`
 * (ownership + `head()` metadata + a Range-fetched magic-byte sniff) but scoped
 * to a lighter signature check, since these formats only need spoofing
 * detection, not the frame-level playability guarantees audio requires.
 */

import { head } from '@vercel/blob';
import {
  type FileFormatDefinition,
  type FileUploadSurface,
  getFileBlobPathPrefix,
  getFileFormatByFileName,
  getFileFormatByMimeType,
} from '@/lib/media/file-policy';
import { logger } from '@/lib/utils/logger';

const MAX_BYTES_TO_INSPECT = 4096;

export type FileBlobRejectionCode =
  | 'file.blob_ownership'
  | 'file.blob_metadata'
  | 'file.blob_bytes'
  | 'file.blob_mismatch';

export class FileBlobVerificationError extends Error {
  readonly code: FileBlobRejectionCode;
  readonly rule: string;
  readonly cta = {
    label: 'Choose another file',
    action: 'pick_another' as const,
  };

  constructor(code: FileBlobRejectionCode, rule: string) {
    super(
      'File upload could not be verified. Choose another file and try again.'
    );
    this.name = 'FileBlobVerificationError';
    this.code = code;
    this.rule = rule;
  }
}

export interface VerifiedFileBlob {
  readonly pathname: string;
  readonly url: string;
  readonly sizeBytes: number;
  readonly contentType: string;
  readonly formatId: string;
  readonly canonicalMimeType: string;
  readonly bytesInspected: number;
  readonly latencyMs: number;
}

function reject(code: FileBlobRejectionCode, rule: string): never {
  throw new FileBlobVerificationError(code, rule);
}

function text(bytes: Uint8Array, offset: number, length: number): string {
  if (offset + length > bytes.length) return '';
  return String.fromCodePoint(...bytes.subarray(offset, offset + length));
}

function hasBytesAt(
  bytes: Uint8Array,
  offset: number,
  signature: readonly number[]
): boolean {
  if (offset + signature.length > bytes.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/** Formats with no reliable magic-byte signature; content is trusted as-is. */
const UNSNIFFABLE_FORMAT_IDS = new Set(['txt']);

/** ISO-BMFF container (mp4/mov/avif) brand at bytes[8..11] of the `ftyp` box. */
function sniffIsoBmff(bytes: Uint8Array): 'avif' | 'mov' | 'mp4' | null {
  if (text(bytes, 4, 4) !== 'ftyp') return null;
  const brand = text(bytes, 8, 4).trim();
  if (['avif', 'avis', 'mif1'].includes(brand)) return 'avif';
  if (brand === 'qt') return 'mov';
  return 'mp4';
}

/** Magic-byte sniff for non-audio uploads. Null when no signature matches. */
export function sniffFileBytes(bytes: Uint8Array): string | null {
  if (hasBytesAt(bytes, 0, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (hasBytesAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return 'png';
  if (text(bytes, 0, 6) === 'GIF87a' || text(bytes, 0, 6) === 'GIF89a')
    return 'gif';
  if (text(bytes, 0, 4) === 'RIFF' && text(bytes, 8, 4) === 'WEBP')
    return 'webp';
  if (text(bytes, 0, 4) === 'RIFF' && text(bytes, 8, 4) === 'AVI ')
    return 'avi';
  if (
    hasBytesAt(bytes, 0, [0x49, 0x49, 0x2a, 0x00]) ||
    hasBytesAt(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a])
  )
    return 'tiff';
  if (hasBytesAt(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3])) return 'webm';
  if (text(bytes, 0, 5) === '%PDF-') return 'pdf';
  const isoBmff = sniffIsoBmff(bytes);
  if (isoBmff) return isoBmff;
  return null;
}

async function verifyFileBlobInternal(input: {
  readonly blobPathname: string;
  readonly userId: string;
  readonly surface: FileUploadSurface;
  readonly fileName: string;
  readonly fileMimeType: string;
  readonly maxSizeBytes: number;
}): Promise<VerifiedFileBlob> {
  const startedAt = performance.now();
  const expectedPrefix = getFileBlobPathPrefix(input.surface, input.userId);
  if (
    !input.blobPathname.startsWith(expectedPrefix) ||
    input.blobPathname.includes('..')
  ) {
    reject(
      'file.blob_ownership',
      'File upload must belong to the authenticated user.'
    );
  }

  const declaredFormat: FileFormatDefinition | null =
    getFileFormatByMimeType(input.fileMimeType) ??
    getFileFormatByFileName(input.fileName);
  if (!declaredFormat)
    reject('file.blob_mismatch', 'The declared file type is not supported.');

  const metadata = await head(input.blobPathname);
  if (
    !metadata.pathname.startsWith(expectedPrefix) ||
    metadata.pathname !== input.blobPathname ||
    !metadata.url
  ) {
    reject(
      'file.blob_ownership',
      'File upload must belong to the authenticated user.'
    );
  }
  if (
    !Number.isSafeInteger(metadata.size) ||
    metadata.size <= 0 ||
    metadata.size > input.maxSizeBytes
  ) {
    reject(
      'file.blob_metadata',
      'The stored file size is invalid or exceeds the upload limit.'
    );
  }

  const response = await fetch(metadata.url, {
    headers: { Range: `bytes=0-${MAX_BYTES_TO_INSPECT - 1}` },
  });
  if (!response.ok)
    reject('file.blob_metadata', 'The stored file could not be read.');
  const bytes = new Uint8Array(await response.arrayBuffer());

  if (!UNSNIFFABLE_FORMAT_IDS.has(declaredFormat.id)) {
    const sniffed = sniffFileBytes(bytes);
    if (!sniffed)
      reject(
        'file.blob_bytes',
        'The stored bytes are not a recognized file format.'
      );
    if (sniffed !== declaredFormat.id)
      reject(
        'file.blob_mismatch',
        'The stored bytes do not match the declared file type.'
      );
  }

  const result = {
    pathname: metadata.pathname,
    url: metadata.url,
    sizeBytes: metadata.size,
    contentType: metadata.contentType ?? declaredFormat.canonicalMimeType,
    formatId: declaredFormat.id,
    canonicalMimeType: declaredFormat.canonicalMimeType,
    bytesInspected: bytes.length,
    latencyMs: Math.round(performance.now() - startedAt),
  } satisfies VerifiedFileBlob;
  logger.info('file_blob_verification', {
    surface: input.surface,
    format: result.formatId,
    bytesInspected: result.bytesInspected,
    latencyMs: result.latencyMs,
    outcome: 'accepted',
  });
  return result;
}

export async function verifyFileBlob(input: {
  readonly blobPathname: string;
  readonly userId: string;
  readonly surface: FileUploadSurface;
  readonly fileName: string;
  readonly fileMimeType: string;
  readonly maxSizeBytes: number;
}): Promise<VerifiedFileBlob> {
  const startedAt = performance.now();
  try {
    return await verifyFileBlobInternal(input);
  } catch (error) {
    logger.info('file_blob_verification', {
      surface: input.surface,
      format:
        getFileFormatByMimeType(input.fileMimeType)?.id ??
        getFileFormatByFileName(input.fileName)?.id ??
        'unknown',
      bytesInspected: 0,
      latencyMs: Math.round(performance.now() - startedAt),
      rejectionReason:
        error instanceof FileBlobVerificationError
          ? error.code
          : 'file.blob_metadata',
      outcome: 'rejected',
    });
    throw error;
  }
}
