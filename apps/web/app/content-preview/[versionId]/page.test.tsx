import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HOME_SPEC } from '@/lib/content-records/marketing-page';
import { contentReviewIdentity } from '@/lib/content-records/publication';

const state = vi.hoisted(() => ({
  version: null as unknown,
  revision: 'a'.repeat(40),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('@/lib/content-records/store.server', () => ({
  getContentVersion: vi.fn(async () => state.version),
}));
vi.mock('@/lib/observability/build-info', () => ({
  getDeployedBuildInfo: async () => ({
    commitSha: state.revision,
    buildId: 'build-a',
  }),
}));
vi.mock('@/lib/content-records/access.server', () => ({
  verifyPreviewToken: (identity: { reviewDigest: string }, token: string) =>
    token === `signed-${identity.reviewDigest}`,
}));
vi.mock('@/components/homepage/HomepageSpecSections', () => ({
  HomepageSpecSections: ({ sections }: { sections: unknown }) => (
    <div data-testid='sections'>{JSON.stringify(sections)}</div>
  ),
}));
vi.mock('../../(home)/homepage-query-provider', () => ({
  HomepageQueryProvider: ({ children }: { children: ReactNode }) => children,
}));

const id = '5f0f4c1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f';
function version() {
  const data = structuredClone(DEFAULT_HOME_SPEC);
  const hero = data.sections[0];
  if (hero?.section === 'hero') hero.copy.subhead = 'A free profile for you.';
  return { id, kind: 'marketing-page', key: 'home', schemaVersion: 1, data };
}
function query() {
  const identity = contentReviewIdentity(
    version(),
    { commitSha: 'a'.repeat(40), buildId: 'build-a' },
    null
  )!;
  return {
    token: `signed-${identity.reviewDigest}`,
    digest: identity.reviewDigest,
    live: 'none',
  };
}
async function preview(input = query()) {
  const { default: Page } = await import('./page');
  return Page({
    params: Promise.resolve({ versionId: id }),
    searchParams: Promise.resolve(input),
  });
}

describe('immutable content preview binding', () => {
  beforeEach(() => {
    state.version = version();
    state.revision = 'a'.repeat(40);
  });

  it('renders the exact stored version and advertises the same review identity', async () => {
    render(await preview());
    expect(screen.getByTestId('sections').textContent).toBe(
      JSON.stringify(version().data.sections)
    );
    expect(
      document
        .querySelector('meta[name="jovie-content-review"]')
        ?.getAttribute('content')
    ).toBe(query().digest);
  });

  it('rejects changed payload, renderer, schema and expected pointer instead of silently previewing a fallback', async () => {
    const changed = version();
    const hero = changed.data.sections[0];
    if (hero?.section === 'hero')
      hero.copy.subhead = 'Another valid profile description.';
    state.version = changed;
    await expect(preview()).rejects.toThrow('NOT_FOUND');
    state.version = version();
    state.revision = 'b'.repeat(40);
    await expect(preview()).rejects.toThrow('NOT_FOUND');
    state.revision = 'a'.repeat(40);
    state.version = { ...version(), schemaVersion: 2 };
    await expect(preview()).rejects.toThrow('NOT_FOUND');
    state.version = version();
    await expect(preview({ ...query(), live: id })).rejects.toThrow(
      'NOT_FOUND'
    );
  });

  it('rejects unsigned and legacy version-only links', async () => {
    await expect(preview({ ...query(), token: 'forged' })).rejects.toThrow(
      'NOT_FOUND'
    );
    await expect(
      preview({ token: 'old-token', digest: '', live: 'none' })
    ).rejects.toThrow('NOT_FOUND');
  });
});
