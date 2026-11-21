import { describe, expect, it } from 'vitest';
import {
  DAILY_RECEIPT_SCHEMA,
  extractDailyReceipts,
} from '../daily-changelog.mjs';
import { planDailyPublication } from '../daily-changelog-publication.mjs';
import {
  compactDailyReceipts,
  countAuditReasons,
  insertCompactedDigest,
  MAX_RECEIPT_BYTES,
  oversizedReceipts,
} from '../daily-changelog-receipts.mjs';

const HEAD = 'a'.repeat(40);
const MERGE = 'b'.repeat(40);
const note = {
  issueId: 'JOV-7447',
  outcomeKey: 'profile-claim',
  section: 'Added',
  audience: 'public',
  visibility: 'public',
  releaseWorthy: true,
  text: 'Choose your profile link: Start with a name on the homepage.',
  availability: { status: 'ga', prerequisites: [] },
  evidence: [{ url: 'https://jov.ie/', contains: 'Claim' }],
};
const candidate = (number, body) => ({
  pr: {
    number,
    state: 'MERGED',
    baseRefName: 'main',
    mergeCommit: { oid: MERGE },
    url: `https://github.com/JovieInc/Jovie/pull/${number}`,
    body,
  },
  ancestor: true,
  evidencePassed: true,
});
const receiptComment = receipt =>
  `<!-- ${DAILY_RECEIPT_SCHEMA} ${JSON.stringify(receipt)} -->`;
const legacy = {
  schema: DAILY_RECEIPT_SCHEMA,
  window: { key: '2026-10-01' },
  sourceReceiptIds: ['old'],
  audit: [
    { id: 'a', reason: 'unavailable' },
    { id: 'b', reason: 'internal' },
    { id: 'c', reason: 'unavailable' },
  ],
  pending: ['a', 'c'],
};

describe('daily changelog receipt compaction (repo-size budget)', () => {
  it('counts audit rows by reason with sorted keys', () => {
    expect(countAuditReasons(legacy.audit)).toEqual({
      internal: 1,
      unavailable: 2,
    });
    expect(Object.keys(countAuditReasons(legacy.audit))).toEqual([
      'internal',
      'unavailable',
    ]);
    expect(countAuditReasons()).toEqual({});
  });

  it('replaces audit rows with counts in place, idempotently', () => {
    const markdown = `## [2026-10-01]\n\n- Visible.\n\n${receiptComment(legacy)}\nx <!-- daily-changelog-receipt/v1 {not json} --> y\n`;
    const compacted = compactDailyReceipts(markdown);
    const [first, second] = extractDailyReceipts(compacted);
    expect(Object.keys(first)).toEqual([
      'schema',
      'window',
      'sourceReceiptIds',
      'auditCounts',
      'pending',
    ]);
    expect(first.auditCounts).toEqual({ internal: 1, unavailable: 2 });
    expect(first.pending).toEqual(['a', 'c']);
    expect(second.malformed).toBe(true);
    expect(compacted).toContain('- Visible.');
    expect(compacted.length).toBeLessThan(markdown.length);
    expect(compactDailyReceipts(compacted)).toBe(compacted);
  });

  it('publishes counts, not rows, and compacts older receipts', () => {
    const plan = planDailyPublication({
      markdown: `# Changelog\n\n## [Unreleased]\n\n## [2026-10-01]\n\n- Old.\n\n${receiptComment(legacy)}\n`,
      marker: {
        sha: HEAD,
        deploymentId: 'dpl_1',
        controllerRun: '123',
        controllerAttempt: '1',
        authSmoke: 'passed',
        terminalReason: 'promoted',
        selectedLanes: ['web'],
      },
      buildInfo: {
        commitSha: HEAD,
        deploymentId: 'dpl_1',
        environment: 'production',
      },
      controller: { verified: true, runId: 123, attempt: 1 },
      candidates: [
        candidate(1, `<!-- customer-changelog/v1 ${JSON.stringify(note)} -->`),
        candidate(2, ''),
      ],
      windowKey: '2026-10-02',
      observedAt: '2026-10-02T12:00:00Z',
    });
    expect(plan.status).toBe('publish');
    expect(plan.audit).toEqual([
      { id: `JovieInc/Jovie#2@${MERGE}`, reason: 'missing-metadata' },
    ]);
    expect(plan.result.receipt).not.toHaveProperty('audit');
    expect(plan.result.receipt.auditCounts).toEqual({ 'missing-metadata': 1 });
    const persisted = extractDailyReceipts(plan.content);
    expect(persisted).toHaveLength(2);
    expect(persisted.some(receipt => 'audit' in receipt)).toBe(false);
    expect(
      persisted.find(receipt => receipt.window?.key === '2026-10-01')
    ).toMatchObject({
      sourceReceiptIds: ['old'],
      auditCounts: { internal: 1, unavailable: 2 },
    });
  });

  it('refuses a publish whose receipt outgrows the refill cap', () => {
    const big = receiptComment({
      schema: DAILY_RECEIPT_SCHEMA,
      window: { key: '2026-10-03' },
      pending: Array.from({ length: 2000 }, (_, i) => `JovieInc/Jovie#${i}`),
    });
    expect(oversizedReceipts(`# Changelog\n${big}\n`)).toHaveLength(1);
    expect(Buffer.byteLength(big)).toBeGreaterThan(MAX_RECEIPT_BYTES);
    expect(() =>
      insertCompactedDigest('# Changelog\n', `## Day\n${big}\n`, '2026-10-03')
    ).toThrow(/persist counts, not per-candidate rows/);
  });
});
