import { describe, expect, it } from 'vitest';
import type { ChangelogRelease } from './changelog-parser';
import { resolveCustomerChangelogHero } from './customer-changelog';
import {
  parseWhatsNewFeed,
  projectWhatsNew,
  resolveUnseenWhatsNew,
  type WhatsNewEntry,
  type WhatsNewFeed,
} from './whats-new';

const BASE_URL = 'https://jov.ie';

function release(
  version: string,
  overrides: Partial<ChangelogRelease> = {}
): ChangelogRelease {
  const value: ChangelogRelease = {
    version,
    kind: 'release',
    date: '2026-09-01',
    summary: '',
    sections: {
      featured: [],
      added: [`**Feature ${version}:** It does the thing.`],
      changed: [],
      fixed: [],
      removed: [],
    },
    ...overrides,
  };
  value.customerOutcomes = Object.fromEntries(
    Object.values(value.sections)
      .flat()
      .map(text => [text, { availability: 'unverified', prerequisites: [] }])
  );
  return value;
}

function entry(id: string): WhatsNewEntry {
  return {
    id,
    title: `Title ${id}`,
    date: '2026-09-01',
    summary: 'Summary',
    url: `${BASE_URL}/changelog/${id}`,
    highlights: [],
    dogfood: [],
    hero: null,
  };
}

function feed(ids: readonly string[]): WhatsNewFeed {
  return {
    version: 1,
    changelogUrl: `${BASE_URL}/changelog`,
    entries: ids.map(entry),
  };
}

describe('projectWhatsNew', () => {
  it('projects one entry per release with the lead outcome as title', () => {
    const result = projectWhatsNew(
      [
        release('3.0.0', {
          summary: 'A bigger release.',
          sections: {
            featured: ['**Chat is home:** Ask first.'],
            added: ['**Library filters:** One catalog.'],
            changed: ['Buttons use a lighter label'],
            fixed: ['Sign-in recovers'],
            removed: ['Old tab bar'],
          },
          dogfood: ['Open **Chat** and ask about a `release`'],
        }),
      ],
      BASE_URL
    );

    expect(result).toEqual({
      version: 1,
      changelogUrl: 'https://jov.ie/changelog',
      entries: [
        {
          id: '3.0.0',
          hero: resolveCustomerChangelogHero('3.0.0'),
          title: 'Chat is home',
          date: '2026-09-01',
          summary: 'A bigger release.',
          url: 'https://jov.ie/changelog/3.0.0',
          highlights: [
            'Library filters',
            'Buttons use a lighter label',
            'Sign-in recovers',
          ],
          dogfood: ['Open Chat and ask about a release'],
        },
      ],
    });
  });

  it('keeps the daily title and explanation on the same outcome with one dismissal identity', () => {
    const result = projectWhatsNew(
      [
        release('2026-10-02', {
          kind: 'daily',
          date: '2026-10-02',
          summary: 'Get updates from an artist: Open the signup form.',
          sections: {
            featured: [],
            added: ['**Choose your Jovie link:** Start on the homepage.'],
            changed: ['**Get artist updates:** Open the signup form.'],
            fixed: [],
            removed: [],
          },
        }),
      ],
      BASE_URL
    );
    expect(result.entries[0]).toMatchObject({
      id: '2026-10-02',
      title: 'Choose your Jovie link',
      summary: 'Start on the homepage.',
      highlights: ['Get artist updates'],
    });
    expect(resolveUnseenWhatsNew(result, '2026-10-02')).toBeNull();
  });
  it('falls back to the lead outcome summary and an empty dogfood list', () => {
    const [only] = projectWhatsNew([release('2.0.0')], BASE_URL).entries;
    expect(only?.summary).toBe('It does the thing.');
    expect(only?.dogfood).toEqual([]);
    expect(only?.highlights).toEqual([]);
  });

  it('caps entries and skips releases without customer outcomes', () => {
    const empty = release('9.9.9', {
      sections: {
        featured: [],
        added: [],
        changed: [],
        fixed: [],
        removed: [],
      },
    });
    const result = projectWhatsNew(
      [empty, release('3'), release('2'), release('1')],
      BASE_URL,
      2
    );
    expect(result.entries.map(e => e.id)).toEqual(['3', '2']);
  });
});

