import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type ChangelogRelease,
  parseChangelogDocument,
} from './changelog-parser';
import {
  applyCustomerChangelogEditorialToRelease,
  groupCustomerChangelogByDay,
  projectCustomerChangelogArchive,
  resolveCustomerChangelogFragment,
  splitCustomerChangelogOutcome,
} from './customer-changelog';
import {
  CUSTOMER_CHANGELOG_HEADLINE_MAX,
  type CustomerChangelogEditorial,
  CustomerChangelogEditorialSchema,
  customerChangelogHeadlineProblems,
  isSentenceCaseHeadline,
  readCustomerChangelogEditorial,
} from './customer-changelog-editorial';
import { resolveMonorepoPath } from './filesystem-paths';
import { projectWhatsNew } from './whats-new';

const FOOTER = 'Artist profiles: the footer credit no longer overlaps events.';
const INVITE = 'You can request an invitation from the homepage.';
const SHARE = 'Release links unfurl with a card: your artwork and title.';

function dailyRelease(): ChangelogRelease {
  const outcome = (
    key: string,
    section: 'added' | 'fixed' | 'changed',
    summary: string
  ) => ({
    storyId: key,
    entryId: `customer-update:${key}`,
    slug: `update-${key}`,
    aliases: [`legacy-${key}`],
    summary,
    section,
    availability: 'ga' as const,
    prerequisites: [],
  });
  return {
    version: '2026-11-10',
    kind: 'daily',
    date: '2026-11-10',
    summary: INVITE,
    sections: {
      featured: [],
      added: [INVITE],
      changed: [SHARE],
      fixed: [FOOTER],
      removed: [],
    },
    customerOutcomes: [
      outcome('invite', 'added', INVITE),
      outcome('share', 'changed', SHARE),
      outcome('footer', 'fixed', FOOTER),
    ],
  };
}

const EDITORIAL: CustomerChangelogEditorial = {
  'customer-update:invite': { hide: true, reason: 'Sign-up reopened.' },
  'customer-update:footer': {
    headline: 'Profile footer no longer overlaps events',
  },
  'customer-update:share': {
    headline: 'Release links unfurl with a branded card',
    lead: 'Shared release links show your artwork and title.',
    media: {
      kind: 'image',
      src: '/images/changelog/share-card.png',
      alt: 'A release link shown as a card',
    },
  },
};

describe('headline rule', () => {
  it('accepts short sentence-case outcomes, proper nouns and acronyms', () => {
    for (const headline of [
      'QR codes, drawn on your device',
      'The paid plan is now Artist Presence',
      'AI agents can discover Jovie’s public tools',
      'Public sign-up is open',
    ]) {
      expect(customerChangelogHeadlineProblems(headline)).toEqual([]);
    }
  });

  it('names every problem with a headline', () => {
    expect(customerChangelogHeadlineProblems('')).toEqual(['is empty']);
    expect(customerChangelogHeadlineProblems('Sign-up is open.')).toEqual([
      'ends with punctuation',
    ]);
    expect(customerChangelogHeadlineProblems('sign-up is open')).toEqual([
      'is not sentence case',
    ]);
    expect(
      customerChangelogHeadlineProblems('Release Links Unfurl With A Card')
    ).toEqual(['is not sentence case']);
    expect(
      customerChangelogHeadlineProblems(
        'x'.repeat(CUSTOMER_CHANGELOG_HEADLINE_MAX + 1)
      )
    ).toContain(
      `is ${CUSTOMER_CHANGELOG_HEADLINE_MAX + 1} characters (max ${CUSTOMER_CHANGELOG_HEADLINE_MAX})`
    );
    expect(customerChangelogHeadlineProblems(' Padded')).toContain(
      'has surrounding whitespace'
    );
    expect(customerChangelogHeadlineProblems('Bold <b>move</b>')).toContain(
      'contains markup or a newline'
    );
    expect(isSentenceCaseHeadline('Mac App')).toBe(true);
  });
});

