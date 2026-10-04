import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseChangelog } from './changelog-parser';
import { projectCustomerChangelog } from './customer-changelog';
import { projectWhatsNew } from './whats-new';

const copy = 'Hear artist news: Open Get Updates on an eligible profile.';
const sha = 'a'.repeat(40);
function publication(availability?: unknown, text = copy) {
  const source = `JovieInc/Jovie#1@${sha}`;
  return {
    schema: 'daily-changelog-receipt/v1',
    window: { key: '2026-10-02' },
    publicationHead: sha,
    sourceReceiptIds: [source],
    deployments: [{ sha, id: 'dpl_test' }],
    runtimeEvidence: [{ passed: true, status: 200, sha256: 'b'.repeat(64) }],
    stories: [
      {
        id: 'artist-news',
        entryId: 'customer-update:artist-news',
        slug: 'update-artist-news',
        aliases: [],
        summary: text,
        section: 'Added',
        sourceIds: [source],
        availability,
      },
    ],
  };
}
function markdown(receipt: unknown, text = copy) {
  return `## [2026-10-02]\n### Added\n- ${text}\n<!-- daily-changelog-receipt/v1 ${JSON.stringify(receipt)} -->\n## [26.6.50] - 2026-06-15\n### Fixed\n- PersistentAudioBar tests: update assertions.\n- Codex issue shipper hardening: safer dispatch.\n`;
}

describe('customer publication integrity', () => {
  it('keeps engineering history and dates without promoting unreviewed bullets into cards or feeds', () => {
    const releases = parseChangelog(markdown(publication()));
    expect(releases[1].sections.fixed).toHaveLength(2);
    expect(releases[1].date).toBe('2026-06-15');
    const outcomes = projectCustomerChangelog(releases);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      title: 'Hear artist news',
      availability: 'unverified',
      prerequisites: [],
    });
    expect(
      projectWhatsNew(releases, 'https://jov.ie').entries.map(entry => entry.id)
    ).toEqual(['2026-10-02']);
  });

  it.each(['ga', 'preview', 'limited'] as const)(
    'preserves explicit %s and its prerequisites through the actual parser',
    status => {
      const outcomes = projectCustomerChangelog(
        parseChangelog(
          markdown(
            publication({
              status,
              prerequisites: ['Eligible profiles with updates enabled'],
            })
          )
        )
      );
      expect(outcomes[0]).toMatchObject({
        availability: status,
        prerequisites: ['Eligible profiles with updates enabled'],
      });
    }
  );

  it.each([
    undefined,
    { status: 'limited', prerequisites: [] },
    { status: 'ga', prerequisites: [false] },
  ])('never turns missing or malformed availability into GA', availability => {
    const outcomes = projectCustomerChangelog(
      parseChangelog(markdown(publication(availability)))
    );
    expect(outcomes[0].availability).toBe('unverified');
  });

  it.each([
    'invalid receipt',
    { ...publication(), window: { key: '2026-10-01' } },
    { ...publication(), deployments: [] },
    { ...publication(), runtimeEvidence: [] },
    { ...publication(), sourceReceiptIds: [] },
  ])('does not approve copy from an invalid or unbound receipt', receipt => {
    expect(projectCustomerChangelog(parseChangelog(markdown(receipt)))).toEqual(
      []
    );
  });

  it.each([
    'PersistentAudioBar tests: update assertions.',
    'Codex issue shipper hardening: safer dispatch.',
    'Fix apps/web/lib/source.ts: improve loading.',
    'P1 JOV-7491: update issue priority.',
  ])(
    'rejects maintenance copy even when it is mistakenly present in a receipt',
    text => {
      expect(
        projectCustomerChangelog(
          parseChangelog(markdown(publication(undefined, text), text))
        )
      ).toEqual([]);
    }
  );

  it('requires the exact approved copy and preserves replay and historical technical records', () => {
    const source = markdown(publication());
    const releases = parseChangelog(source);
    expect(projectCustomerChangelog(parseChangelog(source))).toEqual(
      projectCustomerChangelog(releases)
    );
    expect(
      projectCustomerChangelog(
        parseChangelog(
          source.replace(
            copy,
            'An unsupported capability: available to everyone.'
          )
        )
      )
    ).toEqual([]);
  });

  it('carries receipt-approved supporting copy and a safe next-step action', () => {
    const base = publication();
    const receipt = {
      ...base,
      stories: [
        {
          ...base.stories[0],
          bullets: [
            'Fans opt in per artist; nothing is sent without a signup.',
          ],
          action: {
            label: 'See it on a demo profile',
            href: '/demo/showcase/tim-white-profile?mode=subscribe',
          },
        },
      ],
    };
    const outcomes = projectCustomerChangelog(
      parseChangelog(markdown(receipt))
    );
    expect(outcomes[0].supporting).toEqual([
      'Fans opt in per artist; nothing is sent without a signup.',
    ]);
    expect(outcomes[0].action).toEqual({
      label: 'See it on a demo profile',
      href: '/demo/showcase/tim-white-profile?mode=subscribe',
    });
  });

  it.each([
    'javascript:alert(1)',
    'https://example.com/x',
    'https://jov.ie.evil.example/x',
    '//evil.example/x',
    'http://jov.ie/x',
    '/ /spaces',
  ])('drops an unsafe action destination instead of rendering it: %s', href => {
    const base = publication();
    const receipt = {
      ...base,
      stories: [{ ...base.stories[0], action: { label: 'Next', href } }],
    };
    const outcomes = projectCustomerChangelog(
      parseChangelog(markdown(receipt))
    );
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].action).toBeNull();
  });

  it('keeps test and agent maintenance out of the real customer archive while preserving its technical history', () => {
    const releases = parseChangelog(readFileSync('../../CHANGELOG.md', 'utf8'));
    const outcomes = projectCustomerChangelog(releases);
    expect(outcomes.length).toBeGreaterThan(0);
    expect(
      outcomes.map(entry => `${entry.title} ${entry.explanation}`).join('\n')
    ).not.toMatch(/PersistentAudioBar|Codex|shipper|unit tests?|JOV-\d+/);
    expect(releases.some(release => release.version === '26.6.50')).toBe(true);
  });
});
