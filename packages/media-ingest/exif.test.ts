import { describe, expect, it } from 'vitest';
import { extractExif } from './exif';
import { buildJpeg } from './test-helpers';

describe('extractExif', () => {
  it('parses date, gps and camera model from a jpeg', () => {
    const jpeg = buildJpeg({});
    const info = extractExif(jpeg);
    expect(info).not.toBeNull();
    expect(info?.capturedAt).toBe('2026-09-20T21:34:00.000Z');
    expect(info?.cameraModel).toBe('iPhone 15 Pro');
    expect(info?.latitude).toBeCloseTo(34.0522, 3);
    expect(info?.longitude).toBeCloseTo(-118.2437, 3);
  });

  it('applies southern and eastern hemisphere signs', () => {
    const jpeg = buildJpeg({ latRef: 'S', lonRef: 'E' });
    const info = extractExif(jpeg);
    expect(info?.latitude).toBeLessThan(0);
    expect(info?.longitude).toBeGreaterThan(0);
  });

  it('returns null for non-jpeg data', () => {
    expect(extractExif(Buffer.from('not a jpeg'))).toBeNull();
  });
});
