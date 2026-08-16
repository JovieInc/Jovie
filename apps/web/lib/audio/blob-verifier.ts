import { head } from '@vercel/blob';
import {
  AUDIO_FORMAT_REGISTRY,
  type AudioFormatId,
  getAudioFormatByFileName,
  getAudioFormatByMimeType,
} from '@/lib/audio/constants';
import { logger } from '@/lib/utils/logger';
import { type AudioBlobSurface, getAudioBlobPathPrefix } from './blob-path';

const MAX_BYTES_TO_INSPECT = 64 * 1024;
export type AudioBlobRejectionCode =
  | 'audio.blob_ownership'
  | 'audio.blob_metadata'
  | 'audio.blob_bytes'
  | 'audio.blob_mismatch';

export class AudioBlobVerificationError extends Error {
  readonly code: AudioBlobRejectionCode;
  readonly rule: string;
  readonly cta = {
    label: 'Choose another file',
    action: 'pick_another' as const,
  };

  constructor(code: AudioBlobRejectionCode, rule: string) {
    super(
      'Audio upload could not be verified. Choose another file and try again.'
    );
    this.name = 'AudioBlobVerificationError';
    this.code = code;
    this.rule = rule;
  }
}

export interface VerifiedAudioBlob {
  readonly pathname: string;
  readonly url: string;
  readonly sizeBytes: number;
  readonly contentType: string;
  readonly formatId: AudioFormatId;
  readonly canonicalMimeType: string;
  readonly bytesInspected: number;
  readonly latencyMs: number;
}

function reject(code: AudioBlobRejectionCode, rule: string): never {
  throw new AudioBlobVerificationError(code, rule);
}

function text(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function u32(bytes: Uint8Array, offset: number, littleEndian = false): number {
  if (offset + 4 > bytes.length) return -1;
  return littleEndian
    ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
        offset,
        true
      )
    : new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
        offset
      );
}

function u24(bytes: Uint8Array, offset: number): number {
  if (offset + 3 > bytes.length) return -1;
  return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

function synchsafe(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) return -1;
  return (
    (bytes[offset] & 0x7f) * 0x200000 +
    (bytes[offset + 1] & 0x7f) * 0x4000 +
    (bytes[offset + 2] & 0x7f) * 0x80 +
    (bytes[offset + 3] & 0x7f)
  );
}

function hasMp3Frame(bytes: Uint8Array, totalSize: number): boolean {
  let offset = 0;
  if (text(bytes, 0, 3) === 'ID3') {
    const tagSize = synchsafe(bytes, 6);
    if (tagSize < 0) return false;
    offset = 10 + tagSize + ((bytes[5] & 0x10) !== 0 ? 10 : 0);
  }
  for (; offset + 4 <= bytes.length; offset += 1) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) continue;
    const version = (bytes[offset + 1] >> 3) & 3;
    const layer = (bytes[offset + 1] >> 1) & 3;
    const bitrateIndex = bytes[offset + 2] >> 4;
    const sampleRateIndex = (bytes[offset + 2] >> 2) & 3;
    const padding = (bytes[offset + 2] >> 1) & 1;
    if (
      version === 1 ||
      layer === 0 ||
      bitrateIndex === 0 ||
      bitrateIndex === 15 ||
      sampleRateIndex === 3
    )
      continue;
    const bitrate =
      [
        [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
        [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
      ][version === 3 ? 0 : 1][bitrateIndex] * 1000;
    const sampleRates =
      version === 3 ? [44100, 48000, 32000] : [22050, 24000, 16000];
    const frameLength =
      layer === 3
        ? Math.floor((12 * bitrate) / sampleRates[sampleRateIndex]) + padding
        : Math.floor((144 * bitrate) / sampleRates[sampleRateIndex]) + padding;
    return frameLength >= 4 && offset + frameLength <= totalSize;
  }
  return false;
}

