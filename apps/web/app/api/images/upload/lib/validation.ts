/**
 * Image Upload Validation
 *
 * Validates uploaded files for type, size, and content.
 */

import { NextResponse } from 'next/server';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
  type SupportedImageMimeType,
} from '@/lib/images/config';
import { validateMagicBytes } from '@/lib/images/validate-magic-bytes';
import { logger } from '@/lib/utils/logger';
import { imageUploadSchema } from '@/lib/validation/schemas';
import { UPLOAD_ERROR_CODES } from './constants';
import { errorResponse } from './error-response';
import { fileToBuffer } from './image-processing';

export interface ValidatedFile {
  file: File;
  normalizedType: SupportedImageMimeType;
  buffer: Buffer;
}

export async function validateUploadedFile(
  request: Request
): Promise<ValidatedFile | NextResponse> {
  const contentType = request.headers.get('content-type');
  if (!contentType?.startsWith('multipart/form-data')) {
    return errorResponse(
      'Invalid content type. Expected multipart/form-data.',
      UPLOAD_ERROR_CODES.INVALID_CONTENT_TYPE,
      400
    );
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const normalizedType = (file?.type.toLowerCase?.() ?? '') as
    | SupportedImageMimeType
    | '';

  if (!file) {
    return errorResponse(
      'No file provided. Please select an image to upload.',
      UPLOAD_ERROR_CODES.NO_FILE,
      400
    );
  }

  // Validate file type
  const validation = imageUploadSchema.safeParse({
    filename: file.name,
    contentType: normalizedType,
  });

  if (!validation.success) {
    const supportedTypes = SUPPORTED_IMAGE_MIME_TYPES.map(t =>
      t.replace('image/', '').toUpperCase()
    ).join(', ');
    return errorResponse(
      `Invalid file type. Supported formats: ${supportedTypes}`,
      UPLOAD_ERROR_CODES.INVALID_FILE,
      400
    );
  }

  // Validate magic bytes to prevent MIME type spoofing
  const fileBuffer = await fileToBuffer(file);
  if (!validateMagicBytes(fileBuffer, normalizedType)) {
    logger.warn(
      `[upload] Magic bytes mismatch for claimed type ${normalizedType}`
    );
    return errorResponse(
      'File content does not match declared type. Please upload a valid image.',
      UPLOAD_ERROR_CODES.INVALID_FILE,
      400
    );
  }

  // Check file size
  if (file.size > AVATAR_MAX_FILE_SIZE_BYTES) {
    const maxMB = Math.round(AVATAR_MAX_FILE_SIZE_BYTES / (1024 * 1024));
    return errorResponse(
      `File too large. Maximum ${maxMB}MB allowed.`,
      UPLOAD_ERROR_CODES.FILE_TOO_LARGE,
      400
    );
  }

  return {
    file,
    normalizedType: normalizedType as SupportedImageMimeType,
    buffer: fileBuffer,
  };
}
