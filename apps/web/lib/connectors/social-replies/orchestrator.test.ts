import { describe, expect, it, vi } from 'vitest';
import {
  createReplyBatchFingerprint,
  normalizeReplyText,
  runSocialReplyBatch,
  type SocialReplyAdapter,
  type SocialReplyPreflight,
  type SocialReplyTarget,
  socialReplyBatchRequestSchema,
} from './index';

const CHECKED_AT = '2026-08-14T20:00:00.000Z';
const APPROVED_AT = '2026-08-14T20:01:00.000Z';

function target(
  index: number,
  overrides: Partial<SocialReplyTarget> = {}
): SocialReplyTarget {
  return {
    platform: 'youtube',
    sourceId: `video-${index}`,
    targetId: `comment-${index}`,
    draftedText: `A specific reply ${index}`,
    sourceKind: 'owned-audience',
    sourceUrl: `https://example.com/source/${index}`,
    baselineMetadata: { views: index * 100 },
    ...overrides,
  };
}

function preflight(
  overrides: Partial<SocialReplyPreflight> = {}
): SocialReplyPreflight {
  return {
    isPublic: true,
    canReply: true,
    existingReplyCount: 0,
    alreadyReplied: false,
    checkedAt: CHECKED_AT,
    baselineMetadata: { likes: 3 },
    ...overrides,
  };
}

function approvalFor(targets: ReadonlyArray<SocialReplyTarget>) {
  return {
    approvedBy: 'tim',
    approvedAt: APPROVED_AT,
    draftFingerprint: createReplyBatchFingerprint(targets),
    targetIds: targets.map(item => item.targetId),
  };
}

function approvedRequest(targets: ReadonlyArray<SocialReplyTarget>) {
  return {
    batchId: 'batch-approved-1',
    mode: 'approved' as const,
    targets,
    approval: approvalFor(targets),
  };
}

function adapterWith(
  overrides: Partial<SocialReplyAdapter> = {}
): SocialReplyAdapter {
  return {
    platform: 'youtube',
    preflight: vi.fn(async () => preflight()),
    writeReply: vi.fn(async () => ({
      status: 'written' as const,
      providerReplyId: 'provider-reply-1',
      providerMetadata: { requestId: 'request-1' },
    })),
    verifyReply: vi.fn(async (_target, writeResult) => ({
      status: 'verified' as const,
      providerReplyId: writeResult.providerReplyId,
      verifiedText: _target.draftedText,
      verifiedAt: CHECKED_AT,
      providerMetadata: { verified: true },
    })),
    ...overrides,
  };
}

const fixedNow = () => new Date('2026-08-14T20:02:00.000Z');