function hasWave(bytes: Uint8Array, totalSize: number): boolean {
  if (text(bytes, 0, 4) !== 'RIFF' || text(bytes, 8, 4) !== 'WAVE')
    return false;
  let offset = 12;
  let hasFormat = false;
  let hasData = false;
  while (offset + 8 <= bytes.length) {
    const size = u32(bytes, offset + 4, true);
    if (size < 0) return false;
    const end = offset + 8 + size + (size % 2);
    if (end > totalSize) return false;
    if (text(bytes, offset, 4) === 'fmt ' && size >= 16) hasFormat = true;
    if (text(bytes, offset, 4) === 'data' && size > 0) hasData = true;
    if (end > bytes.length) break;
    offset = end;
  }
  return hasFormat && hasData;
}

function hasFlac(bytes: Uint8Array, totalSize: number): boolean {
  if (text(bytes, 0, 4) !== 'fLaC') return false;
  let offset = 4;
  let hasStreamInfo = false;
  while (offset + 4 <= bytes.length) {
    const last = (bytes[offset] & 0x80) !== 0;
    const type = bytes[offset] & 0x7f;
    const size = u24(bytes, offset + 1);
    if (size < 0 || offset + 4 + size > totalSize) return false;
    if (type === 0 && size >= 34) hasStreamInfo = true;
    offset += 4 + size;
    if (last) return hasStreamInfo;
    if (offset > bytes.length) return false;
  }
  return false;
}

function hasAiff(bytes: Uint8Array, totalSize: number): boolean {
  if (
    text(bytes, 0, 4) !== 'FORM' ||
    !['AIFF', 'AIFC'].includes(text(bytes, 8, 4))
  )
    return false;
  const formSize = u32(bytes, 4);
  if (formSize < 4 || formSize + 8 > totalSize) return false;
  let offset = 12;
  let hasComm = false;
  let hasSound = false;
  while (offset + 8 <= bytes.length) {
    const size = u32(bytes, offset + 4);
    if (size < 0 || offset + 8 + size + (size % 2) > totalSize) return false;
    if (text(bytes, offset, 4) === 'COMM' && size >= 18) hasComm = true;
    if (text(bytes, offset, 4) === 'SSND' && size >= 8) hasSound = true;
    const end = offset + 8 + size + (size % 2);
    if (end > bytes.length) break;
    offset = end;
  }
  return hasComm && hasSound;
}

function hasAdts(bytes: Uint8Array, totalSize: number): boolean {
  if (bytes.length < 7 || bytes[0] !== 0xff || (bytes[1] & 0xf6) !== 0xf0)
    return false;
  const frameLength =
    ((bytes[3] & 3) << 11) | (bytes[4] << 3) | (bytes[5] >> 5);
  return frameLength >= 7 && frameLength <= totalSize;
}

function hasM4a(bytes: Uint8Array, totalSize: number): boolean {
  let offset = 0;
  let hasFtyp = false;
  let hasMoov = false;
  while (offset + 8 <= bytes.length) {
    let size = u32(bytes, offset);
    const type = text(bytes, offset + 4, 4);
    if (size === 1) return false;
    if (size === 0) size = totalSize - offset;
    if (size < 8 || offset + size > totalSize) return false;
    if (type === 'ftyp') hasFtyp = true;
    if (type === 'moov') hasMoov = true;
    if (offset + size > bytes.length) break;
    offset += size;
  }
  return hasFtyp && hasMoov;
}

export function sniffAudioBytes(
  bytes: Uint8Array,
  totalSize: number
): AudioFormatId | null {
  if (hasWave(bytes, totalSize)) return 'wav';
  if (hasFlac(bytes, totalSize)) return 'flac';
  if (hasAiff(bytes, totalSize)) return 'aiff';
  if (hasAdts(bytes, totalSize)) return 'aac';
  if (hasM4a(bytes, totalSize)) return 'm4a';
  if (hasMp3Frame(bytes, totalSize)) return 'mp3';
  return null;
}

