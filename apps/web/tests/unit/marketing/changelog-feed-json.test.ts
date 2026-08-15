import { beforeEach, describe, expect, it, vi } from 'vitest';

const getChangelogReleases = vi.fn();

vi.mock('@/constants/app', () => ({
  APP_NAME: 'Jovie',
  BASE_URL: 'https://jov.ie',
}));

vi.mock('@/lib/changelog-source', () => ({ getChangelogReleases }));

describe('changelog JSON Feed', () => {
  beforeEach(() => {
    getChangelogReleases.mockResolvedValue([
      {
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
      },
    ]);
  });

  it('publishes stable release URLs using JSON Feed 1.1', async () => {
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
      items: [
        {
          id: 'https://jov.ie/changelog/26.8.0',
          url: 'https://jov.ie/changelog/26.8.0',
          title: 'Jovie v26.8.0',
          date_published: '2026-08-14T00:00:00Z',
        },
      ],
    });
    expect(body.items[0].content_text).toContain(
      'Review qualified brand deals: Open your Inbox.'
    );
    expect(body.items[0].content_text).not.toMatch(/\*\*|`/);
  });

  it('preserves legacy Atom IDs while permanent pages become alternate links', async () => {
    const { atomEntryId } = await import(
      '../../../app/(marketing)/changelog/feed.xml/route'
    );
    expect(atomEntryId('26.8.0')).toBe('https://jov.ie/changelog#v26.8.0');
  });
});
