import { describe, expect, it } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { findMatchingReleaseFamilyTemplate } from '@/lib/services/album-art/template-matcher';

const RELEASE_TEMPLATE: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Tokyo Drift',
  slug: 'tokyo-drift',
  smartLinkPath: '/tim/tokyo-drift',
  providers: [],
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
  albumArtTemplate: {
    version: 1,
    source: 'ai_generated',
    mode: 'release_family_locked',
    layoutPreset: 'v1-title-artist-version',
    baseTitle: 'Tokyo Drift',
    normalizedBaseTitle: 'tokyo drift',
    versionLabel: null,
    artistText: 'Neon Valley',
    backgroundAssetUrl: 'https://example.com/bg.png',
    backgroundPrompt: 'prompt',
    overlayTone: 'light',
    sourceReleaseId: 'release-1',
    brandKitId: null,
    logoAssetUrl: null,
    logoPosition: null,
    logoOpacity: null,
    model: 'google/imagen-4.0-generate-001',
    generatedAt: '2026-04-02T00:00:00.000Z',
  },
};

describe('findMatchingReleaseFamilyTemplate', () => {
  it('matches remix siblings by normalized base title', () => {
    const result = findMatchingReleaseFamilyTemplate({
      releaseId: 'release-2',
      title: 'Tokyo Drift (VIP Mix)',
      releases: [RELEASE_TEMPLATE],
    });

    expect(result.sourceReleaseId).toBe('release-1');
    expect(result.template?.backgroundAssetUrl).toBe(
      'https://example.com/bg.png'
    );
    expect(result.parsedTitle.versionLabel).toBe('VIP Mix');
  });
});
