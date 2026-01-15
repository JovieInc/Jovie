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
  // WebP handled specially - requires RIFF header + WEBP at offset 8
  'image/webp': [],
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

// WebP magic bytes: RIFF at offset 0, WEBP at offset 8
// This distinguishes WebP from other RIFF formats like WAV (WAVE) or AVI
const WEBP_RIFF_HEADER = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50]; // "WEBP" at offset 8

// ISO Base Media File Format (ISOBMFF) ftyp box signature
// Used by HEIC, HEIF, and AVIF formats
const FTYP_SIGNATURE = [0x66, 0x74, 0x79, 0x70]; // "ftyp" at offset 4

// Valid brand codes for each format family
const HEIC_BRANDS = ['heic', 'heix', 'mif1', 'msf1'];
const HEIF_BRANDS = ['heif', 'hevx', 'mif1', 'msf1'];
const AVIF_BRANDS = ['avif', 'avis', 'mif1', 'MA1B', 'MA1A'];

/**
 * Validates WebP files by checking both RIFF header and WEBP signature.
 * WebP format: RIFF (4 bytes) + size (4 bytes) + WEBP (4 bytes)
 */
function validateWebp(buffer: Buffer): boolean {
  if (buffer.length < 12) {
    return false;
  }

  // Check RIFF header at offset 0
  const hasRiffHeader = WEBP_RIFF_HEADER.every(
    (byte, index) => buffer[index] === byte
  );

  // Check WEBP signature at offset 8
  const hasWebpSignature = WEBP_SIGNATURE.every(
    (byte, index) => buffer[8 + index] === byte
  );

  return hasRiffHeader && hasWebpSignature;
}

/**
 * Validates ISOBMFF-based formats (HEIC, HEIF, AVIF) by checking ftyp box.
 * Format: size (4 bytes) + "ftyp" (4 bytes) + major_brand (4 bytes) + ...
 */
function validateIsobmff(buffer: Buffer, validBrands: string[]): boolean {
  // Need at least 12 bytes: size(4) + ftyp(4) + brand(4)
  if (buffer.length < 12) {
    return false;
  }

  // Check for ftyp box signature at offset 4
  const hasFtypSignature = FTYP_SIGNATURE.every(
    (byte, index) => buffer[4 + index] === byte
  );

  if (!hasFtypSignature) {
    return false;
  }

  // Extract major brand (4 bytes at offset 8)
  const majorBrand = buffer.subarray(8, 12).toString('ascii');

  // Check if major brand matches expected brands
  return validBrands.includes(majorBrand);
}

/**
 * Validates HEIC/HEIF files
 */
function validateHeic(buffer: Buffer): boolean {
  return validateIsobmff(buffer, HEIC_BRANDS);
}

/**
 * Validates HEIF files
 */
function validateHeif(buffer: Buffer): boolean {
  return validateIsobmff(buffer, HEIF_BRANDS);
}

/**
 * Validates AVIF files
 */
function validateAvif(buffer: Buffer): boolean {
  return validateIsobmff(buffer, AVIF_BRANDS);
}

/**
 * Validates file magic bytes match the declared MIME type.
 * Returns true if valid, false if spoofed.
 */
export function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  // Special handling for WebP (requires non-contiguous signature check)
  if (mimeType === 'image/webp') {
    return validateWebp(buffer);
  }

  // Special handling for HEIC formats
  if (mimeType === 'image/heic' || mimeType === 'image/heic-sequence') {
    return validateHeic(buffer);
  }

  // Special handling for HEIF formats
  if (mimeType === 'image/heif' || mimeType === 'image/heif-sequence') {
    return validateHeif(buffer);
  }

  // Special handling for AVIF
  if (mimeType === 'image/avif') {
    return validateAvif(buffer);
  }

  const signatures = IMAGE_MAGIC_BYTES[mimeType];

  // Unknown MIME type - reject to be safe
  if (!signatures) {
    return false;
  }

  // No signatures defined - reject to be safe (should not happen for known types)
  if (signatures.length === 0) {
    return false;
  }

  // Check if any signature matches
  return signatures.some(signature =>
    signature.every((byte, index) => buffer[index] === byte)
  );
}
