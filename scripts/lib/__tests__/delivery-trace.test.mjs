import { describe, expect, it } from 'vitest';

import { buildDeliveryTrace } from '../../hermes/lib/delivery-trace.ts';

const merged = {
  number: 12,
  url: 'https://github.com/JovieInc/Jovie/pull/12',
  mergeSha: 'a'.repeat(40),
  mergedAt: '2026-07-27T12:00:00.000Z',
  closingIssueNumbers: [34],
};

describe('delivery trace', () => {
  it('counts a linked PR only after exact SHA and Production Verified succeed', () => {
    const trace = buildDeliveryTrace({
      generatedAt: '2026-07-27T12:01:00.000Z',
      mergedPrs: [merged],
      controllerReceipts: [
        {
          runId: 99,
          headSha: merged.mergeSha,
          status: 'completed',
          conclusion: 'success',
          updatedAt: '2026-07-27T12:01:00.000Z',
          productionVerifiedConclusion: 'success',
        },
      ],
    });
    expect(trace.summary).toEqual({ complete: 1, incomplete: 0, unlinked: 0 });
    expect(trace.traces[0]).toMatchObject({
      issueNumber: 34,
      status: 'complete',
    });
  });

  it('does not accept a successful controller without Production Verified', () => {
    const trace = buildDeliveryTrace({
      generatedAt: '2026-07-27T12:01:00.000Z',
      mergedPrs: [merged],
      controllerReceipts: [
        {
          runId: 99,
          headSha: merged.mergeSha,
          status: 'completed',
          conclusion: 'success',
          updatedAt: '2026-07-27T12:01:00.000Z',
          productionVerifiedConclusion: null,
        },
      ],
    });
    expect(trace.traces[0].status).toBe('failed_receipt');
    expect(trace.summary.incomplete).toBe(1);
  });

  it('keeps unlinked PRs out of issue-to-production proof', () => {
    const trace = buildDeliveryTrace({
      generatedAt: '2026-07-27T12:01:00.000Z',
      mergedPrs: [{ ...merged, closingIssueNumbers: [] }],
      controllerReceipts: [],
    });
    expect(trace.traces[0].status).toBe('unlinked');
    expect(trace.summary.unlinked).toBe(1);
  });
});
