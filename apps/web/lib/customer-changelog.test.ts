import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type ChangelogRelease,
  parseChangelogDocument,
} from './changelog-parser';
import {
  CustomerChangelogEntrySchema,
  customerChangelogEntryPath,
  extractCustomerChangelogTechnical,
  formatCustomerChangelogTertiary,
  groupCustomerChangelogByMonth,
  projectCustomerChangelog,
  projectCustomerChangelogArchive,
  resolveCustomerChangelogFragment,
  splitCustomerChangelogOutcome,
} from './customer-changelog';
import { resolveMonorepoPath } from './filesystem-paths';

function release(
  version: string,
  date: string,
  sections: Partial<ChangelogRelease['sections']>
): ChangelogRelease {
  const value: ChangelogRelease = {
    version,
    kind: 'release',
    date,
    summary: '',
    sections: {
      featured: [],
      added: [],
      changed: [],
      fixed: [],
      removed: [],
      ...sections,
    },
  };
  value.customerOutcomes = Object.values(value.sections)
    .flat()
    .map((summary, index) => ({
      storyId: `fixture-${version.replaceAll('.', '-')}-${index}`,
      entryId: `customer-update:fixture-${version.replaceAll('.', '-')}-${index}`,
      slug: `update-fixture-${version.replaceAll('.', '-')}-${index}`,
      aliases: [],
      summary,
      section:
        (Object.entries(value.sections).find(([, entries]) =>
          entries.includes(summary)
        )?.[0] as keyof ChangelogRelease['sections']) ?? 'added',
      availability: 'unverified',
      prerequisites: [],
    }));
  return value;
}

