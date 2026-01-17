import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { validateMagicBytes } from '@/lib/images/validate-magic-bytes';

describe('validateMagicBytes', () => {
  describe('JPEG validation', () => {
    it('should accept valid JPEG magic bytes', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      expect(validateMagicBytes(jpegBuffer, 'image/jpeg')).toBe(true);
      expect(validateMagicBytes(jpegBuffer, 'image/jpg')).toBe(true);
    });

    it('should reject invalid JPEG magic bytes', () => {
      const invalidBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(validateMagicBytes(invalidBuffer, 'image/jpeg')).toBe(false);
    });

    it('should reject text content claiming to be JPEG', () => {
      const textBuffer = Buffer.from('not a real image');
      expect(validateMagicBytes(textBuffer, 'image/jpeg')).toBe(false);
    });
  });

  describe('PNG validation', () => {
    it('should accept valid PNG magic bytes', () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      expect(validateMagicBytes(pngBuffer, 'image/png')).toBe(true);
    });

    it('should reject invalid PNG magic bytes', () => {
      const invalidBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(validateMagicBytes(invalidBuffer, 'image/png')).toBe(false);
    });
  });

  describe('WebP validation', () => {
    it('should accept valid WebP magic bytes (RIFF + WEBP)', () => {
      // WebP format: RIFF (4 bytes) + size (4 bytes) + WEBP (4 bytes)
      const webpBuffer = Buffer.from([
        0x52,
        0x49,
        0x46,
        0x46, // RIFF
        0x00,
        0x00,
        0x00,
        0x00, // file size (placeholder)
        0x57,
        0x45,
        0x42,
        0x50, // WEBP
      ]);
      expect(validateMagicBytes(webpBuffer, 'image/webp')).toBe(true);
    });

    it('should reject invalid WebP magic bytes', () => {
      const invalidBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(validateMagicBytes(invalidBuffer, 'image/webp')).toBe(false);
    });

    it('should reject WAV files spoofed as WebP (RIFF + WAVE)', () => {
      // WAV format: RIFF (4 bytes) + size (4 bytes) + WAVE (4 bytes)
      const wavBuffer = Buffer.from([
        0x52,
        0x49,
        0x46,
        0x46, // RIFF
        0x00,
        0x00,
        0x00,
        0x00, // file size (placeholder)
        0x57,
        0x41,
        0x56,
        0x45, // WAVE (not WEBP)
      ]);
      expect(validateMagicBytes(wavBuffer, 'image/webp')).toBe(false);
    });

    it('should reject AVI files spoofed as WebP (RIFF + AVI)', () => {
      // AVI format: RIFF (4 bytes) + size (4 bytes) + AVI  (4 bytes)
      const aviBuffer = Buffer.from([
        0x52,
        0x49,
        0x46,
        0x46, // RIFF
        0x00,
        0x00,
        0x00,
        0x00, // file size (placeholder)
        0x41,
        0x56,
        0x49,
        0x20, // AVI  (not WEBP)
      ]);
      expect(validateMagicBytes(aviBuffer, 'image/webp')).toBe(false);
    });

    it('should reject WebP with only RIFF header (missing WEBP signature)', () => {
      // Only RIFF header, no WEBP signature
      const riffOnlyBuffer = Buffer.from([
        0x52,
        0x49,
        0x46,
        0x46, // RIFF
        0x00,
        0x00,
        0x00,
        0x00, // file size
      ]);
      expect(validateMagicBytes(riffOnlyBuffer, 'image/webp')).toBe(false);
    });
  });

  describe('GIF validation', () => {
    it('should accept valid GIF87a magic bytes', () => {
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
      expect(validateMagicBytes(gifBuffer, 'image/gif')).toBe(true);
    });

    it('should accept valid GIF89a magic bytes', () => {
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      expect(validateMagicBytes(gifBuffer, 'image/gif')).toBe(true);
    });
  });

  describe('TIFF validation', () => {
    it('should accept little-endian TIFF magic bytes', () => {
      const tiffBuffer = Buffer.from([0x49, 0x49, 0x2a, 0x00]);
      expect(validateMagicBytes(tiffBuffer, 'image/tiff')).toBe(true);
    });

    it('should accept big-endian TIFF magic bytes', () => {
      const tiffBuffer = Buffer.from([0x4d, 0x4d, 0x00, 0x2a]);
      expect(validateMagicBytes(tiffBuffer, 'image/tiff')).toBe(true);
    });
  });

  describe('HEIC/HEIF/AVIF validation', () => {
    it('should accept valid HEIC with proper ftyp box', () => {
      // ftyp box: size (4) + "ftyp" (4) + brand (4) + minor_version (4)
      const heicBuffer = Buffer.from([
        0x00,
        0x00,
        0x00,
        0x14, // size
        0x66,
        0x74,
        0x79,
        0x70, // "ftyp"
        0x68,
        0x65,
        0x69,
        0x63, // "heic" brand
        0x00,
        0x00,
        0x00,
        0x00, // minor version
      ]);
      expect(validateMagicBytes(heicBuffer, 'image/heic')).toBe(true);
      expect(validateMagicBytes(heicBuffer, 'image/heic-sequence')).toBe(true);
    });

    it('should accept valid HEIF with proper ftyp box', () => {
      const heifBuffer = Buffer.from([
        0x00,
        0x00,
        0x00,
        0x14,
        0x66,
        0x74,
        0x79,
        0x70, // "ftyp"
        0x68,
        0x65,
        0x69,
        0x66, // "heif" brand
        0x00,
        0x00,
        0x00,
        0x00,
      ]);
      expect(validateMagicBytes(heifBuffer, 'image/heif')).toBe(true);
      expect(validateMagicBytes(heifBuffer, 'image/heif-sequence')).toBe(true);
    });

    it('should accept valid AVIF with proper ftyp box', () => {
      const avifBuffer = Buffer.from([
        0x00,
        0x00,
        0x00,
        0x14,
        0x66,
        0x74,
        0x79,
        0x70, // "ftyp"
        0x61,
        0x76,
        0x69,
        0x66, // "avif" brand
        0x00,
        0x00,
        0x00,
        0x00,
      ]);
      expect(validateMagicBytes(avifBuffer, 'image/avif')).toBe(true);
      expect(validateMagicBytes(avifBuffer, 'image/avif-sequence')).toBe(true);
    });

    it('should reject invalid ISOBMFF without proper ftyp box', () => {
      const invalidBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(validateMagicBytes(invalidBuffer, 'image/heic')).toBe(false);
      expect(validateMagicBytes(invalidBuffer, 'image/heif')).toBe(false);
      expect(validateMagicBytes(invalidBuffer, 'image/avif')).toBe(false);
      expect(validateMagicBytes(invalidBuffer, 'image/heic-sequence')).toBe(
        false
      );
      expect(validateMagicBytes(invalidBuffer, 'image/heif-sequence')).toBe(
        false
      );
      expect(validateMagicBytes(invalidBuffer, 'image/avif-sequence')).toBe(
        false
      );
    });
  });

  describe('Unknown MIME types', () => {
    it('should reject unknown MIME types for security', () => {
      const anyBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(validateMagicBytes(anyBuffer, 'image/unknown')).toBe(false);
      expect(validateMagicBytes(anyBuffer, 'application/pdf')).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty buffer', () => {
      const emptyBuffer = Buffer.from([]);
      expect(validateMagicBytes(emptyBuffer, 'image/jpeg')).toBe(false);
    });

    it('should handle buffer shorter than signature', () => {
      const shortBuffer = Buffer.from([0xff, 0xd8]); // Missing third byte
      expect(validateMagicBytes(shortBuffer, 'image/jpeg')).toBe(false);
    });
  });
});
