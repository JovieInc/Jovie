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
  return {
    version,
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
}

describe('customer changelog projection', () => {
  it('projects public bullets into schema-valid outcome entries', () => {
    const entries = projectCustomerChangelog([
      release('26.8.1', '2026-08-16', {
        featured: [
          '**Review qualified brand deals in your Inbox:** See the buyer, budget, and source.',
        ],
        fixed: [
          'Jovie Local no longer says you are offline while compiling (JOV-5339): first compile waits.',
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
      availability: 'ga',
      media: null,
      capabilities: ['inbox'],
    });
    expect(entries[1]).toMatchObject({
      title: 'Jovie Local no longer says you are offline while compiling',
      technical: ['JOV-5339'],
      category: 'fixed',
      prominence: 'small',
    });
    expect(entries[1]?.title).not.toContain('JOV-5339');
    for (const entry of entries) {
      expect(CustomerChangelogEntrySchema.parse(entry)).toEqual(entry);
    }
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
