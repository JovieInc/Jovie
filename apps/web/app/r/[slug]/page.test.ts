import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  queryResults: [] as unknown[][],
  select: vi.fn(),
}));

function createQuery(result: unknown[]) {
  const query = Promise.resolve(result) as Promise<unknown[]> & {
    limit: (count: number) => Promise<unknown[]>;
  };
  query.limit = vi.fn(async () => result);
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => query),
    })),
  };
}

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.select,
  },
}));
vi.mock('@/lib/profile/public-release-eligibility', () => ({
  publicReleaseEligibilitySqlPredicate: vi.fn(() => true),
}));
vi.mock('@/lib/server-analytics', () => ({ trackServerEvent: vi.fn() }));
vi.mock('./ReleaseLandingPage', () => ({ ReleaseLandingPage: vi.fn() }));

describe('legacy release metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.queryResults.length = 0;
    hoisted.select.mockImplementation(() =>
      createQuery(hoisted.queryResults.shift() ?? [])
    );
  });

  async function generateForHandle(slug: string, handle: string) {
    hoisted.queryResults.push(
      [{ id: `release-${slug}`, title: 'Song', slug, artworkUrl: null }],
      [
        {
          displayName: 'Artist',
          username: handle,
          usernameNormalized: handle,
          avatarUrl: null,
        },
      ],
      []
    );

    const { generateMetadata } = await import('./page');
    return generateMetadata({
      params: Promise.resolve({ slug: `${slug}--profile-${slug}` }),
      searchParams: Promise.resolve({}),
    });
  }

  it('noindexes protected identities on legacy release URLs', async () => {
    const metadata = await generateForHandle('protected-song', 'dualipa');

    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it('keeps legitimate legacy release metadata indexable', async () => {
    const metadata = await generateForHandle('real-song', 'realartist');

    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });
});

describe('legacy release route status codes', () => {
  it('has no loading boundary, so permanentRedirect and notFound keep their HTTP status', () => {
    // A loading.tsx starts the response as 200 before the page runs, which
    // turns the 308 into a meta refresh and the 404 into a soft 404.
    expect(existsSync(resolve(process.cwd(), 'app/r/[slug]/loading.tsx'))).toBe(
      false
    );
  });
});
