import { describe, expect, it } from 'vitest';
import {
  detectLinkDrift,
  type LinkDriftInput,
  linkPlatform,
  parseSpotifyRef,
} from './link-drift';

const NOW = '2026-10-04T00:00:00.000Z';

function input(overrides: Partial<LinkDriftInput> = {}): LinkDriftInput {
  return {
    bioPageUrl: 'https://bio.example/artist',
    bioFetchedAt: '2026-10-01T00:00:00.000Z',
    bioLinks: [
      { url: 'https://open.spotify.com/track/5uivx5IjCbutYpRpQvBbDk' },
      { url: 'https://youtu.be/abc' },
    ],
    catalog: [
      { id: 'old', title: 'Old Single', releaseDate: '2025-03-14' },
      { id: 'new', title: 'New Single', releaseDate: '2026-09-01' },
      { id: 'future', title: 'Not Out Yet', releaseDate: '2026-12-01' },
    ],
    catalogSource: 'https://open.spotify.com/artist/x',
    catalogFetchedAt: NOW,
    linkedReleases: [
      {
        url: 'https://open.spotify.com/track/5uivx5IjCbutYpRpQvBbDk',
        release: { id: 'old', title: 'Old Single', releaseDate: '2025-03-14' },
      },
    ],
    dspProfiles: [],
    health: [],
    healthCheckedAt: null,
    now: NOW,
    ...overrides,
  };
}

describe('link drift detection', () => {
  it('parses Spotify refs and platforms from public URLs', () => {
    expect(
      parseSpotifyRef(
        'https://open.spotify.com/intl-de/track/5uivx5IjCbutYpRpQvBbDk?si=1'
      )
    ).toEqual({ kind: 'track', id: '5uivx5IjCbutYpRpQvBbDk' });
    expect(parseSpotifyRef('https://example.com/track/abc')).toBeNull();
    expect(linkPlatform('https://music.apple.com/us/artist/x/1')).toBe(
      'apple_music'
    );
    expect(linkPlatform('https://youtu.be/abc')).toBe('youtube');
    expect(linkPlatform('not a url')).toBeNull();
  });

  it('flags a bio link that points at an older release, ignoring unreleased work', () => {
    const [finding] = detectLinkDrift(input());
    expect(finding).toMatchObject({
      kind: 'stale-release-link',
      label: 'Bio link',
      observedAt: NOW,
    });
    expect(finding?.value).toBe(
      'Points to “Old Single” (Mar 2025). Your latest, “New Single”, came out Sep 2026.'
    );
  });

  it('stays quiet when a bio link already points at the latest release or the gap is small', () => {
    expect(
      detectLinkDrift(
        input({
          linkedReleases: [
            ...input().linkedReleases,
            {
              url: 'https://open.spotify.com/album/x',
              release: {
                id: 'new',
                title: 'New Single',
                releaseDate: '2026-09-01',
              },
            },
          ],
        })
      )
    ).toEqual([]);
    expect(
      detectLinkDrift(
        input({
          catalog: [
            { id: 'old', title: 'Old Single', releaseDate: '2026-08-25' },
            { id: 'new', title: 'New Single', releaseDate: '2026-09-01' },
          ],
          linkedReleases: [
            {
              url: 'u',
              release: {
                id: 'old',
                title: 'Old Single',
                releaseDate: '2026-08-25',
              },
            },
          ],
        })
      )
    ).toEqual([]);
  });

  it('counts only unambiguous broken links', () => {
    const findings = detectLinkDrift(
      input({
        linkedReleases: [],
        health: [
          { url: 'a', status: 'ok' },
          { url: 'b', status: 'dead', httpStatus: 404 },
          { url: 'c', status: 'homepage-redirect' },
          { url: 'd', status: 'unknown', httpStatus: 403 },
        ],
        healthCheckedAt: NOW,
      })
    );
    expect(findings).toEqual([
      expect.objectContaining({
        kind: 'broken-links',
        value:
          '2 of the 3 bio links we could check (1 dead, 1 redirect to a homepage)',
      }),
    ]);
  });

  it('names a verified DSP profile missing from the bio page, once', () => {
    const findings = detectLinkDrift(
      input({
        linkedReleases: [],
        dspProfiles: [
          { platform: 'apple_music', url: 'https://music.apple.com/a/1' },
          { platform: 'apple_music', url: 'https://music.apple.com/a/2' },
          { platform: 'spotify', url: 'https://open.spotify.com/artist/x' },
        ],
      })
    );
    expect(findings.map(finding => finding.value)).toEqual([
      'Your Apple Music profile is not on your bio link page',
    ]);
  });

  it('returns nothing when there is nothing sourced to say', () => {
    expect(detectLinkDrift(input({ linkedReleases: [], catalog: [] }))).toEqual(
      []
    );
  });
});
