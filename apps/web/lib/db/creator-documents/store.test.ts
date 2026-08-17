import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findFirst, execute, insert } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  execute: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    query: { creatorDocuments: { findFirst } },
    execute,
    insert,
  },
}));

import {
  addCreatorRevisionClaim,
  approveCreatorRevisionForCapture,
  captureCreatorIdea,
  completeCreatorEvidenceReview,
  saveCreatorDocumentRevision,
} from './store';

describe('creator document persistence boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deduplicates capture while repairing a missing first revision', async () => {
    findFirst.mockResolvedValueOnce({
      id: '11111111-1111-4111-8111-111111111111',
    });

    const revisionInsert = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    };
    insert.mockReturnValueOnce(revisionInsert);

    await expect(
      captureCreatorIdea({
        creatorProfileId: '22222222-2222-4222-8222-222222222222',
        userId: 'user_1',
        title: 'Same idea',
        body: 'Captured twice',
        idempotencyKey: 'capture-key-123',
      })
    ).resolves.toEqual({
      documentId: '11111111-1111-4111-8111-111111111111',
      deduplicated: true,
    });
    expect(insert).toHaveBeenCalledOnce();
    expect(revisionInsert.onConflictDoNothing).toHaveBeenCalledOnce();
  });

  it('fails closed when an exact evidence-backed script is not eligible', async () => {
    execute.mockResolvedValueOnce({ rows: [] });
    await expect(
      approveCreatorRevisionForCapture({
        creatorProfileId: '22222222-2222-4222-8222-222222222222',
        userId: 'user_1',
        documentId: '11111111-1111-4111-8111-111111111111',
        revision: 3,
      })
    ).rejects.toThrow('current evidence-backed script');
  });

  it('creates only a handoff boundary after exact-revision approval', async () => {
    execute.mockResolvedValueOnce({
      rows: [{ id: '11111111-1111-4111-8111-111111111111' }],
    });
    await expect(
      approveCreatorRevisionForCapture({
        creatorProfileId: '22222222-2222-4222-8222-222222222222',
        userId: 'user_1',
        documentId: '11111111-1111-4111-8111-111111111111',
        revision: 3,
      })
    ).resolves.toBeUndefined();
  });

  it('fails closed when factual evidence review is incomplete', async () => {
    execute.mockResolvedValueOnce({ rows: [] });
    await expect(
      completeCreatorEvidenceReview({
        creatorProfileId: '22222222-2222-4222-8222-222222222222',
        documentId: '11111111-1111-4111-8111-111111111111',
        revision: 3,
      })
    ).rejects.toThrow('Every factual script claim needs supporting evidence');
  });

  it('rejects claim mutation after the ledger is frozen', async () => {
    execute.mockResolvedValueOnce({ rows: [] });
    await expect(
      addCreatorRevisionClaim({
        creatorProfileId: '22222222-2222-4222-8222-222222222222',
        userId: '33333333-3333-4333-8333-333333333333',
        documentId: '11111111-1111-4111-8111-111111111111',
        revision: 3,
        claimText: 'A frozen claim',
        kind: 'fact',
        evidenceState: 'supported',
        sourceRecordId: '44444444-4444-4444-8444-444444444444',
      })
    ).rejects.toThrow('Claim ledger is frozen');
  });

  it('rejects an optimistic revision conflict', async () => {
    execute.mockResolvedValueOnce({ rows: [{ revision: 9 }] });
    await expect(
      saveCreatorDocumentRevision({
        creatorProfileId: '22222222-2222-4222-8222-222222222222',
        userId: '33333333-3333-4333-8333-333333333333',
        documentId: '11111111-1111-4111-8111-111111111111',
        expectedRevision: 3,
        title: 'Conflicting revision',
        kind: 'script',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        plainText: 'Conflicting revision',
      })
    ).rejects.toThrow('Document changed in another session');
  });
});
