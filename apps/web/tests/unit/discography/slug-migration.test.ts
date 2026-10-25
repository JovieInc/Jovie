import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));

import {
  buildRenamePlan,
  countByQualifier,
  type MigrationItem,
  mayApply,
  orderRenames,
} from '@/lib/discography/slug-migration';

const rel = (over: Partial<MigrationItem> & { id: string }): MigrationItem => ({
  key: over.id,
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

const vigel = rel({
  id: 'vigel',
  currentSlug: 'seaside-heights-3',
  releaseDate: new Date('2019-09-20T00:00:00Z'),
  coPrimary: ['Vigel'],
});
const solo = rel({
  id: 'solo',
  currentSlug: 'seaside-heights-4',
  releaseDate: new Date('2020-05-14T00:00:00Z'),
});

describe('buildRenamePlan', () => {
  it('renames numeric slugs to policy slugs and reports the qualifier', () => {
    const renames = buildRenamePlan([vigel, solo]);
    expect(renames).toEqual([
      {
        releaseId: 'vigel',
        from: 'seaside-heights-3',
        to: 'seaside-heights-with-vigel',
        qualifier: 'co_primary',
      },
      {
        releaseId: 'solo',
        from: 'seaside-heights-4',
        to: 'seaside-heights',
        qualifier: 'bare',
      },
    ]);
    expect(countByQualifier(renames)).toEqual({ co_primary: 1, bare: 1 });
  });

  it('is idempotent: already-migrated slugs yield no renames', () => {
    const done = [
      { ...vigel, currentSlug: 'seaside-heights-with-vigel' },
      { ...solo, currentSlug: 'seaside-heights' },
    ];
    expect(buildRenamePlan(done)).toEqual([]);
  });

  it('handles a collision with an existing reserved slug', () => {
    const renames = buildRenamePlan([solo], new Set(['seaside-heights']));
    expect(renames[0]?.to).toBe('seaside-heights-2020');
  });

  it('never produces a numeric suffix', () => {
    const many = ['a', 'b', 'c', 'd'].map(id =>
      rel({ id, currentSlug: `seaside-heights-${id.charCodeAt(0) - 95}` })
    );
    for (const r of buildRenamePlan(many))
      expect(r.to).not.toMatch(/-\d{1,3}$/);
  });
});

describe('orderRenames', () => {
  const r = (releaseId: string, from: string, to: string) => ({
    releaseId,
    from,
    to,
    qualifier: 'year' as const,
  });

  it('applies a rename only once its target is free', () => {
    const { ordered, blocked } = orderRenames(
      [r('b', 'x-2', 'x'), r('a', 'x', 'x-with-a')],
      new Set(['x', 'x-2'])
    );
    expect(ordered.map(o => o.releaseId)).toEqual(['a', 'b']);
    expect(blocked).toEqual([]);
  });

  it('reports a swap as blocked instead of forcing it', () => {
    const { ordered, blocked } = orderRenames(
      [r('a', 'x', 'y'), r('b', 'y', 'x')],
      new Set(['x', 'y'])
    );
    expect(ordered).toEqual([]);
    expect(blocked).toHaveLength(2);
  });
});

describe('mayApply', () => {
  it('is dry-run unless a handle is listed', () => {
    expect(mayApply(undefined, 'tim')).toBe(false);
    expect(mayApply('', 'tim')).toBe(false);
    expect(mayApply('tim', 'tim')).toBe(true);
    expect(mayApply('*', 'anyone')).toBe(true);
  });
});