describe('editorial overlay schema', () => {
  const parse = (entry: unknown) =>
    CustomerChangelogEditorialSchema.safeParse({
      schema: 'customer-changelog-editorial/v1',
      entries: { 'customer-update:x': entry },
    }).success;

  it('requires a headline or a withdrawal with its reason', () => {
    expect(parse({ headline: 'Public sign-up is open' })).toBe(true);
    expect(parse({ hide: true, reason: 'No longer true.' })).toBe(true);
    expect(parse({})).toBe(false);
    expect(parse({ hide: true })).toBe(false);
    expect(parse({ hide: true, reason: 'x', headline: 'Still here' })).toBe(
      false
    );
    expect(parse({ headline: 'Fine', reason: 'not hidden' })).toBe(false);
    expect(parse({ lead: 'A lead with no headline.' })).toBe(false);
  });

  it('rejects rule-breaking headlines, stray keys and off-site media', () => {
    expect(parse({ headline: 'Ends with a period.' })).toBe(false);
    expect(parse({ headline: 'Fine', lead: 'lowercase lead.' })).toBe(false);
    expect(parse({ headline: 'Fine', extra: true })).toBe(false);
    expect(
      parse({
        headline: 'Fine',
        media: { kind: 'image', src: 'https://x.test/a.png', alt: 'A' },
      })
    ).toBe(false);
    expect(
      parse({
        headline: 'Fine',
        media: { kind: 'image', src: '/images/changelog/a.png', alt: 'A' },
      })
    ).toBe(true);
  });
});

describe('split fallback', () => {
  it('capitalises the explanation', () => {
    expect(
      splitCustomerChangelogOutcome(
        'See your music before you pay: once you pick your artist, it shows.'
      )
    ).toEqual({
      title: 'See your music before you pay',
      explanation: 'Once you pick your artist, it shows.',
    });
  });

  it('never uses a bare area label as the headline', () => {
    expect(splitCustomerChangelogOutcome(FOOTER)).toEqual({
      title: FOOTER,
      explanation: '',
    });
    // A short outcome with its own sentence after the colon stays a headline.
    expect(
      splitCustomerChangelogOutcome('Help is easier to find: Open Help.')
    ).toEqual({ title: 'Help is easier to find', explanation: 'Open Help.' });
    expect(
      splitCustomerChangelogOutcome('Google connection recovery: Keep going.')
    ).toEqual({
      title: 'Google connection recovery',
      explanation: 'Keep going.',
    });
  });
});

describe('overlay in the projection', () => {
  it('applies headline, lead and media, and keeps identity and permalinks', () => {
    const { entries } = projectCustomerChangelogArchive([dailyRelease()], {
      editorial: EDITORIAL,
    });

    expect(entries.map(entry => entry.id)).toEqual([
      'customer-update:share',
      'customer-update:footer',
    ]);
    expect(entries[0]).toMatchObject({
      title: 'Release links unfurl with a branded card',
      explanation: 'Shared release links show your artwork and title.',
      summary: 'Shared release links show your artwork and title.',
      slug: 'update-share',
      aliases: ['legacy-share'],
      media: { src: '/images/changelog/share-card.png' },
    });
    // The approved explanation becomes the lead, capitalised.
    expect(entries[1]).toMatchObject({
      title: 'Profile footer no longer overlaps events',
      explanation: 'The footer credit no longer overlaps events.',
      media: null,
    });
  });

  it('uses the whole approved sentence as the lead when it has no split', () => {
    const { entries } = projectCustomerChangelogArchive([dailyRelease()], {
      editorial: { 'customer-update:invite': { headline: 'Request access' } },
    });
    expect(entries.find(entry => entry.id.endsWith(':invite'))).toMatchObject({
      title: 'Request access',
      explanation: INVITE,
    });
  });

  it('withdraws a hidden entry to a tombstone, never to another entry', () => {
    const projection = projectCustomerChangelogArchive([dailyRelease()], {
      editorial: EDITORIAL,
    });

    for (const fragment of ['update-invite', 'legacy-invite']) {
      expect(
        resolveCustomerChangelogFragment(projection, fragment)
      ).toMatchObject({
        status: 'unpublished',
        tombstone: { id: 'customer-update:invite' },
      });
    }
    expect(
      resolveCustomerChangelogFragment(projection, 'update-footer')
    ).toMatchObject({ status: 'published' });
  });

  it('leaves entries without an overlay on the split fallback', () => {
    const { entries } = projectCustomerChangelogArchive([dailyRelease()], {
      editorial: {},
    });
    expect(entries.find(entry => entry.id.endsWith(':footer'))).toMatchObject({
      title: FOOTER,
      explanation: '',
    });
    expect(entries).toHaveLength(3);
  });
});

