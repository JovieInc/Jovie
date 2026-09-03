import { describe, expect, it } from 'vitest';
import type { ChangelogRelease } from '@/lib/changelog-parser';
import {
  featureIntroCatalogFromChangelogRelease,
  featureIntroCatalogFromChangelogReleases,
} from './feature-intro-changelog';

function release(
  version: string,
  sections: Partial<ChangelogRelease['sections']>
): ChangelogRelease {
  return {
    version,
    date: '2026-08-16',
    summary: '',
    sections: {
      featured: [],
      added: [],
      changed: [],
      fixed: [],
      removed: [],
      ...sections,
    },
  };
}

describe('featureIntroCatalogFromChangelogRelease', () => {
  it('derives a source-bound whats new catalog from public changelog entries', () => {
    const catalog = featureIntroCatalogFromChangelogRelease(
      release('26.8.1', {
        featured: ['**Profile actions** stay truthful and usable.'],
        added: ['Library, calendar, and inbox stay together.'],
        changed: ['  '],
        fixed: ['Canceled `sign-in` stays recoverable.'],
      })
    );

    expect(catalog).toEqual({
      highlight: null,
      whatsNewID: 'changelog:26.8.1',
      whatsNewItems: [
        {
          id: '26.8.1:featured:0',
          text: 'Profile actions stay truthful and usable.',
          accent: 'accent',
        },
        {
          id: '26.8.1:added:1',
          text: 'Library, calendar, and inbox stay together.',
          accent: 'blue',
        },
        {
          id: '26.8.1:fixed:2',
          text: 'Canceled sign-in stays recoverable.',
          accent: 'orange',
        },
      ],
    });
  });

  it('selects the latest public changelog release without a static month id', () => {
    const catalog = featureIntroCatalogFromChangelogReleases([
      release('26.8.2', { fixed: ['Latest public fix.'] }),
      release('26.8.1', { added: ['Older public addition.'] }),
    ]);

    expect(catalog.whatsNewID).toBe('changelog:26.8.2');
    expect(catalog.whatsNewID).not.toBe('web-2026-08');
    expect(catalog.whatsNewItems.map(item => item.text)).toEqual([
      'Latest public fix.',
    ]);
  });

  it('returns the empty fallback when no public release item is available', () => {
    expect(
      featureIntroCatalogFromChangelogRelease(
        release('26.8.1', {
          featured: [],
          added: [],
          changed: [],
          fixed: [],
          removed: [],
        })
      )
    ).toEqual({
      highlight: null,
      whatsNewID: '',
      whatsNewItems: [],
    });
  });
});