describe('customer changelog projection', () => {
  it('migrates the published artist-updates fragment without regenerating it from copy', () => {
    const markdown = readFileSync(resolveMonorepoPath('CHANGELOG.md'), 'utf8');
    const projection = projectCustomerChangelogArchive(
      parseChangelogDocument(markdown).sourceReleases
    );

    expect(
      resolveCustomerChangelogFragment(
        projection,
        'get-updates-from-an-artist-2026-10-02-1'
      )
    ).toMatchObject({
      status: 'published',
      entry: {
        id: 'customer-update:fan-updates',
        slug: 'update-fan-updates',
      },
    });
  });

  it('recovers a legacy story without an id from its recorded publication sources', () => {
    const markdown = readFileSync(resolveMonorepoPath('CHANGELOG.md'), 'utf8');
    const legacy = markdown.replace(
      /<!-- daily-changelog-receipt\/v1 (.+) -->/g,
      (_line, json: string) => {
        const receipt = JSON.parse(json);
        for (const story of receipt.stories) delete story.id;
        return `<!-- daily-changelog-receipt/v1 ${JSON.stringify(receipt)} -->`;
      }
    );
    const projection = projectCustomerChangelogArchive(
      parseChangelogDocument(legacy).sourceReleases
    );
    expect(
      resolveCustomerChangelogFragment(
        projection,
        'get-updates-from-an-artist-2026-10-02-1'
      )
    ).toMatchObject({
      status: 'published',
      entry: { id: 'customer-update:fan-updates', slug: 'update-fan-updates' },
    });
  });

  it('keeps a published URL through copy edits, insertion, section moves, reordering, and fresh parsing', () => {
    const sourceId = 'JovieInc/Jovie#1@' + 'b'.repeat(40);
    const target = {
      id: 'artist-updates',
      entryId: 'customer-update:artist-updates',
      slug: 'update-artist-updates',
      aliases: ['get-updates-from-an-artist-2026-10-02-1'],
      section: 'Changed' as const,
      summary: 'Get updates from an artist: Open Get Updates to sign up.',
      bullets: [],
      sourceIds: [sourceId],
      claimIds: [sourceId],
      lateArrival: false,
    };
    const preceding = {
      ...target,
      id: 'profile-link',
      entryId: 'customer-update:profile-link',
      slug: 'update-profile-link',
      aliases: [],
      section: 'Added' as const,
      summary: 'Choose your profile link: Start on the homepage.',
    };
    type ReceiptSection = 'Added' | 'Changed' | 'Fixed' | 'Removed';
    type ReceiptStory = Omit<typeof target, 'section'> & {
      readonly section: ReceiptSection;
    };

    function publish(
      stories: readonly ReceiptStory[],
      sections: Partial<Record<ReceiptSection, readonly string[]>>
    ) {
      const receipt = {
        schema: 'daily-changelog-receipt/v1',
        window: { key: '2026-10-02' },
        publicationHead: 'a'.repeat(40),
        sourceReceiptIds: [sourceId],
        deployments: [{ id: 'dpl_1', sha: 'a'.repeat(40) }],
        runtimeEvidence: [
          { passed: true, status: 200, sha256: 'c'.repeat(64) },
        ],
        stories,
      };
      const body = Object.entries({
        Added: [],
        Changed: [],
        Fixed: [],
        Removed: [],
        ...sections,
      })
        .filter(([, bullets]) => bullets.length > 0)
        .map(
          ([section, bullets]) =>
            `### ${section}\n\n${bullets.map(bullet => `- ${bullet}`).join('\n')}`
        )
        .join('\n\n');
      const markdown = `## [2026-10-02]\n\n${body}\n\n<!-- daily-changelog-receipt/v1 ${JSON.stringify(receipt)} -->`;
      return projectCustomerChangelogArchive(
        parseChangelogDocument(markdown).sourceReleases
      );
    }

    const initial = publish([target], { Changed: [target.summary] });
    const originalUrl = customerChangelogEntryPath(initial.entries[0]);
    expect(originalUrl).toBe('/changelog#update-artist-updates');

    const edited = {
      ...target,
      section: 'Fixed' as const,
      summary: 'Artist news is easier to follow: Subscribe from their profile.',
    };
    const variants = [
      publish([edited], { Fixed: [edited.summary] }),
      publish([preceding, edited], {
        Added: [preceding.summary],
        Fixed: [edited.summary],
      }),
      publish([edited, preceding], {
        Fixed: [edited.summary],
        Added: [preceding.summary],
      }),
    ];

    for (const projection of variants) {
      const entry = projection.entries.find(
        candidate => candidate.id === target.entryId
      );
      expect(entry).toBeDefined();
      expect(customerChangelogEntryPath(entry!)).toBe(originalUrl);
      expect(
        resolveCustomerChangelogFragment(
          projection,
          'get-updates-from-an-artist-2026-10-02-1'
        )
      ).toMatchObject({ status: 'published', entry: { id: target.entryId } });
    }
  });

  it('fails closed on identity collisions and tombstones unpublished entries', () => {
    const first = release('2026-07-01', '2026-07-01', {
      added: ['Same title: first outcome.'],
    });
    first.customerOutcomes = [
      {
        storyId: 'first',
        entryId: 'customer-update:first',
        slug: 'update-first',
        aliases: ['published-july-fragment'],
        summary: 'Same title: first outcome.',
        section: 'added',
        availability: 'ga',
        prerequisites: [],
      },
      {
        storyId: 'removed',
        entryId: 'customer-update:removed',
        slug: 'update-removed',
        aliases: ['published-june-fragment'],
        summary: 'Removed title: no longer public.',
        section: 'added',
        availability: 'ga',
        prerequisites: [],
      },
    ];
    const second = release('2026-08-01', '2026-08-01', {
      added: ['Same title: second outcome.'],
    });
    second.customerOutcomes = [
      {
        storyId: 'second',
        entryId: 'customer-update:second',
        slug: 'update-second',
        aliases: ['published-august-fragment'],
        summary: 'Same title: second outcome.',
        section: 'added',
        availability: 'ga',
        prerequisites: [],
      },
    ];

    const projection = projectCustomerChangelogArchive([second, first]);
    expect(projection.entries.map(entry => entry.slug)).toEqual([
      'update-second',
      'update-first',
    ]);
    expect(
      resolveCustomerChangelogFragment(projection, 'published-june-fragment')
    ).toMatchObject({
      status: 'unpublished',
      tombstone: { id: 'customer-update:removed' },
    });

    second.customerOutcomes[0] = {
      ...second.customerOutcomes[0],
      slug: 'update-first',
    };
    expect(() => projectCustomerChangelogArchive([second, first])).toThrow(
      /permalink collision/i
    );
  });

  it('keeps distinct same-day identities for duplicate, long, and non-ASCII titles', () => {
    const duplicate = 'Artist updates: Follow every new announcement.';
    const longNonAscii = `${'Worldwide artist announcements '.repeat(8)}in Montréal: Follow the full tournée without changing this permalink.`;
    const day = release('2026-09-12', '2026-09-12', {
      added: [duplicate, duplicate, longNonAscii],
    });
    day.customerOutcomes = [
      ['duplicate-one', duplicate],
      ['duplicate-two', duplicate],
      ['international-tour', longNonAscii],
    ].map(([identity, summary]) => ({
      storyId: identity,
      entryId: `customer-update:${identity}`,
      slug: `update-${identity}`,
      aliases: [],
      summary,
      section: 'added' as const,
      availability: 'ga' as const,
      prerequisites: [],
    }));

    const entries = projectCustomerChangelog([day]);

    expect(entries.map(entry => entry.id)).toEqual([
      'customer-update:duplicate-one',
      'customer-update:duplicate-two',
      'customer-update:international-tour',
    ]);
    expect(entries[0]?.title).toBe(entries[1]?.title);
    expect(entries[2]?.title).toContain('Montréal');
    expect(entries[2]?.title.length).toBeGreaterThan(140);
    expect(new Set(entries.map(entry => entry.slug))).toHaveProperty('size', 3);
  });

  it('projects public bullets into schema-valid outcome entries', () => {
    const entries = projectCustomerChangelog([
      release('26.8.1', '2026-08-16', {
        featured: [
          '**Review qualified brand deals in your Inbox:** See the buyer, budget, and source.',
        ],
        fixed: [
          'Signing in stays recoverable: Retry without losing your place.',
        ],
      }),
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      title: 'Review qualified brand deals in your Inbox',
      explanation: 'See the buyer, budget, and source.',
      category: 'new',
      prominence: 'featured',
      technicalVersion: '26.8.1',
      availability: 'unverified',
      media: null,
      capabilities: ['inbox'],
    });
    expect(entries[1]).toMatchObject({
      title: 'Signing in stays recoverable',
      technical: [],
      category: 'fixed',
      prominence: 'small',
    });
    expect(entries[1]?.title).not.toContain('JOV-5339');
    for (const entry of entries) {
      expect(CustomerChangelogEntrySchema.parse(entry)).toEqual(entry);
    }
  });

  it('strips parenthetical GitHub and Linear ids from title and explanation', () => {
    const noSpace = extractCustomerChangelogTechnical(
      'Library Approval Status (#10384) is now visible'
    );
    expect(noSpace.clean).toBe('Library Approval Status is now visible');
    expect(noSpace.clean).not.toContain('(#10384)');
    expect(noSpace.technical).toEqual(expect.arrayContaining(['#10384']));

    const spaced = extractCustomerChangelogTechnical(
      'Library Approval Status ( #10384) is now visible'
    );
    expect(spaced.clean).toBe('Library Approval Status is now visible');
    expect(spaced.technical).toEqual(expect.arrayContaining(['#10384']));

    const linear = extractCustomerChangelogTechnical(
      'Jovie Local no longer says you are offline while compiling (JOV-5339)'
    );
    expect(linear.clean).toBe(
      'Jovie Local no longer says you are offline while compiling'
    );
    expect(linear.technical).toEqual(expect.arrayContaining(['JOV-5339']));

    const bare = extractCustomerChangelogTechnical(
      'See #10384 for the implementation notes'
    );
    expect(bare.clean).toContain('#10384');
    expect(bare.technical).toEqual(expect.arrayContaining(['#10384']));

    const entries = projectCustomerChangelog([
      release('26.8.1', '2026-08-16', {
        added: [
          'Library Approval Status (#10384): reviewers see the current state.',
          'Mac profile links ( #15488): open the right artist.',
        ],
        fixed: [
          'Jovie Local no longer says you are offline while compiling (JOV-5339): first compile waits.',
        ],
      }),
    ]);

    expect(entries[0]).toMatchObject({
      title: 'Library Approval Status',
      explanation: 'reviewers see the current state.',
    });
    expect(entries[0]?.title).not.toContain('#10384');
    expect(entries[0]?.explanation).not.toContain('#10384');
    expect(entries[0]?.technical).toEqual(expect.arrayContaining(['#10384']));

    expect(entries[1]?.title).toBe('Mac profile links');
    expect(entries[1]?.title).not.toContain('#15488');
    expect(entries[1]?.technical).toEqual(expect.arrayContaining(['#15488']));

    expect(entries).toHaveLength(2); // Local development is not a customer outcome.
  });

  it('keeps Redis, admission, and synthetic identities on Level 3', () => {
    const extracted = extractCustomerChangelogTechnical(
      'Sign-out stays available when Redis is missing and admission rejects synthetic identities JOV-5260'
    );

    expect(extracted.technical).toEqual(
      expect.arrayContaining([
        'Redis',
        'admission',
        'synthetic identities',
        'JOV-5260',
      ])
    );
  });

  it('splits outcome titles from explanations', () => {
    expect(
      splitCustomerChangelogOutcome(
        'Library is one catalog with Ideas, In Progress, and Out: documents share filters.'
      )
    ).toEqual({
      title: 'Library is one catalog with Ideas, In Progress, and Out',
      explanation: 'documents share filters.',
    });
  });

  it('carries the publication action and supporting copy, defaulting safely', () => {
    const bullet = 'Get updates from an artist: sign up on eligible profiles.';
    const source = release('2026-10-02', '2026-10-02', {
      changed: [bullet],
    });
    source.customerOutcomes = [
      {
        ...source.customerOutcomes![0],
        availability: 'limited',
        prerequisites: ['Claimed artist profiles with updates enabled'],
        supporting: [
          'Fans opt in per artist; nothing is sent without a signup.',
        ],
        action: {
          label: 'See it on a demo profile',
          href: '/demo/showcase/tim-white-profile?mode=subscribe',
        },
      },
    ];

    const [entry] = projectCustomerChangelog([source]);
    expect(entry).toMatchObject({
      title: 'Get updates from an artist',
      availability: 'limited',
      prerequisites: ['Claimed artist profiles with updates enabled'],
      supporting: ['Fans opt in per artist; nothing is sent without a signup.'],
      action: {
        label: 'See it on a demo profile',
        href: '/demo/showcase/tim-white-profile?mode=subscribe',
      },
    });
    expect(CustomerChangelogEntrySchema.parse(entry)).toEqual(entry);

    const [plain] = projectCustomerChangelog([
      release('2026-10-02', '2026-10-02', { added: [bullet] }),
    ]);
    expect(plain.action).toBeNull();
    expect(plain.supporting).toEqual([]);
  });

  it('groups outcomes by month newest first and formats tertiary version', () => {
    const months = groupCustomerChangelogByMonth(
      projectCustomerChangelog([
        release('26.8.1', '2026-08-16', {
          added: ['August outcome: visible now.'],
        }),
        release('26.7.0', '2026-07-21', {
          changed: ['July outcome: still listed.'],
        }),
      ])
    );

    expect(months.map(group => group.label)).toEqual([
      'August 2026',
      'July 2026',
    ]);
    expect(formatCustomerChangelogTertiary('2026-08-16', '26.8.1')).toBe(
      'August 16, 2026 · v26.8.1'
    );
  });
});
