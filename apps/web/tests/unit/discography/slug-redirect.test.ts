import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ select: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select },
  withRetry: (fn: () => unknown) => fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: mocks.error, warn: vi.fn(), info: vi.fn() },
}));

import { findRedirectByOldSlug } from '@/lib/discography/slug';

function queries(...results: unknown[][]) {
  for (const result of results) {
    mocks.select.mockImplementationOnce(() => {
      const q = {
        from: () => q,
        where: () => q,
        limit: () => q,
        then: (resolve: (v: unknown[]) => unknown) =>
          Promise.resolve(result).then(resolve),
      };
      return q;
    });
  }
}

describe('old numeric URLs after a slug migration', () => {
  beforeEach(() => mocks.select.mockReset());

  it('resolves the old -3 slug to the new slug (public route answers 308)', async () => {
    queries(
      [
        {
          contentType: 'release',
          releaseId: 'rel-1',
          trackId: null,
          releaseTrackId: null,
        },
      ],
      [{ slug: 'seaside-heights-with-vigel' }]
    );
    expect(await findRedirectByOldSlug('p1', 'seaside-heights-3')).toEqual({
      type: 'release',
      currentSlug: 'seaside-heights-with-vigel',
    });
  });
});
