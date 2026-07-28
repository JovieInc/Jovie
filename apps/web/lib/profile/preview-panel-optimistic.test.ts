import { afterEach, describe, expect, it } from 'vitest';
import type { PreviewPanelData } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import {
  __resetPreviewPanelEditCountForTests,
  beginPreviewPanelEdit,
  endPreviewPanelEdit,
  hasPendingPreviewPanelEdits,
  mergePreviewPanelHydration,
} from './preview-panel-optimistic';

function basePreview(
  overrides: Partial<PreviewPanelData> = {}
): PreviewPanelData {
  return {
    username: 'artist',
    displayName: 'Artist',
    avatarUrl: null,
    bio: 'Original bio',
    genres: ['pop'],
    location: 'Los Angeles, CA',
    hometown: 'Chicago, IL',
    activeSinceYear: 2019,
    profileEditVersion: 1,
    links: [
      {
        id: 'link-a',
        title: 'Alpha',
        url: 'https://alpha.example',
        platform: 'alpha',
        isVisible: true,
        version: 1,
      },
    ],
    profilePath: '/artist',
    dspConnections: {
      spotify: { connected: false, artistName: null },
      appleMusic: { connected: false, artistName: null },
    },
    ...overrides,
  };
}

afterEach(() => {
  __resetPreviewPanelEditCountForTests();
});

describe('preview-panel-optimistic', () => {
  it('tracks pending rail edits', () => {
    expect(hasPendingPreviewPanelEdits()).toBe(false);
    beginPreviewPanelEdit();
    beginPreviewPanelEdit();
    expect(hasPendingPreviewPanelEdits()).toBe(true);
    endPreviewPanelEdit();
    expect(hasPendingPreviewPanelEdits()).toBe(true);
    endPreviewPanelEdit();
    expect(hasPendingPreviewPanelEdits()).toBe(false);
    endPreviewPanelEdit();
    expect(hasPendingPreviewPanelEdits()).toBe(false);
  });

  it('replaces preview data on first hydrate and profile switch', () => {
    const incoming = basePreview({ bio: 'Server bio' });
    expect(mergePreviewPanelHydration(null, incoming)).toEqual(incoming);

    const switched = basePreview({
      username: 'other',
      bio: 'Other bio',
      profilePath: '/other',
    });
    expect(
      mergePreviewPanelHydration(basePreview({ bio: 'Local bio' }), switched)
    ).toEqual(switched);
  });

  it('does not roll field edits back when a stale equal-version snapshot arrives mid-edit', () => {
    beginPreviewPanelEdit();
    const current = basePreview({
      bio: 'Optimistic bio',
      location: 'Seattle, WA',
      profileEditVersion: 1,
    });
    const stale = basePreview({
      bio: 'Original bio',
      location: 'Los Angeles, CA',
      profileEditVersion: 1,
      links: [
        {
          id: 'link-a',
          title: 'Alpha',
          url: 'https://alpha.example',
          platform: 'alpha',
          isVisible: true,
          version: 1,
        },
        {
          id: 'link-b',
          title: 'Beta',
          url: 'https://beta.example',
          platform: 'beta',
          isVisible: true,
          version: 1,
        },
      ],
    });

    const merged = mergePreviewPanelHydration(current, stale);
    expect(merged.bio).toBe('Optimistic bio');
    expect(merged.location).toBe('Seattle, WA');
    expect(merged.profileEditVersion).toBe(1);
    // Pending edits also freeze links so an optimistic remove cannot flash back.
    expect(merged.links).toEqual(current.links);
  });

  it('keeps a newer local CAS version over an older dashboard snapshot', () => {
    const current = basePreview({
      bio: 'Saved bio',
      profileEditVersion: 3,
    });
    const stale = basePreview({
      bio: 'Original bio',
      profileEditVersion: 1,
      links: [
        {
          id: 'link-a',
          title: 'Alpha',
          url: 'https://alpha.example',
          platform: 'alpha',
          isVisible: true,
          version: 2,
        },
      ],
    });

    const merged = mergePreviewPanelHydration(current, stale);
    expect(merged.bio).toBe('Saved bio');
    expect(merged.profileEditVersion).toBe(3);
    expect(merged.links[0]?.version).toBe(2);
  });

  it('adopts a newer server snapshot when idle and preserves temp adds', () => {
    const current = basePreview({
      bio: 'Local bio',
      profileEditVersion: 1,
      links: [
        {
          id: 'temp-1',
          title: 'Delta',
          url: 'https://delta.example',
          platform: 'delta',
          isVisible: true,
        },
      ],
    });
    const incoming = basePreview({
      bio: 'Server bio',
      profileEditVersion: 2,
      links: [
        {
          id: 'link-a',
          title: 'Alpha',
          url: 'https://alpha.example',
          platform: 'alpha',
          isVisible: true,
          version: 1,
        },
      ],
    });

    const merged = mergePreviewPanelHydration(current, incoming);
    expect(merged.bio).toBe('Server bio');
    expect(merged.profileEditVersion).toBe(2);
    expect(merged.links.map(link => link.id)).toEqual(['link-a', 'temp-1']);
  });

  it('prefers the higher per-link version when hydrating', () => {
    const current = basePreview({
      profileEditVersion: 2,
      links: [
        {
          id: 'link-a',
          title: 'Alpha local',
          url: 'https://alpha.example/local',
          platform: 'alpha',
          isVisible: true,
          version: 4,
        },
      ],
    });
    const incoming = basePreview({
      profileEditVersion: 2,
      links: [
        {
          id: 'link-a',
          title: 'Alpha server',
          url: 'https://alpha.example/server',
          platform: 'alpha',
          isVisible: true,
          version: 2,
        },
      ],
    });

    const merged = mergePreviewPanelHydration(current, incoming);
    expect(merged.links[0]).toMatchObject({
      title: 'Alpha local',
      version: 4,
    });
  });
});
