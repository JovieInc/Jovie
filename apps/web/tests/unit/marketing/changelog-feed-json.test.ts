import { beforeEach, describe, expect, it, vi } from 'vitest';

const getChangelogSnapshot = vi.fn();

vi.mock('@/constants/app', () => ({
  APP_NAME: 'Jovie',
  BASE_URL: 'https://jov.ie',
}));

vi.mock('@/lib/changelog-source', () => ({ getChangelogSnapshot }));

const RELEASE_FIXTURE = {
  version: '26.8.0',
  date: '2026-08-14',
  summary: 'A concise release summary.',
  sections: {
    featured: [],
    added: ['**Review qualified brand deals:** Open your `Inbox`.'],
    changed: [],
    fixed: ['The Mac app recovers from blank screens.'],
    removed: [],
  },
};

describe('changelog customer feeds (RSS + JSON share the web page object)', () => {
  beforeEach(() => {
    getChangelogSnapshot.mockResolvedValue({
      releases: [RELEASE_FIXTURE],
      sourceReleases: [RELEASE_FIXTURE],
      unpublishedReleases: [],
    });
  });

  it('publishes one JSON Feed item per customer outcome, not per release', async () => {
    const { GET } = await import(
      '../../../app/(marketing)/changelog/feed.json/route'
    );
    const response = await GET();
    const body = await response.json();

    expect(response.headers.get('content-type')).toContain(
      'application/feed+json'
    );
    expect(body).toMatchObject({
      version: 'https://jsonfeed.org/version/1.1',
      home_page_url: 'https://jov.ie/changelog',
      feed_url: 'https://jov.ie/changelog/feed.json',
    });
    expect(body.items).toHaveLength(2);

    const [reviewItem, macItem] = body.items;
    expect(reviewItem).toMatchObject({
      url: 'https://jov.ie/changelog/26.8.0',
      title: 'Review qualified brand deals',
      date_published: '2026-08-14T00:00:00Z',
      _jovie: { tertiary: 'August 14, 2026 · v26.8.0' },
    });
    expect(reviewItem.id).toContain('26.8.0');
    expect(reviewItem.content_text).toBe('Open your Inbox.');
    expect(reviewItem.content_text).not.toMatch(/\*\*|`/);

    expect(macItem).toMatchObject({
      title: 'The Mac app recovers from blank screens.',
      _jovie: { tertiary: 'August 14, 2026 · v26.8.0' },
    });
  });

  it('publishes one Atom entry per customer outcome using the outcome title and tertiary line', async () => {
    const { GET, atomEntryId } = await import(
      '../../../app/(marketing)/changelog/feed.xml/route'
    );
    const response = await GET();
    const body = await response.text();

    expect(response.headers.get('content-type')).toContain(
      'application/atom+xml'
    );
    expect(body).toContain('<title>Review qualified brand deals</title>');
    expect(body).toContain(
      '<title>The Mac app recovers from blank screens.</title>'
    );
    expect(body).toContain('<summary>August 14, 2026 · v26.8.0</summary>');
    expect(body).toContain(
      '<link href="https://jov.ie/changelog/26.8.0" rel="alternate"/>'
    );
    expect(atomEntryId('26.8.0')).toBe('https://jov.ie/changelog#v26.8.0');
  });
});
