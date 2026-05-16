import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEMO_RELEASE_SIDEBAR_FIXTURES,
  DEMO_RELEASE_VIEW_MODELS,
  FOUNDER_DEMO_RELEASE_VIEW_MODELS,
} from '@/features/demo/mock-release-data';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';

const WEB_ROOT = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : join(process.cwd(), 'apps/web');

describe('mock release data', () => {
  it('keeps the 96 Months sidebar fixture sparse relative to the full release', () => {
    const release = DEMO_RELEASE_VIEW_MODELS.find(
      item => item.id === 'calvin-96-months'
    );
    const tracks = DEMO_RELEASE_SIDEBAR_FIXTURES['calvin-96-months']?.tracks;

    expect(release).toBeDefined();
    expect(release?.totalTracks).toBe(18);
    expect(tracks).toBeDefined();
    expect(tracks).toHaveLength(6);
    expect(tracks?.map(track => track.trackNumber)).toEqual([
      1, 2, 3, 9, 11, 13,
    ]);
    expect(tracks?.length ?? 0).toBeLessThan(release?.totalTracks ?? 0);
  });

  it('keeps the Calvin fixtures clear of the Tim White founder collision', () => {
    const fixtureText = JSON.stringify({
      persona: INTERNAL_DJ_DEMO_PERSONA,
      releases: DEMO_RELEASE_VIEW_MODELS,
      sidebars: DEMO_RELEASE_SIDEBAR_FIXTURES,
    });

    expect(fixtureText).not.toContain('Blessings');
    expect(fixtureText).not.toContain('Clementine Douglas');
    expect(fixtureText).not.toContain('Tim White');
  });

  it('keeps demo-visible release artwork resolvable or explicitly external', () => {
    const demoReleases = [
      ...DEMO_RELEASE_VIEW_MODELS,
      ...FOUNDER_DEMO_RELEASE_VIEW_MODELS,
    ];

    expect(demoReleases.length).toBeGreaterThan(0);

    for (const release of demoReleases) {
      const artworkUrl = release.artworkUrl?.trim();
      expect(artworkUrl, release.title).toBeTruthy();
      if (!artworkUrl) continue;

      if (!artworkUrl.startsWith('/')) {
        expect(
          URL.canParse(artworkUrl),
          `${release.title} has invalid external artwork`
        ).toBe(true);
        continue;
      }

      const publicPath = join(WEB_ROOT, 'public', artworkUrl);
      expect(
        existsSync(publicPath),
        `${release.title} artwork asset is missing at ${publicPath}`
      ).toBe(true);
    }
  });
});
