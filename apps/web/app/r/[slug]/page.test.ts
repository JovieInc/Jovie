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
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  permanentRedirect: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
  redirect: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
}));
vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  allowIfRateLimitBackendDegraded: vi.fn(),
  publicClickLimiter: { limit: vi.fn() },
}));
vi.mock('@/lib/analytics/smart-link-admission', () => ({
  isSmartLinkCrawler: vi.fn(() => false),
}));
vi.mock('@/lib/profile/public-release-eligibility', () => ({
  publicReleaseEligibilitySqlPredicate: vi.fn(() => true),
}));
vi.mock('@/lib/server-analytics', () => ({ trackServerEvent: vi.fn() }));
vi.mock('./ReleaseLandingPage', () => ({ ReleaseLandingPage: vi.fn() }));

// Legacy smart-link slugs carry a creator_profiles.id, which is a uuid column.
const TEST_PROFILE_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

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
      params: Promise.resolve({ slug: `${slug}--${TEST_PROFILE_UUID}` }),
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

describe('legacy release smart-link slug validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.queryResults.length = 0;
    hoisted.select.mockImplementation(() =>
      createQuery(hoisted.queryResults.shift() ?? [])
    );
  });

  async function renderPage(slug: string) {
    const { default: ReleaseSmartLinkPage } = await import('./page');
    return ReleaseSmartLinkPage({
      params: Promise.resolve({ slug }),
      searchParams: Promise.resolve({}),
    });
  }

  it('404s a non-UUID profile id without querying the database', async () => {
    // Before the UUID guard this slug reached Postgres as
    // creator_profiles.id = 'not-a-uuid' and threw 22P02 (JOV-12660).
    await expect(renderPage('my-song--not-a-uuid')).rejects.toThrow(
      'NOT_FOUND'
    );
    expect(hoisted.select).not.toHaveBeenCalled();
  });

  it('404s a valid UUID profile id that has no release', async () => {
    await expect(renderPage(`my-song--${TEST_PROFILE_UUID}`)).rejects.toThrow(
      'NOT_FOUND'
    );
  });

  it('redirects a valid legacy smart link to the canonical URL', async () => {
    hoisted.queryResults.push(
      [
        {
          id: 'release-1',
          title: 'Song',
          slug: 'my-song',
          artworkUrl: null,
        },
      ],
      [
        {
          displayName: 'Artist',
          username: 'artisthandle',
          usernameNormalized: 'artisthandle',
          avatarUrl: null,
        },
      ],
      []
    );

    await expect(renderPage(`my-song--${TEST_PROFILE_UUID}`)).rejects.toThrow(
      'REDIRECT'
    );

    const { permanentRedirect } = await import('next/navigation');
    expect(permanentRedirect).toHaveBeenCalledWith('/artisthandle/my-song');
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
