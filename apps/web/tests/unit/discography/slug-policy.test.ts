import { describe, expect, it } from 'vitest';
import {
  NUMERIC_SUFFIX,
  planSlugs,
  type SlugItem,
} from '@/lib/discography/slug-policy';

const item = (over: Partial<SlugItem> & { key: string }): SlugItem => ({
  kind: 'release',
  title: 'Seaside Heights',
  currentSlug: 'x',
  releaseDate: null,
  coPrimary: [],
  featured: [],
  remixers: [],
  popularity: 0,
  ...over,
});

const vigel = item({
  key: 'vigel',
  currentSlug: 'seaside-heights-3',
  releaseDate: new Date('2019-09-20T00:00:00Z'),
  coPrimary: ['Vigel'],
});
const solo = item({
  key: 'solo',
  currentSlug: 'seaside-heights',
  releaseDate: new Date('2020-05-14T00:00:00Z'),
});

describe('planSlugs', () => {
  it.each(['', '   ', '🎵', '---'])(
    'uses the content kind when the title %j has no URL-safe characters',
    title => {
      const plan = planSlugs([
        item({ key: 'release', title }),
        item({ key: 'recording', title, kind: 'recording' }),
      ]);
      expect(plan.get('release')).toEqual({
        slug: 'release',
        qualifier: 'bare',
      });
      expect(plan.get('recording')).toEqual({
        slug: 'recording',
        qualifier: 'bare',
      });
    }
  );

  it('qualifies missing-title content around named and reserved slugs', () => {
    const plan = planSlugs(
      [
        item({ key: 'named', title: 'Release' }),
        item({ key: 'missing', title: '' }),
        item({
          key: 'dated',
          title: '🎵',
          releaseDate: new Date('2020-01-01T00:00:00Z'),
        }),
        item({ key: 'recording', title: '', kind: 'recording' }),
      ],
      new Set(['release', 'release-2020', 'recording'])
    );
    const slugs = [...plan.values()].map(({ slug }) => slug);
    expect(new Set(slugs).size).toBe(4);
    for (const slug of slugs) {
      expect(slug).toMatch(/^(?:release|recording)-[a-z][a-z0-9-]*$/);
      expect(slug).not.toMatch(NUMERIC_SUFFIX);
      expect(['release', 'release-2020', 'recording']).not.toContain(slug);
    }
  });

  it("gives the bare slug to the artist's solo original, even if later", () => {
    const plan = planSlugs([vigel, solo]);
    // Vigel & Tim White is a legitimate second version with a co-primary
    // artist: not a remix, never inferred from the title.
    expect(plan.get('solo')).toEqual({
      slug: 'seaside-heights',
      qualifier: 'bare',
    });
    expect(plan.get('vigel')).toEqual({
      slug: 'seaside-heights-with-vigel',
      qualifier: 'co_primary',
    });
  });

  it('does not infer a remix from the title text', () => {
    const titled = item({
      key: 't',
      title: 'Seaside Heights (Vigel Remix)',
      releaseDate: new Date('2019-09-20T00:00:00Z'),
    });
    const other = item({
      key: 'o',
      title: 'Seaside Heights (Vigel Remix)',
      releaseDate: new Date('2020-01-01T00:00:00Z'),
    });
    const plan = planSlugs([other, titled]);
    expect(plan.get('o')?.qualifier).toBe('year');
  });

  it('qualifies by explicit remixer metadata', () => {
    const remix = item({
      key: 'rm',
      remixers: ['Vigel'],
      releaseDate: new Date('2021-01-01T00:00:00Z'),
    });
    const plan = planSlugs([remix, solo]);
    expect(plan.get('rm')).toEqual({
      slug: 'seaside-heights-vigel-remix',
      qualifier: 'version',
    });
  });

  it('uses the year when no collaborator distinguishes the versions', () => {
    const a = item({ key: 'a', releaseDate: new Date('2018-01-01T00:00:00Z') });
    const b = item({ key: 'b', releaseDate: new Date('2021-01-01T00:00:00Z') });
    const plan = planSlugs([b, a]);
    expect(plan.get('a')?.slug).toBe('seaside-heights');
    expect(plan.get('b')).toEqual({
      slug: 'seaside-heights-2021',
      qualifier: 'year',
    });
  });

  it('falls back to year + collaborator, never a numeric suffix', () => {
    const items = [
      item({ key: 'a', releaseDate: new Date('2019-01-01T00:00:00Z') }),
      item({ key: 'b', releaseDate: new Date('2019-06-01T00:00:00Z') }),
      item({ key: 'c', releaseDate: new Date('2019-09-01T00:00:00Z') }),
      item({
        key: 'd',
        releaseDate: new Date('2019-09-01T00:00:00Z'),
        coPrimary: ['Vigel'],
      }),
    ];
    const plan = planSlugs(items);
    for (const { slug } of plan.values()) {
      expect(slug).not.toMatch(NUMERIC_SUFFIX);
    }
    expect(new Set([...plan.values()].map(p => p.slug)).size).toBe(4);
  });

  it('never generates a numeric suffix for undated identical titles', () => {
    const items = ['a', 'b', 'c'].map(key => item({ key }));
    const plan = planSlugs(items);
    expect(new Set([...plan.values()].map(p => p.slug)).size).toBe(3);
    for (const { slug } of plan.values())
      expect(slug).not.toMatch(NUMERIC_SUFFIX);
  });

  it('avoids a reserved slug (collision with existing content)', () => {
    const plan = planSlugs([solo], new Set(['seaside-heights']));
    expect(plan.get('solo')?.slug).toBe('seaside-heights-2020');
  });

  it('gives a recording a qualified slug when its release owns the bare one', () => {
    const release = item({
      key: 'r',
      releaseDate: new Date('2020-05-14T00:00:00Z'),
    });
    const recording = item({
      key: 'rec',
      kind: 'recording',
      releaseDate: new Date('2020-05-14T00:00:00Z'),
    });
    const plan = planSlugs([recording, release]);
    expect(plan.get('r')?.slug).toBe('seaside-heights');
    expect(plan.get('rec')?.slug).toBe('seaside-heights-2020');
  });

  it('keeps an established URL: a newer solo never displaces a published recording', () => {
    // Vigel is already public at the bare slug; the solo must qualify.
    const established = { ...vigel, currentSlug: 'seaside-heights' };
    const plan = planSlugs([established, solo], new Set(), new Set(['vigel']));
    expect(plan.get('vigel')).toEqual({
      slug: 'seaside-heights',
      qualifier: 'established',
    });
    expect(plan.get('solo')?.slug).toBe('seaside-heights-2020');
  });

  it('lets the solo take a bare slug that is not established (never public)', () => {
    const plan = planSlugs([vigel, solo], new Set(), new Set());
    expect(plan.get('solo')?.slug).toBe('seaside-heights');
  });
});
