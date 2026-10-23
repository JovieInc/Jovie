import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getContentBySlug: vi.fn(),
  getCreatorByUsername: vi.fn(),
  getUnpublishedReleasePresence: vi.fn(),
  findRedirectByOldSlug: vi.fn(),
  hasProfileModeAliasContentCandidate: vi.fn(),
}));

vi.mock('@/app/[username]/[slug]/_lib/data', () => ({
  getContentBySlug: mocks.getContentBySlug,
  getCreatorByUsername: mocks.getCreatorByUsername,
  getUnpublishedReleasePresence: mocks.getUnpublishedReleasePresence,
}));

vi.mock('@/app/[username]/[...slug]/_lib/content-candidate', () => ({
  hasProfileModeAliasContentCandidate:
    mocks.hasProfileModeAliasContentCandidate,
}));

vi.mock('@/lib/discography/slug', () => ({
  findRedirectByOldSlug: mocks.findRedirectByOldSlug,
}));

import { GET } from '@/app/api/profile-alias-decision/route';

function endpointUrl(params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return `http://localhost:3000/api/profile-alias-decision?${search.toString()}`;
}

const CREATOR = {
  id: 'creator-1',
  usernameNormalized: 'dualipa',
};

function mockCleanAliasModeProfile(): void {
  mocks.getCreatorByUsername.mockResolvedValue(CREATOR);
  mocks.hasProfileModeAliasContentCandidate.mockResolvedValue(false);
  mocks.getContentBySlug.mockResolvedValue(null);
  mocks.findRedirectByOldSlug.mockResolvedValue(null);
  mocks.getUnpublishedReleasePresence.mockResolvedValue(null);
}

describe('GET /api/profile-alias-decision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCleanAliasModeProfile();
  });

  it('serves a CDN-cacheable mode decision for a clean alias', async () => {
    const response = await GET(
      new Request(endpointUrl({ alias: 'listen', username: 'dualipa' }))
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'public, s-maxage=300, stale-while-revalidate=300'
    );
    await expect(response.json()).resolves.toEqual({
      creatorUsername: 'dualipa',
      href: '/dualipa?mode=listen',
      kind: 'mode',
    });
  });

  it('returns a moved decision for renamed-content old slugs', async () => {
    mocks.findRedirectByOldSlug.mockResolvedValue({
      currentSlug: 'renamed-slug',
      type: 'release',
    });

    const response = await GET(
      new Request(endpointUrl({ alias: 'listen', username: 'dualipa' }))
    );

    await expect(response.json()).resolves.toEqual({
      creatorUsername: 'dualipa',
      href: '/dualipa/renamed-slug',
      kind: 'moved',
    });
  });

  it('returns a content decision for real content or unpublished presence', async () => {
    mocks.hasProfileModeAliasContentCandidate.mockResolvedValue(true);
    mocks.getContentBySlug.mockResolvedValue({ id: 'content-1' });
    const response = await GET(
      new Request(endpointUrl({ alias: 'music', username: 'dualipa' }))
    );
    await expect(response.json()).resolves.toEqual({
      creatorUsername: 'dualipa',
      kind: 'content',
    });

    mockCleanAliasModeProfile();
    mocks.getUnpublishedReleasePresence.mockResolvedValue({
      title: 'Unreleased',
    });
    const unpublished = await GET(
      new Request(endpointUrl({ alias: 'listen', username: 'dualipa' }))
    );
    await expect(unpublished.json()).resolves.toEqual({
      creatorUsername: 'dualipa',
      kind: 'content',
    });
  });

  it('returns a missing decision for unknown creators', async () => {
    mocks.getCreatorByUsername.mockResolvedValue(null);

    const response = await GET(
      new Request(endpointUrl({ alias: 'listen', username: 'nobody' }))
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ kind: 'missing' });
  });

  it('rejects non-reserved alias slugs without caching', async () => {
    const response = await GET(
      new Request(endpointUrl({ alias: 'not-a-mode', username: 'dualipa' }))
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.getCreatorByUsername).not.toHaveBeenCalled();
  });

  it('fails unavailable and uncached when the decision data errors', async () => {
    mocks.hasProfileModeAliasContentCandidate.mockRejectedValue(
      new Error('database down')
    );

    const response = await GET(
      new Request(endpointUrl({ alias: 'listen', username: 'dualipa' }))
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({ kind: 'unavailable' });
  });
});
