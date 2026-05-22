import { describe, expect, it } from 'vitest';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';

describe('getCanonicalProfileDSPs', () => {
  it('includes a valid Spotify URL', () => {
    const result = getCanonicalProfileDSPs({
      spotify_url: 'https://open.spotify.com/artist/abc123',
    });
    expect(result.map(d => d.key)).toContain('spotify');
  });

  it('includes a valid Apple Music URL', () => {
    const result = getCanonicalProfileDSPs({
      apple_music_url: 'https://music.apple.com/us/artist/abc',
    });
    expect(result.map(d => d.key)).toContain('apple_music');
  });

  it('excludes a Spotify URL with wrong domain', () => {
    // Regression: JOV-1985 — cross-contaminated DSP URL should be hidden
    // Found by /qa on 2026-05-13
    // Report: .gstack/qa-reports/qa-report-jovie-2026-05-13.md
    const result = getCanonicalProfileDSPs({
      spotify_url: 'https://www.apple.com/music',
    });
    expect(result.map(d => d.key)).not.toContain('spotify');
  });

  it('excludes an Apple Music URL with wrong domain', () => {
    // Regression: JOV-1985 — corrupted DSP URL should be hidden
    const result = getCanonicalProfileDSPs({
      apple_music_url: 'https://open.spotify.com/artist/crosscontaminated',
    });
    expect(result.map(d => d.key)).not.toContain('apple_music');
  });

  it('excludes a non-URL string stored as spotify_url', () => {
    const result = getCanonicalProfileDSPs({
      spotify_url: 'not-a-valid-url',
    });
    expect(result.map(d => d.key)).not.toContain('spotify');
  });

  it('excludes social links with invalid URLs', () => {
    // Regression: JOV-1985 — social link import path had same bug
    const result = getCanonicalProfileDSPs({}, [
      { platform: 'spotify', url: 'bad-url' },
    ]);
    expect(result.map(d => d.key)).not.toContain('spotify');
  });

  it('includes valid social link DSP URL', () => {
    const result = getCanonicalProfileDSPs({}, [
      { platform: 'spotify', url: 'https://open.spotify.com/artist/abc' },
    ]);
    expect(result.map(d => d.key)).toContain('spotify');
  });

  it('returns empty array when all URLs are invalid', () => {
    const result = getCanonicalProfileDSPs({
      spotify_url: 'not-valid',
      apple_music_url: 'ftp://music.apple.com/artist/abc',
      youtube_url: '',
    });
    expect(result).toHaveLength(0);
  });

  it('uses Spotify ID fallback when spotify_url is absent', () => {
    const result = getCanonicalProfileDSPs({ spotify_id: 'artist123' });
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://open.spotify.com/artist/artist123');
  });

  it('uses Apple Music ID fallback when apple_music_url is absent', () => {
    const result = getCanonicalProfileDSPs({ apple_music_id: 'am123' });
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://music.apple.com/artist/am123');
  });
});
