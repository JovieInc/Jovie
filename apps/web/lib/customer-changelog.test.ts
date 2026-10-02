import { describe, expect, it } from 'vitest';
import type { ChangelogRelease } from './changelog-parser';
import {
  CustomerChangelogEntrySchema,
  extractCustomerChangelogTechnical,
  formatCustomerChangelogTertiary,
  groupCustomerChangelogByMonth,
  projectCustomerChangelog,
  splitCustomerChangelogOutcome,
} from './customer-changelog';

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
  value.customerOutcomes = Object.fromEntries(
    Object.values(value.sections)
      .flat()
      .map(text => [text, { availability: 'unverified', prerequisites: [] }])
  );
  return value;
}

describe('customer changelog projection', () => {
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
    source.customerOutcomes = {
      [bullet]: {
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
    };

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
