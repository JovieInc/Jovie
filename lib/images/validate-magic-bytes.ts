/**
 * Magic bytes signatures for image validation
 * This prevents MIME type spoofing attacks
 */
const IMAGE_MAGIC_BYTES: Record<string, number[][]> = {
  'image/jpeg': [
    [0xff, 0xd8, 0xff], // JPEG/JFIF
  ],
  'image/jpg': [
    [0xff, 0xd8, 0xff], // JPEG/JFIF
  ],
  'image/png': [
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
  ],
  'image/webp': [
    [0x52, 0x49, 0x46, 0x46], // RIFF (WebP container)
  ],
  'image/gif': [
    [0x47, 0x49, 0x46, 0x38], // GIF87a or GIF89a
  ],
  // HEIC/HEIF have complex container format - validated by Sharp
  'image/heic': [],
  'image/heif': [],
  'image/heic-sequence': [],
  'image/heif-sequence': [],
  'image/avif': [],
  'image/tiff': [
    [0x49, 0x49, 0x2a, 0x00], // Little-endian TIFF
    [0x4d, 0x4d, 0x00, 0x2a], // Big-endian TIFF
  ],
};

/**
 * Validates file magic bytes match the declared MIME type.
 * Returns true if valid, false if spoofed.
 */
export function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = IMAGE_MAGIC_BYTES[mimeType];

  // Skip validation for formats without simple magic bytes (HEIC/HEIF/AVIF)
  // These are validated by Sharp during processing
  if (!signatures || signatures.length === 0) {
    return true;
  }

  // Check if any signature matches
  return signatures.some(signature =>
    signature.every((byte, index) => buffer[index] === byte)
  );
}
