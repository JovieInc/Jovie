import { describe, expect, it } from 'vitest';
import {
  fileDisplayName,
  fileKindFromMediaType,
  filenameFromUrlOrName,
  isVercelBlobUrl,
  middleEllipsis,
} from '@/lib/chat/file-display-name';

describe('file-display-name (JOV-3492)', () => {
  it('detects Vercel blob hosts', () => {
    expect(
      isVercelBlobUrl(
        'https://egojgbuon2z2yahy.public.blob.vercel-storage.com/Never%20Say%20A%20Word_Instrumental.wav'
      )
    ).toBe(true);
    expect(isVercelBlobUrl('https://example.com/file.wav')).toBe(false);
  });

  it('URL-decodes and strips blob host path noise', () => {
    const url =
      'https://egojgbuon2z2yahy.public.blob.vercel-storage.com/Never%20Say%20A%20Word_Instrumental.wav';
    expect(filenameFromUrlOrName(url)).toBe(
      'Never Say A Word_Instrumental.wav'
    );
    expect(fileDisplayName(url)).not.toContain('blob.vercel-storage.com');
    expect(fileDisplayName(url)).not.toContain('%20');
  });

  it('prefers an explicit name over the URL basename', () => {
    expect(
      filenameFromUrlOrName('https://cdn.example.com/x.wav', 'Mix Final.wav')
    ).toBe('Mix Final.wav');
  });

  it('middle-ellipsizes long names', () => {
    const long = 'a'.repeat(60) + '.wav';
    const display = middleEllipsis(long, 20);
    expect(display.length).toBeLessThanOrEqual(21);
    expect(display).toContain('…');
    expect(display.endsWith('.wav')).toBe(true);
  });

  it('maps media types and extensions to file kinds', () => {
    expect(fileKindFromMediaType('audio/wav')).toBe('audio');
    expect(fileKindFromMediaType('image/png')).toBe('image');
    expect(fileKindFromMediaType('application/pdf')).toBe('document');
    expect(fileKindFromMediaType('application/zip')).toBe('archive');
    expect(fileKindFromMediaType(undefined, 'master.wav')).toBe('audio');
  });
});
