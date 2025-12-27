import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  formatAcceptedImageTypes,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';

export const DEFAULT_MAX_FILE_SIZE = AVATAR_MAX_FILE_SIZE_BYTES;
export const DEFAULT_ACCEPTED_TYPES = SUPPORTED_IMAGE_MIME_TYPES;

/**
 * Validates a file for avatar upload
 * @returns Error message if validation fails, null if valid
 */
export function validateAvatarFile(
  file: File,
  maxFileSize: number = DEFAULT_MAX_FILE_SIZE,
  acceptedTypes: readonly string[] = DEFAULT_ACCEPTED_TYPES
): string | null {
  const normalizedType = file.type.toLowerCase?.() ?? file.type;
  if (!acceptedTypes.includes(normalizedType)) {
    const allowedTypes = formatAcceptedImageTypes(acceptedTypes);
    return `Invalid file type. Please select ${allowedTypes.join(', ')} files only.`;
  }

  if (file.size > maxFileSize) {
    const sizeMB = Math.round(maxFileSize / (1024 * 1024));
    return `File too large. Please select a file smaller than ${sizeMB}MB.`;
  }

  return null;
}
