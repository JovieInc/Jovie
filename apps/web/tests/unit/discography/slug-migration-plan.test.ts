import { describe, expect, it } from 'vitest';
import {
  legacySlugBase,
  legacyTrackSlugFallback,
  planLegacyReleaseSlugRenames,
  planLegacyTrackSlugRenames,
} from '@/lib/discography/slug-migration-plan';
import type { SlugItem } from '@/lib/discography/slug-policy';

function release(
  key: string,
  title: string,
  currentSlug: string,
  date: string | null,
  coPrimary: string[] = []
): SlugItem {
  return {
    key,
    kind: 'release',
    title,
    currentSlug,
    releaseDate: date ? new Date(`${date}T00:00:00Z`) : null,
    coPrimary,
    featured: [],
    remixers: [],
    versionType: null,
    popularity: 0,
  };
}

describe('legacySlugBase', () => {
  it('detects a bug-made numeric suffix on the title slug', () => {
    expect(legacySlugBase('take-me-over-2', 'Take Me Over')).toBe(
      'take-me-over'
    );
    expect(
      legacySlugBase(
        'take-me-over-south-blast-bounce-over-remix-2',
        'Take Me Over (South Blast! Bounce Over Remix)'
      )
    ).toBe('take-me-over-south-blast-bounce-over-remix');
  });

  it('never treats a title that really ends in a number as legacy', () => {
    expect(legacySlugBase('area-51', 'Area 51')).toBeNull();
    expect(legacySlugBase('blink-182', 'Blink 182')).toBeNull();
  });

  it('ignores plain and qualified slugs', () => {
    expect(legacySlugBase('sober', 'Sober')).toBeNull();
    expect(
      legacySlugBase('seaside-heights-2019', 'Seaside Heights')
    ).toBeNull();
    expect(legacySlugBase('other-song-2', 'Sober')).toBeNull();
  });
});

describe('planLegacyReleaseSlugRenames', () => {
  it("gives a legacy release its free bare slug (Tim's Take Me Over)", () => {
    const renames = planLegacyReleaseSlugRenames([
      release('r1', 'Take Me Over', 'take-me-over-2', '2014-05-06'),
      release('r2', 'Sober', 'sober', '2016-11-07'),
    ]);
    expect(renames).toEqual([
      { id: 'r1', from: 'take-me-over-2', to: 'take-me-over' },
    ]);
  });

  it('qualifies by year when the bare slug is reserved (deleted owner)', () => {
    const renames = planLegacyReleaseSlugRenames(
      [release('r1', 'Seaside Heights', 'seaside-heights-3', '2019-09-20')],
      new Set(['seaside-heights'])
    );
    expect(renames).toEqual([
      { id: 'r1', from: 'seaside-heights-3', to: 'seaside-heights-2019' },
    ]);
  });

  it('never takes a pinned sibling slug and keeps established URLs', () => {
    const renames = planLegacyReleaseSlugRenames([
      release('r1', 'Revival', 'revival', '2016-09-12'),
      release('r2', 'Revival', 'revival-2', '2020-01-01', ['Vigel']),
    ]);
    expect(renames).toEqual([
      { id: 'r2', from: 'revival-2', to: 'revival-with-vigel' },
    ]);
  });

  it('keeps the bare slug free when the only release is a co-primary version', () => {
    const renames = planLegacyReleaseSlugRenames([
      release('r1', 'Seaside Heights', 'seaside-heights-3', '2019-09-20', [
        'Vigel',
      ]),
    ]);
    expect(renames).toEqual([
      {
        id: 'r1',
        from: 'seaside-heights-3',
        to: 'seaside-heights-with-vigel',
      },
    ]);
  });

  it('is idempotent: a migrated catalog plans nothing', () => {
    const once = planLegacyReleaseSlugRenames([
      release('r1', 'Take Me Over', 'take-me-over-2', '2014-05-06'),
    ]);
    const after = planLegacyReleaseSlugRenames([
      release('r1', 'Take Me Over', once[0]?.to ?? '', '2014-05-06'),
    ]);
    expect(after).toEqual([]);
  });

  it('never plans a numeric slug', () => {
    const renames = planLegacyReleaseSlugRenames(
      [
        release('a', 'Song', 'song-2', null),
        release('b', 'Song', 'song-3', null),
      ],
      new Set(['song'])
    );
    for (const rename of renames) expect(rename.to).not.toMatch(/-\d{1,3}$/);
  });
});

describe('planLegacyTrackSlugRenames', () => {
  it("drops the suffix inside the release (Tim's /sober/sober-2)", () => {
    expect(
      planLegacyTrackSlugRenames([
        { id: 't1', releaseId: 'sober', title: 'Sober', slug: 'sober-2' },
        {
          id: 't2',
          releaseId: 'take-me-over',
          title: 'Take Me Over',
          slug: 'take-me-over-3',
        },
        {
          id: 't3',
          releaseId: 'take-me-over',
          title: 'Take Me Over (Extended Mix)',
          slug: 'take-me-over-extended-mix',
        },
      ])
    ).toEqual([
      { id: 't1', from: 'sober-2', to: 'sober' },
      { id: 't2', from: 'take-me-over-3', to: 'take-me-over' },
    ]);
  });

  it('leaves a track alone when its plain slug is taken in the release', () => {
    expect(
      planLegacyTrackSlugRenames([
        { id: 't1', releaseId: 'r', title: 'Intro', slug: 'intro' },
        { id: 't2', releaseId: 'r', title: 'Intro', slug: 'intro-2' },
      ])
    ).toEqual([]);
  });

  it('lets two releases each have a plain title track', () => {
    expect(
      planLegacyTrackSlugRenames([
        { id: 't1', releaseId: 'a', title: 'Sober', slug: 'sober-2' },
        { id: 't2', releaseId: 'b', title: 'Sober', slug: 'sober-3' },
      ])
    ).toEqual([
      { id: 't1', from: 'sober-2', to: 'sober' },
      { id: 't2', from: 'sober-3', to: 'sober' },
    ]);
  });
});

describe('legacyTrackSlugFallback', () => {
  it('strips a numeric suffix for the old-URL fallback', () => {
    expect(legacyTrackSlugFallback('sober-2')).toBe('sober');
    expect(legacyTrackSlugFallback('sober')).toBeNull();
  });
});
