import { describe, expect, it } from 'vitest';
import {
  buildEngineeringAtomFeed,
  buildEngineeringJsonFeed,
  evaluateEngineeringSource,
  hashEngineeringCopy,
  isPublishReady,
  loadEngineeringStoriesFromDisk,
  selectPreviewStories,
  selectPublishedStories,
} from '@/lib/engineering-publication';

function source(
  overrides: Record<string, unknown> = {},
  body = 'Shipped copy.'
) {
  return `---\n${JSON.stringify({
    id: 'verified-changelog',
    title: 'Public shipping record',
    date: '2026-08-30',
    summary: 'Artists can read the public What is New page.',
    status: 'draft',
    availability: 'public',
    capabilities: [
      { id: 'changelog', availability: 'public', receiptId: 'changelog-live' },
    ],
    evidence: [
      {
        id: 'changelog-live',
        kind: 'changelog',
        href: 'https://jov.ie/changelog',
        claims: [],
      },
    ],
    founderApproval: null,
    ...overrides,
  })}\n---\n\n${body}\n`;
}

function approved(body = 'Shipped copy.') {
  return source(
    {
      status: 'published',
      founderApproval: {
        approvedBy: 'Tim White',
        approvedAt: '2026-08-30',
        copyHash: hashEngineeringCopy({
          title: 'Public shipping record',
          summary: 'Artists can read the public What is New page.',
          body: `\n${body}\n`,
        }),
      },
    },
    body
  );
}

const rulesOf = (raw: string) =>
  evaluateEngineeringSource(raw, 'verified-changelog').issues.map(
    item => item.rule
  );

describe('engineering publication evaluator', () => {
  it.each([
    ['missing-approval', source()],
    ['unverifiable-metric', approved('Traffic grew 40% after launch.')],
    [
      'unpublished-capability',
      source({
        capabilities: [
          {
            id: 'agent-os',
            availability: 'unreleased',
            receiptId: 'changelog-live',
          },
        ],
      }),
    ],
    [
      'internal-detail',
      approved('The Clerk SDK and staging.jov.ie topology stay private.'),
    ],
    [
      'copy-hash-mismatch',
      source({
        status: 'published',
        founderApproval: {
          approvedBy: 'Tim White',
          approvedAt: '2026-08-30',
          copyHash: 'a'.repeat(64),
        },
      }),
    ],
  ] as const)('fails closed on %s', (rule, raw) => {
    expect(rulesOf(raw)).toContain(rule);
  });

  it('publishes only founder-approved public stories with complete receipts', () => {
    const ready = evaluateEngineeringSource(approved(), 'verified-changelog');
    const draft = evaluateEngineeringSource(source(), 'verified-changelog');
    expect(isPublishReady(ready)).toBe(true);
    expect(selectPublishedStories([ready, draft])).toEqual([ready]);
    expect(selectPreviewStories([ready, draft]).map(item => item.slug)).toEqual(
      ['verified-changelog', 'verified-changelog']
    );
    expect(
      buildEngineeringJsonFeed({
        appName: 'Jovie',
        baseUrl: 'https://jov.ie',
        stories: [ready],
      }).items
    ).toHaveLength(1);
  });

  it('keeps draft stories out of feeds and the published selector', async () => {
    const published = selectPublishedStories([
      evaluateEngineeringSource(source(), 'verified-changelog'),
    ]);
    expect(
      buildEngineeringJsonFeed({
        appName: 'Jovie',
        baseUrl: 'https://jov.ie',
        stories: published,
      }).items
    ).toEqual([]);
    expect(
      buildEngineeringAtomFeed({
        appName: 'Jovie',
        baseUrl: 'https://jov.ie',
        stories: published,
        updated: '2026-08-30T00:00:00Z',
      })
    ).not.toContain('verified-changelog');
    const records = await loadEngineeringStoriesFromDisk();
    expect(records.some(record => record.slug === 'verified-changelog')).toBe(
      true
    );
    expect(selectPublishedStories(records)).toEqual([]);
  });
});
