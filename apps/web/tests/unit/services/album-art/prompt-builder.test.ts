import { describe, expect, it } from 'vitest';
import { buildAlbumArtPrompt } from '@/lib/services/album-art/prompt-builder';

describe('buildAlbumArtPrompt', () => {
  it('forces text-free and logo-free image generation constraints', () => {
    const prompt = buildAlbumArtPrompt({
      profileId: 'profile-1',
      title: 'Tokyo Drift',
      artistName: 'Neon Valley',
      releaseType: 'single',
      genres: ['house', 'melodic techno'],
      mode: 'base',
      runLimit: 1,
    });

    expect(prompt).toContain('text-free');
    expect(prompt).toContain('logo-free');
    expect(prompt).toContain('Do not include letters');
    expect(prompt).toContain('Genres: house, melodic techno.');
  });

  it('uses only the first two genres when more are provided', () => {
    const prompt = buildAlbumArtPrompt({
      profileId: 'profile-1',
      title: 'Tokyo Drift',
      artistName: 'Neon Valley',
      releaseType: 'single',
      genres: ['house', 'melodic techno', 'progressive house'],
      mode: 'base',
      runLimit: 1,
    });

    expect(prompt).toContain('Genres: house, melodic techno.');
    expect(prompt).not.toContain('progressive house');
  });
});