async function verifyAudioBlobInternal(input: {
  readonly blobUrl: string;
  readonly blobPathname: string;
  readonly userId: string;
  readonly surface: AudioBlobSurface;
  readonly fileName: string;
  readonly fileMimeType: string;
  readonly maxSizeBytes: number;
}): Promise<VerifiedAudioBlob> {
  const startedAt = performance.now();
  const expectedPrefix = getAudioBlobPathPrefix(input.surface, input.userId);
  if (
    !input.blobPathname.startsWith(expectedPrefix) ||
    input.blobPathname.includes('..')
  ) {
    reject(
      'audio.blob_ownership',
      'Audio upload must belong to the authenticated user.'
    );
  }

  const declaredFormat =
    getAudioFormatByMimeType(input.fileMimeType) ??
    getAudioFormatByFileName(input.fileName);
  if (!declaredFormat)
    reject(
      'audio.blob_mismatch',
      'The declared audio format is not supported.'
    );

  const metadata = await head(input.blobPathname);
  if (
    !metadata.pathname.startsWith(expectedPrefix) ||
    metadata.pathname !== input.blobPathname ||
    !metadata.url
  ) {
    reject(
      'audio.blob_ownership',
      'Audio upload must belong to the authenticated user.'
    );
  }
  if (
    !Number.isSafeInteger(metadata.size) ||
    metadata.size <= 0 ||
    metadata.size > input.maxSizeBytes
  ) {
    reject(
      'audio.blob_metadata',
      'The stored audio size is invalid or exceeds the upload limit.'
    );
  }

  const response = await fetch(metadata.url, {
    headers: { Range: `bytes=0-${MAX_BYTES_TO_INSPECT - 1}` },
  });
  if (!response.ok)
    reject('audio.blob_metadata', 'The stored audio could not be read.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const formatId = sniffAudioBytes(bytes, metadata.size);
  if (!formatId)
    reject(
      'audio.blob_bytes',
      'The stored bytes are not a complete supported audio file.'
    );
  if (formatId !== declaredFormat.id)
    reject(
      'audio.blob_mismatch',
      'The stored bytes do not match the declared audio format.'
    );

  const format = AUDIO_FORMAT_REGISTRY.find(
    candidate => candidate.id === formatId
  );
  if (!format)
    reject('audio.blob_mismatch', 'The stored audio format is not supported.');

  const result = {
    pathname: metadata.pathname,
    url: metadata.url,
    sizeBytes: metadata.size,
    contentType: metadata.contentType ?? format.canonicalMimeType,
    formatId,
    canonicalMimeType: format.canonicalMimeType,
    bytesInspected: bytes.length,
    latencyMs: Math.round(performance.now() - startedAt),
  } satisfies VerifiedAudioBlob;
  logger.info('audio_blob_verification', {
    surface: input.surface,
    format: result.formatId,
    bytesInspected: result.bytesInspected,
    latencyMs: result.latencyMs,
    outcome: 'accepted',
  });
  return result;
}

export async function verifyAudioBlob(input: {
  readonly blobUrl: string;
  readonly blobPathname: string;
  readonly userId: string;
  readonly surface: AudioBlobSurface;
  readonly fileName: string;
  readonly fileMimeType: string;
  readonly maxSizeBytes: number;
}): Promise<VerifiedAudioBlob> {
  const startedAt = performance.now();
  try {
    return await verifyAudioBlobInternal(input);
  } catch (error) {
    logger.info('audio_blob_verification', {
      surface: input.surface,
      format:
        getAudioFormatByMimeType(input.fileMimeType)?.id ??
        getAudioFormatByFileName(input.fileName)?.id ??
        'unknown',
      bytesInspected: 0,
      latencyMs: Math.round(performance.now() - startedAt),
      rejectionReason:
        error instanceof AudioBlobVerificationError
          ? error.code
          : 'audio.blob_metadata',
      outcome: 'rejected',
    });
    throw error;
  }
}