describe('overlay on a date page', () => {
  it('drops withdrawn bullets and leads the rest with their headline', () => {
    const release = applyCustomerChangelogEditorialToRelease(dailyRelease(), {
      editorial: EDITORIAL,
    });

    expect(release.summary).toBe('');
    expect(release.sections.added).toEqual([]);
    expect(release.sections.fixed).toEqual([
      '**Profile footer no longer overlaps events** The footer credit no longer overlaps events.',
    ]);
    expect(release.sections.changed).toEqual([
      '**Release links unfurl with a branded card** Shared release links show your artwork and title.',
    ]);
    // Publications follow their rewritten bullet so anchors stay attached.
    expect(
      release.customerOutcomes?.map(outcome => [
        outcome.entryId,
        outcome.summary,
      ])
    ).toEqual([
      ['customer-update:share', release.sections.changed[0]],
      ['customer-update:footer', release.sections.fixed[0]],
    ]);
  });

  it('returns the same release when no outcome is edited', () => {
    const release = dailyRelease();
    expect(
      applyCustomerChangelogEditorialToRelease(release, { editorial: {} })
    ).toBe(release);
  });
});

describe('day grouping', () => {
  const { entries } = projectCustomerChangelogArchive([dailyRelease()], {
    editorial: {},
  });

  it('leads a day with its posts and folds fixes into polish', () => {
    expect(
      groupCustomerChangelogByDay(entries).map(day => ({
        date: day.date,
        posts: day.posts.map(entry => entry.category),
        polish: day.polish.map(entry => entry.category),
      }))
    ).toEqual([
      { date: '2026-11-10', posts: ['new', 'improved'], polish: ['fixed'] },
    ]);
  });

  it('promotes the first fix when a day holds only fixes', () => {
    const fixes = entries.map(entry => ({
      ...entry,
      category: 'fixed' as const,
    }));
    const [day] = groupCustomerChangelogByDay(fixes);
    expect(day?.posts).toEqual([fixes[0]]);
    expect(day?.polish).toEqual(fixes.slice(1));
  });
});

describe('committed overlay against the published changelog', () => {
  const overlay = readCustomerChangelogEditorial();
  const releases = parseChangelogDocument(
    readFileSync(resolveMonorepoPath('CHANGELOG.md'), 'utf8')
  ).sourceReleases;
  const unedited = projectCustomerChangelogArchive(releases, { editorial: {} });
  const published = projectCustomerChangelogArchive(releases);

  it('keys every overlay entry to a real published entry id', () => {
    const known = new Set(unedited.entries.map(entry => entry.id));
    expect(Object.keys(overlay).filter(id => !known.has(id))).toEqual([]);
  });

  it('gives every published entry a compliant headline', () => {
    expect(
      published.entries
        .map(entry => ({
          id: entry.id,
          problems: customerChangelogHeadlineProblems(entry.title),
        }))
        .filter(result => result.problems.length > 0)
    ).toEqual([]);
  });

  it('gives What’s New and the date pages the same headlines', () => {
    const titles = new Set(published.entries.map(entry => entry.title));
    for (const entry of projectWhatsNew(releases, 'https://jov.ie').entries) {
      expect(titles).toContain(entry.title);
      expect(customerChangelogHeadlineProblems(entry.title)).toEqual([]);
    }
    const latest = releases.find(release => release.version === '2026-11-12');
    expect(
      latest && applyCustomerChangelogEditorialToRelease(latest).sections.fixed
    ).toEqual([
      expect.stringMatching(/^\*\*QR codes, drawn on your device\*\* /),
    ]);
  });

  it('turns every withdrawn entry into a tombstone', () => {
    const hidden = Object.entries(overlay)
      .filter(([, edit]) => edit.hide)
      .map(([id]) => id)
      .sort();
    expect(published.tombstones.map(tombstone => tombstone.id).sort()).toEqual(
      hidden
    );
    expect(hidden).toContain('customer-update:homepage-music-forward-invite');
  });
});
