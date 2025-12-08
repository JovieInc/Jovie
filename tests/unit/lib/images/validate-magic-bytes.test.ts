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
    it('should accept valid WebP magic bytes (RIFF container)', () => {
      // WebP starts with RIFF
      const webpBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]);
      expect(validateMagicBytes(webpBuffer, 'image/webp')).toBe(true);
    });

    it('should reject invalid WebP magic bytes', () => {
      const invalidBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(validateMagicBytes(invalidBuffer, 'image/webp')).toBe(false);
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
    it('should skip validation for HEIC (complex container format)', () => {
      // HEIC has complex container format, validated by Sharp
      const anyBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(validateMagicBytes(anyBuffer, 'image/heic')).toBe(true);
      expect(validateMagicBytes(anyBuffer, 'image/heif')).toBe(true);
      expect(validateMagicBytes(anyBuffer, 'image/heic-sequence')).toBe(true);
      expect(validateMagicBytes(anyBuffer, 'image/heif-sequence')).toBe(true);
      expect(validateMagicBytes(anyBuffer, 'image/avif')).toBe(true);
    });
  });

  describe('Unknown MIME types', () => {
    it('should skip validation for unknown MIME types', () => {
      const anyBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(validateMagicBytes(anyBuffer, 'image/unknown')).toBe(true);
      expect(validateMagicBytes(anyBuffer, 'application/pdf')).toBe(true);
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