describe('resolveUnseenWhatsNew', () => {
  it('shows nothing when the feed is empty', () => {
    expect(resolveUnseenWhatsNew(feed([]), null)).toBeNull();
  });

  it('shows nothing when the newest entry was already seen', () => {
    expect(resolveUnseenWhatsNew(feed(['3', '2']), '3')).toBeNull();
  });

  it('shows the newest entry and links its post on first launch', () => {
    expect(resolveUnseenWhatsNew(feed(['3', '2']), null)).toEqual({
      entry: entry('3'),
      unseenCount: 1,
      href: 'https://jov.ie/changelog/3',
    });
  });

  it('shows the newest of several unseen and links the changelog index', () => {
    expect(resolveUnseenWhatsNew(feed(['3', '2', '1']), '1')).toEqual({
      entry: entry('3'),
      unseenCount: 2,
      href: 'https://jov.ie/changelog',
    });
  });

  it('treats an aged-out last-seen id as one new entry, not a backlog', () => {
    expect(resolveUnseenWhatsNew(feed(['3', '2']), '0.1')).toMatchObject({
      entry: entry('3'),
      unseenCount: 1,
    });
  });
});

describe('parseWhatsNewFeed', () => {
  it('accepts the published contract', () => {
    expect(parseWhatsNewFeed(feed(['3']))).toEqual(feed(['3']));
  });

  it('rejects other contract versions and malformed payloads', () => {
    expect(parseWhatsNewFeed({ ...feed(['3']), version: 2 })).toBeNull();
    expect(parseWhatsNewFeed(null)).toBeNull();
    expect(parseWhatsNewFeed('nope')).toBeNull();
    expect(parseWhatsNewFeed({ version: 1, changelogUrl: 'x' })).toBeNull();
  });

  it('drops malformed entries instead of failing the whole feed', () => {
    const parsed = parseWhatsNewFeed({
      ...feed(['3']),
      entries: [
        entry('3'),
        { id: '', title: 'x' },
        { ...entry('2'), dogfood: [1] },
      ],
    });
    expect(parsed?.entries.map(e => e.id)).toEqual(['3']);
  });
});

describe('published hero inheritance', () => {
  it('round trips the post authority through the real feed parser', () => {
    const projected = projectWhatsNew([release('2026-10-02')], BASE_URL);
    const parsed = parseWhatsNewFeed(JSON.parse(JSON.stringify(projected)));
    expect(parsed?.entries[0]?.hero).toEqual(
      resolveCustomerChangelogHero('2026-10-02')
    );
    expect(parsed?.entries[0]?.url).toBe('https://jov.ie/changelog/2026-10-02');
  });
  it.each([
    undefined,
    null,
    {},
    { kind: 'video', src: 'javascript:alert(1)' },
    { ...resolveCustomerChangelogHero('old'), postId: 'old' },
    { ...resolveCustomerChangelogHero('3'), src: '/invented.webp' },
  ])('retains text and link for missing, malformed or stale hero %j', hero => {
    const original = entry('3');
    const parsed = parseWhatsNewFeed({
      ...feed(['3']),
      entries: [{ ...original, hero }],
    });
    expect(parsed?.entries[0]).toEqual({ ...original, hero: null });
  });
  it('does not associate media with a different post destination', () => {
    const parsed = parseWhatsNewFeed({
      ...feed(['3']),
      entries: [
        {
          ...entry('3'),
          url: BASE_URL + '/changelog/old',
          hero: resolveCustomerChangelogHero('3'),
        },
      ],
    });
    expect(parsed?.entries[0]?.hero).toBeNull();
  });
});
