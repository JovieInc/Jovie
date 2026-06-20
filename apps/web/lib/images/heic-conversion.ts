import { fetchWithTimeoutResponse } from '@/lib/queries/fetch';
import { HEIC_MIME_TYPES } from './config';

const JPEG_MIME_TYPE = 'image/jpeg';
const HEIC_CONVERSION_ENDPOINT = '/api/images/convert';
const HEIC_CONVERSION_TIMEOUT_MS = 30_000;

function toJpegFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') + '.jpg';
}

function isBlobLike(value: unknown): value is Blob {
  return (
    value instanceof Blob ||
    (typeof value === 'object' &&
      value !== null &&
      typeof (value as Blob).arrayBuffer === 'function' &&
      typeof (value as Blob).type === 'string')
  );
}

export function isHeicLikeMimeType(mimeType: string): boolean {
  return HEIC_MIME_TYPES.has(mimeType.toLowerCase());
}

async function convertHeicToJpegInBrowser(file: File): Promise<File> {
  const heic2anyModule = await import('heic2any');
  const result = await heic2anyModule.default({
    blob: file,
    toType: JPEG_MIME_TYPE,
    quality: 0.9,
  });

  const blob = Array.isArray(result) ? result[0] : result;
  if (!isBlobLike(blob)) {
    throw new TypeError(
      'Failed to convert HEIC image. Please try a different file.'
    );
  }

  return new File([blob], toJpegFilename(file.name), {
    type: JPEG_MIME_TYPE,
    lastModified: file.lastModified,
  });
}

async function convertHeicToJpegOnServer(file: File): Promise<File> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetchWithTimeoutResponse(HEIC_CONVERSION_ENDPOINT, {
    method: 'POST',
    body: formData,
    timeout: HEIC_CONVERSION_TIMEOUT_MS,
  });
  const blob = await response.blob();

  if (!isBlobLike(blob)) {
    throw new TypeError(
      'Failed to convert HEIC image. Please try a different file.'
    );
  }

  return new File([blob], toJpegFilename(file.name), {
    type: JPEG_MIME_TYPE,
    lastModified: file.lastModified,
  });
}

export async function convertHeicToJpeg(file: File): Promise<File> {
  if (!isHeicLikeMimeType(file.type)) {
    return file;
  }

  try {
    return await convertHeicToJpegInBrowser(file);
  } catch {
    return convertHeicToJpegOnServer(file);
  }
}
