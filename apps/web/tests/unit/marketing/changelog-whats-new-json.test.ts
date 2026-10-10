import { beforeEach, describe, expect, it, vi } from 'vitest';

const getChangelogSnapshot = vi.fn();

vi.mock('@/constants/app', () => ({
  APP_NAME: 'Jovie',
  BASE_URL: 'https://jov.ie',
}));

vi.mock('@/lib/changelog-source', () => ({ getChangelogSnapshot }));

const RELEASE_FIXTURE = {
  version: '26.9.0',
  kind: 'release',
  date: '2026-09-26',
  summary: '',
  sections: {
    featured: [],
    added: ["**What's new on Mac:** A banner links the changelog post."],
    changed: [],
    fixed: ['The Mac app recovers from blank screens.'],
    removed: [],
  },
  dogfood: ['Relaunch the Mac app and open the banner link'],
};

Object.assign(RELEASE_FIXTURE, {
  customerOutcomes: Object.entries(RELEASE_FIXTURE.sections).flatMap(
    ([section, entries]) =>
      entries.map((summary, index) => ({
        storyId: `${section}-${index}`,
        entryId: `customer-update:${section}-${index}`,
        slug: `update-${section}-${index}`,
        aliases: [],
        summary,
        section,
        availability: 'unverified',
        prerequisites: [],
      }))
  ),
});

describe('GET /changelog/whats-new.json', () => {
  beforeEach(() => {
    getChangelogSnapshot.mockResolvedValue({
      releases: [RELEASE_FIXTURE],
      sourceReleases: [RELEASE_FIXTURE],
      unpublishedReleases: [],
    });
  });

  it('serves the versioned, cacheable What’s New contract', async () => {
    const { GET } = await import(
      '../../../app/(marketing)/changelog/whats-new.json/route'
    );
    const response = await GET();

    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(await response.json()).toEqual({
      version: 1,
      changelogUrl: 'https://jov.ie/changelog',
      entries: [
        {
          id: '26.9.0',
          title: "What's new on Mac",
          date: '2026-09-26',
          summary: 'A banner links the changelog post.',
          url: 'https://jov.ie/changelog#update-added-0',
          highlights: ['The Mac app recovers from blank screens.'],
          dogfood: ['Relaunch the Mac app and open the banner link'],
        },
      ],
    });
  });

  it('serves an empty entry list when nothing is public', async () => {
    getChangelogSnapshot.mockResolvedValue({
      releases: [],
      sourceReleases: [],
      unpublishedReleases: [],
    });
    const { GET } = await import(
      '../../../app/(marketing)/changelog/whats-new.json/route'
    );
    const body = await (await GET()).json();
    expect(body.entries).toEqual([]);
  });
});
