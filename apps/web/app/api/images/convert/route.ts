import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  HEIC_MIME_TYPES,
} from '@/lib/images/config';
import { validateMagicBytes } from '@/lib/images/validate-magic-bytes';
import {
  NO_STORE_HEADERS,
  PROCESSING_TIMEOUT_MS,
  UPLOAD_ERROR_CODES,
} from '../upload/lib/constants';
import { errorResponse } from '../upload/lib/error-response';
import {
  canProcessMimeTypeWithSharp,
  convertImageBufferToJpeg,
  fileToBuffer,
  withTimeout,
} from '../upload/lib/image-processing';

export const runtime = 'nodejs';

const JPEG_MIME_TYPE = 'image/jpeg';

function toJpegFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  // Strip characters that break Content-Disposition header parsing (RFC 6266):
  // double-quotes, backslashes, and ASCII control characters.
  const safe = base.replace(/["\\]/g, '').replace(/[\x00-\x1f\x7f]/g, '');
  return (safe || 'converted') + '.jpg';
}

export async function POST(request: Request) {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return errorResponse('Unauthorized', UPLOAD_ERROR_CODES.UNAUTHORIZED, 401);
  }

  const contentType = request.headers.get('content-type');
  if (!contentType?.startsWith('multipart/form-data')) {
    return errorResponse(
      'Invalid content type. Expected multipart/form-data.',
      UPLOAD_ERROR_CODES.INVALID_CONTENT_TYPE,
      400
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return errorResponse(
      'No file provided. Please select an image to convert.',
      UPLOAD_ERROR_CODES.NO_FILE,
      400
    );
  }

  const normalizedType = file.type.toLowerCase();
  if (!HEIC_MIME_TYPES.has(normalizedType)) {
    return errorResponse(
      'Only HEIC/HEIF images can be converted.',
      UPLOAD_ERROR_CODES.INVALID_FILE,
      400
    );
  }

  if (file.size > AVATAR_MAX_FILE_SIZE_BYTES) {
    const maxMB = Math.round(AVATAR_MAX_FILE_SIZE_BYTES / (1024 * 1024));
    return errorResponse(
      `File too large. Maximum ${maxMB}MB allowed.`,
      UPLOAD_ERROR_CODES.FILE_TOO_LARGE,
      400
    );
  }

  const fileBuffer = await fileToBuffer(file);
  if (!validateMagicBytes(fileBuffer, normalizedType)) {
    return errorResponse(
      'File content does not match declared type. Please upload a valid image.',
      UPLOAD_ERROR_CODES.INVALID_FILE,
      400
    );
  }

  const canProcess = await canProcessMimeTypeWithSharp(normalizedType);
  if (!canProcess) {
    return errorResponse(
      'HEIC/HEIF is not supported in this runtime. Please upload JPEG, PNG, GIF, or WebP.',
      UPLOAD_ERROR_CODES.INVALID_FILE,
      400
    );
  }

  let jpegBuffer: Buffer;
  try {
    jpegBuffer = await withTimeout(
      convertImageBufferToJpeg(fileBuffer),
      PROCESSING_TIMEOUT_MS,
      'HEIC image conversion'
    );
  } catch {
    return errorResponse(
      'Image conversion failed. Please try again.',
      UPLOAD_ERROR_CODES.UPLOAD_FAILED,
      500
    );
  }

  const headers = new Headers(NO_STORE_HEADERS);
  headers.set('Content-Type', JPEG_MIME_TYPE);
  headers.set(
    'Content-Disposition',
    `inline; filename="${toJpegFilename(file.name)}"`
  );

  return new NextResponse(new Uint8Array(jpegBuffer), {
    status: 200,
    headers,
  });
}
