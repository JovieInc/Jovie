import { describe, expect, it } from 'vitest';
import { formatLyrics } from '@/lib/lyrics';

describe('formatLyrics', () => {
  const input = '[Verse 1]\nHello world\n\n[Chorus]\nLa la la\n';

  it('dispatches to Apple Music formatter', () => {
    const result = formatLyrics(input, 'apple-music');
    // Apple Music removes section labels
    expect(result.formatted).not.toContain('[Verse 1]');
    expect(result.formatted).not.toContain('[Chorus]');
  });

  it('dispatches to Deezer formatter', () => {
    const result = formatLyrics(input, 'deezer');
    // Deezer removes section labels
    expect(result.formatted).not.toContain('[Verse 1]');
    expect(result.formatted).not.toContain('[Chorus]');
  });

  it('dispatches to Genius formatter', () => {
    const result = formatLyrics(input, 'genius');
    // Genius preserves section labels
    expect(result.formatted).toContain('[Verse 1]');
    expect(result.formatted).toContain('[Chorus]');
  });
});
