import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
  listCreatorDocuments,
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

  it('locks the current document before approval side effects', async () => {
    const source = await readFile(
      join(process.cwd(), 'lib/db/creator-documents/store.ts'),
      'utf8'
    );
    const approval = source.slice(
      source.indexOf('export async function approveCreatorRevisionForCapture'),
      source.indexOf('export async function completeCreatorEvidenceReview')
    );

    expect(approval).toContain('with locked_document as');
    expect(approval).toContain('for update');
    expect(approval.match(/and claim\.kind = 'fact'/g)).toHaveLength(1);
  });

  it('allows evidence review when a script has no factual claims', async () => {
    execute.mockResolvedValueOnce({ rows: [{ outcome: 'updated' }] });
    await expect(
      completeCreatorEvidenceReview({
        creatorProfileId: '22222222-2222-4222-8222-222222222222',
        documentId: '11111111-1111-4111-8111-111111111111',
        revision: 3,
      })
    ).resolves.toBeUndefined();

    const migration = await readFile(
      join(process.cwd(), 'drizzle/migrations/0093_graceful_ronan.sql'),
      'utf8'
    );
    const reviewFunction = migration.slice(
      migration.indexOf(
        'CREATE OR REPLACE FUNCTION complete_creator_evidence_review'
      ),
      migration.indexOf(
        'CREATE OR REPLACE FUNCTION enforce_creator_approval_integrity'
      )
    );
    expect(reviewFunction).toContain('FOR UPDATE');
    expect(reviewFunction.match(/claim\.kind = 'fact'/g)).toHaveLength(1);
    expect(reviewFunction).toContain("RETURN 'evidence_incomplete'");
  });

  it('uses stable cursor pagination instead of truncating the library', async () => {
    const source = await readFile(
      join(process.cwd(), 'lib/db/creator-documents/store.ts'),
      'utf8'
    );
    const listing = source.slice(
      source.indexOf('export async function listCreatorDocuments'),
      source.indexOf('export async function captureCreatorIdea')
    );

    expect(listing).toContain('CREATOR_DOCUMENT_PAGE_SIZE + 1');
    expect(listing).toContain('nextCursor');
    expect(listing).toContain('desc(creatorDocuments.id)');
    expect(listing).toContain('updatedAtCursor');
    expect(listing).toContain('::text');
    expect(listing).toContain('::timestamptz');
    expect(listing).not.toContain('.limit(100)');
  });

  it('rejects malformed UUID cursor ids before querying PostgreSQL', async () => {
    const malformedCursor = Buffer.from(
      JSON.stringify({
        updatedAt: '2026-08-18T00:00:00.000Z',
        id: '------------------------------------',
      })
    ).toString('base64url');
    await expect(
      listCreatorDocuments('22222222-2222-4222-8222-222222222222', {
        cursor: malformedCursor,
      })
    ).rejects.toThrow('Invalid creator document cursor');

    expect(execute).not.toHaveBeenCalled();
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
    execute.mockResolvedValueOnce({
      rows: [{ outcome: 'evidence_incomplete' }],
    });
    await expect(
      completeCreatorEvidenceReview({
        creatorProfileId: '22222222-2222-4222-8222-222222222222',
        documentId: '11111111-1111-4111-8111-111111111111',
        revision: 3,
      })
    ).rejects.toThrow('Every factual script claim needs supporting evidence');
  });

  it('reports a stale evidence-review request as a revision conflict', async () => {
    execute.mockResolvedValueOnce({
      rows: [{ outcome: 'revision_conflict' }],
    });
    await expect(
      completeCreatorEvidenceReview({
        creatorProfileId: '22222222-2222-4222-8222-222222222222',
        documentId: '11111111-1111-4111-8111-111111111111',
        revision: 3,
      })
    ).rejects.toThrow('Document changed in another session');
  });

  it('rejects claim mutation after the ledger is frozen', async () => {
    execute.mockResolvedValueOnce({
      rows: [
        {
          id: null,
          currentRevision: 3,
          stage: 'evidence_review',
          revisionExists: true,
          sourceAccessible: true,
        },
      ],
    });
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
    ).rejects.toThrow('Claim ledger is frozen for review');
  });

  it('distinguishes an inaccessible claim source from a stale revision', async () => {
    execute.mockResolvedValueOnce({
      rows: [
        {
          id: null,
          currentRevision: 3,
          stage: 'private_draft',
          revisionExists: true,
          sourceAccessible: false,
        },
      ],
    });
    await expect(
      addCreatorRevisionClaim({
        creatorProfileId: '22222222-2222-4222-8222-222222222222',
        userId: '33333333-3333-4333-8333-333333333333',
        documentId: '11111111-1111-4111-8111-111111111111',
        revision: 3,
        claimText: 'A sourced claim',
        kind: 'fact',
        evidenceState: 'supported',
        sourceRecordId: '44444444-4444-4444-8444-444444444444',
      })
    ).rejects.toMatchObject({ code: 'claim_source_inaccessible' });
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

  it('uses the same canonical content hash contract for every revision', async () => {
    const source = await readFile(
      join(process.cwd(), 'lib/db/creator-documents/store.ts'),
      'utf8'
    );
    const save = source.slice(
      source.indexOf('export async function saveCreatorDocumentRevision'),
      source.indexOf('export async function approveCreatorRevisionForCapture')
    );

    expect(save).toContain('hashRevision({');
    expect(save).toContain('title: input.title');
    expect(save).toContain('kind: input.kind');
    expect(save).toContain('content: input.content');
    expect(save).not.toContain('hashRevision(input)');
  });
});