describe('social reply batch contract', () => {
  it('normalizes whitespace, Unicode compatibility forms, and case only for comparisons', () => {
    expect(normalizeReplyText('  Café\u212B  \n  NOW  ')).toBe('caféå now');
  });

  it('rejects duplicate target IDs and normalized duplicate copy before execution', () => {
    const result = socialReplyBatchRequestSchema.safeParse({
      batchId: 'batch-duplicate',
      targets: [
        target(1, { targetId: 'same', draftedText: 'Hello there' }),
        target(2, { targetId: 'same', draftedText: '  hello   THERE ' }),
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues
        .map(issue => issue.message)
        .join(' ');
      expect(messages).toContain('targetId duplicates');
      expect(messages).toContain('draftedText duplicates');
    }
  });

  it('is draft-only by default and never calls an adapter', async () => {
    const adapter = adapterWith();
    const receipt = await runSocialReplyBatch(
      { batchId: 'batch-draft', targets: [target(1), target(2)] },
      { youtube: adapter },
      { now: fixedNow }
    );

    expect(receipt.mode).toBe('draft');
    expect(receipt.halted).toBe(false);
    expect(receipt.counts).toEqual({
      drafted: 2,
      posted: 0,
      skipped: 0,
      failed: 0,
      ambiguous: 0,
    });
    expect(receipt.items.map(item => item.status)).toEqual(['draft', 'draft']);
    expect(adapter.preflight).not.toHaveBeenCalled();
    expect(adapter.writeReply).not.toHaveBeenCalled();
  });

  it('requires an explicit approval binding for approved execution', async () => {
    await expect(
      runSocialReplyBatch({
        batchId: 'batch-no-approval',
        mode: 'approved',
        targets: [target(1)],
      })
    ).rejects.toThrow('approved mode requires an explicit approval binding');
  });

  it('returns a failed receipt and performs no provider calls for stale approval', async () => {
    const targets = [target(1), target(2)];
    const adapter = adapterWith();
    const request = approvedRequest(targets);
    request.approval.draftFingerprint = 'fnv1a64:stale';

    const receipt = await runSocialReplyBatch(
      request,
      { youtube: adapter },
      { now: fixedNow }
    );

    expect(receipt.halted).toBe(true);
    expect(receipt.haltReason).toBe('approval-mismatch');
    expect(
      receipt.items.every(item => item.failureReason === 'approval-mismatch')
    ).toBe(true);
    expect(receipt.counts.failed).toBe(2);
    expect(adapter.preflight).not.toHaveBeenCalled();
  });
});

describe('runSocialReplyBatch safety gates', () => {
  it('preflights each target and skips private, non-replyable, and already-replied targets', async () => {
    const targets = [target(1), target(2), target(3), target(4)];
    const preflightResults = [
      preflight({ isPublic: false }),
      preflight({ canReply: false }),
      preflight({ existingReplyCount: 1 }),
      preflight({ alreadyReplied: true }),
    ];
    const adapter = adapterWith({
      preflight: vi.fn(async () => preflightResults.shift() ?? preflight()),
    });

    const receipt = await runSocialReplyBatch(
      approvedRequest(targets),
      { youtube: adapter },
      { now: fixedNow }
    );

    expect(receipt.halted).toBe(false);
    expect(receipt.items.map(item => item.skipReason)).toEqual([
      'not-public',
      'not-replyable',
      'already-replied',
      'already-replied',
    ]);
    expect(receipt.counts).toEqual({
      drafted: 0,
      posted: 0,
      skipped: 4,
      failed: 0,
      ambiguous: 0,
    });
    expect(adapter.writeReply).not.toHaveBeenCalled();
  });

  it('fails closed when an adapter is missing or has the wrong platform identity', async () => {
    const missingReceipt = await runSocialReplyBatch(
      approvedRequest([target(1), target(2)]),
      {},
      { now: fixedNow }
    );
    expect(missingReceipt.haltReason).toBe('missing-adapter');
    expect(missingReceipt.items.map(item => item.failureReason)).toEqual([
      'missing-adapter',
      'batch-halted',
    ]);

    const mismatchedReceipt = await runSocialReplyBatch(
      approvedRequest([target(1), target(2)]),
      { youtube: adapterWith({ platform: 'threads' }) },
      { now: fixedNow }
    );
    expect(mismatchedReceipt.haltReason).toBe('adapter-platform-mismatch');
    expect(mismatchedReceipt.items[0]?.failureReason).toBe(
      'adapter-platform-mismatch'
    );
  });

  it('halts after a preflight error and does not attempt later targets', async () => {
    const targets = [target(1), target(2)];
    const preflightSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error('provider timeout'))
      .mockResolvedValueOnce(preflight());
    const adapter = adapterWith({
      preflight: preflightSpy as SocialReplyAdapter['preflight'],
    });

    const receipt = await runSocialReplyBatch(
      approvedRequest(targets),
      { youtube: adapter },
      { now: fixedNow }
    );

    expect(receipt.haltReason).toBe('preflight-error');
    expect(receipt.items.map(item => item.failureReason)).toEqual([
      'preflight-error',
      'batch-halted',
    ]);
    expect(preflightSpy).toHaveBeenCalledTimes(1);
    expect(adapter.writeReply).not.toHaveBeenCalled();
  });

  it('fails closed when preflight returns an invalid safety receipt', async () => {
    const preflightSpy = vi.fn(
      async () =>
        ({
          isPublic: true,
          canReply: true,
          existingReplyCount: 0,
          alreadyReplied: false,
          checkedAt: 'not-a-timestamp',
          baselineMetadata: {},
        }) as unknown
    );
    const adapter = adapterWith({
      preflight: preflightSpy as SocialReplyAdapter['preflight'],
    });

    const receipt = await runSocialReplyBatch(
      approvedRequest([target(1), target(2)]),
      { youtube: adapter },
      { now: fixedNow }
    );

    expect(receipt.haltReason).toBe('invalid-preflight-result');
    expect(receipt.items.map(item => item.failureReason)).toEqual([
      'invalid-preflight-result',
      'batch-halted',
    ]);
    expect(adapter.writeReply).not.toHaveBeenCalled();
  });
});

describe('runSocialReplyBatch execution and receipts', () => {
  it('writes sequentially, paces between writes, and requires exact post-write verification', async () => {
    const targets = [target(1), target(2)];
    const events: string[] = [];
    const adapter = adapterWith({
      preflight: vi.fn(async item => {
        events.push(`preflight:${item.targetId}`);
        return preflight();
      }),
      writeReply: vi.fn(async item => {
        events.push(`write:${item.targetId}`);
        return {
          status: 'written' as const,
          providerReplyId: `reply-${item.targetId}`,
          providerMetadata: { target: item.targetId },
        };
      }),
      verifyReply: vi.fn(async (item, writeResult) => {
        events.push(`verify:${item.targetId}`);
        return {
          status: 'verified' as const,
          providerReplyId: writeResult.providerReplyId,
          verifiedText: item.draftedText,
          verifiedAt: CHECKED_AT,
          providerMetadata: { exact: true },
        };
      }),
    });
    const sleep = vi.fn(async (_milliseconds: number) => undefined);

    const receipt = await runSocialReplyBatch(
      approvedRequest(targets),
      { youtube: adapter },
      { minDelayMs: 1_000, sleep, now: fixedNow }
    );

    expect(events).toEqual([
      'preflight:comment-1',
      'write:comment-1',
      'verify:comment-1',
      'preflight:comment-2',
      'write:comment-2',
      'verify:comment-2',
    ]);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1_000);
    expect(receipt.items.map(item => item.status)).toEqual([
      'posted',
      'posted',
    ]);
    expect(receipt.items[0]).toMatchObject({
      providerReplyId: 'reply-comment-1',
      postedAt: '2026-08-14T20:02:00.000Z',
      verifiedAt: CHECKED_AT,
      baselineMetadata: { views: 100, preflight: { likes: 3 } },
      providerMetadata: { target: 'comment-1', exact: true },
    });
  });

  it.each([
    [
      'ambiguous write result',
      {
        status: 'ambiguous' as const,
        reason: 'provider uncertain',
        providerMetadata: {},
      },
      'write-ambiguous',
    ],
    [
      'invalid write result',
      { status: 'written' as const, providerReplyId: '', providerMetadata: {} },
      'invalid-write-result',
    ],
  ])('halts without retrying after %s', async (_label, writeResult, reason) => {
    const targets = [target(1), target(2)];
    const writeReply = vi.fn(async () => writeResult);
    const adapter = adapterWith({ writeReply });

    const receipt = await runSocialReplyBatch(
      approvedRequest(targets),
      { youtube: adapter },
      { now: fixedNow }
    );

    expect(receipt.haltReason).toBe(reason);
    expect(receipt.items.map(item => item.failureReason)).toEqual([
      reason,
      'batch-halted',
    ]);
    expect(writeReply).toHaveBeenCalledTimes(1);
    expect(adapter.verifyReply).not.toHaveBeenCalled();
  });

  it('halts after an ambiguous thrown write and never blindly retries', async () => {
    const writeReply = vi.fn(async () => {
      throw new Error('network dropped after dispatch');
    });
    const adapter = adapterWith({ writeReply });

    const receipt = await runSocialReplyBatch(
      approvedRequest([target(1), target(2)]),
      { youtube: adapter },
      { now: fixedNow }
    );

    expect(receipt.haltReason).toBe('write-error-ambiguous');
    expect(receipt.items[0]?.status).toBe('ambiguous');
    expect(writeReply).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'verification error',
      async () => {
        throw new Error('read failed');
      },
      'verification-error-ambiguous',
    ],
    [
      'not found',
      async () => ({
        status: 'not-found' as const,
        reason: 'not visible',
        verifiedAt: CHECKED_AT,
        providerMetadata: {},
      }),
      'verification-not-found',
    ],
    [
      'ambiguous verification',
      async () => ({
        status: 'ambiguous' as const,
        reason: 'eventual consistency',
        verifiedAt: CHECKED_AT,
        providerMetadata: {},
      }),
      'verification-ambiguous',
    ],
    [
      'invalid verification',
      async () => ({
        status: 'verified' as const,
        providerReplyId: '',
        verifiedText: 'missing timestamp',
        verifiedAt: CHECKED_AT,
        providerMetadata: {},
      }),
      'invalid-verification-result',
    ],
  ])('halts on %s and marks later targets unattempted', async (_label, verifyReply, reason) => {
    const adapter = adapterWith({ verifyReply });

    const receipt = await runSocialReplyBatch(
      approvedRequest([target(1), target(2)]),
      { youtube: adapter },
      { now: fixedNow }
    );

    expect(receipt.haltReason).toBe(reason);
    expect(receipt.items.map(item => item.failureReason)).toEqual([
      reason,
      'batch-halted',
    ]);
    expect(adapter.writeReply).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'provider ID',
      { providerReplyId: 'different-id', verifiedText: 'A specific reply 1' },
    ],
    [
      'reply text',
      {
        providerReplyId: 'provider-reply-1',
        verifiedText: 'A different reply',
      },
    ],
  ])('halts when exact verification mismatches %s', async (_label, mismatch) => {
    const adapter = adapterWith({
      verifyReply: vi.fn(async () => ({
        status: 'verified' as const,
        ...mismatch,
        verifiedAt: CHECKED_AT,
        providerMetadata: {},
      })),
    });

    const receipt = await runSocialReplyBatch(
      approvedRequest([target(1), target(2)]),
      { youtube: adapter },
      { now: fixedNow }
    );

    expect(receipt.haltReason).toBe('verification-mismatch');
    expect(receipt.items[0]?.status).toBe('ambiguous');
    expect(receipt.items[1]?.failureReason).toBe('batch-halted');
  });
});
