import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSessionContext,
  requireCreatorDocumentAccess,
  saveCreatorDocumentRevision,
  approveCreatorRevisionForCapture,
  addCreatorRevisionClaim,
  completeCreatorEvidenceReview,
  MockCreatorDocumentConflictError,
} = vi.hoisted(() => ({
  getSessionContext: vi.fn(),
  requireCreatorDocumentAccess: vi.fn(),
  saveCreatorDocumentRevision: vi.fn(),
  approveCreatorRevisionForCapture: vi.fn(),
  addCreatorRevisionClaim: vi.fn(),
  completeCreatorEvidenceReview: vi.fn(),
  MockCreatorDocumentConflictError: class extends Error {
    constructor(readonly code: string) {
      super('Claim ledger changed or the evidence source is inaccessible');
    }
  },
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext,
  isUnauthorizedSessionError: (error: unknown) =>
    error instanceof Error && error.message === 'Unauthorized',
}));
vi.mock('@/lib/creator-documents/access', () => ({
  requireCreatorDocumentAccess,
}));
vi.mock('@/lib/db/creator-documents/store', () => ({
  CreatorDocumentConflictError: MockCreatorDocumentConflictError,
  saveCreatorDocumentRevision,
  approveCreatorRevisionForCapture,
  addCreatorRevisionClaim,
  completeCreatorEvidenceReview,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { POST as approve } from './[id]/approve/route';
import { POST as addClaim } from './[id]/claims/route';
import { POST as review } from './[id]/review/route';
import { PATCH as saveRevision } from './[id]/route';

const context = {
  params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }),
};

describe('creator document route authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionContext.mockResolvedValue({
      profile: { id: '22222222-2222-4222-8222-222222222222' },
      user: { id: '33333333-3333-4333-8333-333333333333' },
    });
  });

  it('reauthorizes the exact active profile before saving a revision', async () => {
    saveCreatorDocumentRevision.mockResolvedValue(2);
    const response = await saveRevision(
      new Request('https://jov.ie/api/library/documents/1', {
        method: 'PATCH',
        body: JSON.stringify({
          expectedRevision: 1,
          title: 'Exact revision',
          kind: 'script',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Exact revision' }],
              },
            ],
          },
          plainText: 'Exact revision',
        }),
      }),
      context
    );

    expect(response.status).toBe(200);
    expect(requireCreatorDocumentAccess).toHaveBeenCalledWith({
      userId: '33333333-3333-4333-8333-333333333333',
      profileId: '22222222-2222-4222-8222-222222222222',
    });
    expect(saveCreatorDocumentRevision).toHaveBeenCalledWith(
      expect.objectContaining({ plainText: 'Exact revision' })
    );
  });

  it('derives revision plain text from validated rich content', async () => {
    saveCreatorDocumentRevision.mockResolvedValue(2);
    const response = await saveRevision(
      new Request('https://jov.ie/api/library/documents/1', {
        method: 'PATCH',
        body: JSON.stringify({
          expectedRevision: 1,
          title: 'Exact revision',
          kind: 'script',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Canonical body' }],
              },
            ],
          },
          plainText: 'Attacker-controlled mismatch',
        }),
      }),
      context
    );

    expect(response.status).toBe(200);
    expect(saveCreatorDocumentRevision).toHaveBeenCalledWith(
      expect.objectContaining({ plainText: 'Canonical body' })
    );
  });

  it('requires canonical owner access for exact approval', async () => {
    approveCreatorRevisionForCapture.mockResolvedValue(undefined);
    const response = await approve(
      new Request('https://jov.ie/api/library/documents/1/approve', {
        method: 'POST',
        body: JSON.stringify({ revision: 2 }),
      }),
      context
    );

    expect(response.status).toBe(200);
    expect(requireCreatorDocumentAccess).toHaveBeenCalledWith({
      userId: '33333333-3333-4333-8333-333333333333',
      profileId: '22222222-2222-4222-8222-222222222222',
      ownerOnly: true,
    });
  });

  it('fails closed before mutation when profile access is rejected', async () => {
    requireCreatorDocumentAccess.mockRejectedValueOnce(
      new Error('Unauthorized')
    );
    const response = await approve(
      new Request('https://jov.ie/api/library/documents/1/approve', {
        method: 'POST',
        body: JSON.stringify({ revision: 2 }),
      }),
      context
    );

    expect(response.status).toBe(401);
    expect(approveCreatorRevisionForCapture).not.toHaveBeenCalled();
  });

  it('authorizes evidence review before mutating the revision stage', async () => {
    completeCreatorEvidenceReview.mockResolvedValue(undefined);
    const callOrder: string[] = [];
    requireCreatorDocumentAccess.mockImplementationOnce(async () => {
      callOrder.push('authorize');
    });
    completeCreatorEvidenceReview.mockImplementationOnce(async () => {
      callOrder.push('review');
    });

    const response = await review(
      new Request('https://jov.ie/api/library/documents/1/review', {
        method: 'POST',
        body: JSON.stringify({ revision: 2 }),
      }),
      context
    );

    expect(response.status).toBe(200);
    expect(callOrder).toEqual(['authorize', 'review']);
  });

  it('fails closed before evidence review when profile access is rejected', async () => {
    requireCreatorDocumentAccess.mockRejectedValueOnce(
      new Error('Unauthorized')
    );

    const response = await review(
      new Request('https://jov.ie/api/library/documents/1/review', {
        method: 'POST',
        body: JSON.stringify({ revision: 2 }),
      }),
      context
    );

    expect(response.status).toBe(401);
    expect(completeCreatorEvidenceReview).not.toHaveBeenCalled();
  });

  it('never derives document ownership from the requested URL', async () => {
    getSessionContext.mockResolvedValueOnce({
      profile: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    });
    saveCreatorDocumentRevision.mockResolvedValueOnce(2);

    await saveRevision(
      new Request('https://jov.ie/api/library/documents/owner-a-document', {
        method: 'PATCH',
        body: JSON.stringify({
          expectedRevision: 1,
          title: 'Profile B attempt',
          kind: 'script',
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
          plainText: 'Profile B attempt',
        }),
      }),
      context
    );

    expect(saveCreatorDocumentRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        documentId: '11111111-1111-4111-8111-111111111111',
      })
    );
  });

  it('rejects a supported claim without a source before persistence', async () => {
    const response = await addClaim(
      new Request('https://jov.ie/api/library/documents/1/claims', {
        method: 'POST',
        body: JSON.stringify({
          revision: 1,
          claimText: 'A supported opinion',
          kind: 'opinion',
          evidenceState: 'supported',
          sourceRecordId: null,
        }),
      }),
      context
    );

    expect(response.status).toBe(400);
    expect(addCreatorRevisionClaim).not.toHaveBeenCalled();
  });

  it('returns a recoverable conflict for an inaccessible evidence source', async () => {
    addCreatorRevisionClaim.mockRejectedValueOnce(
      new MockCreatorDocumentConflictError('claim_source_inaccessible')
    );
    const response = await addClaim(
      new Request('https://jov.ie/api/library/documents/1/claims', {
        method: 'POST',
        body: JSON.stringify({
          revision: 1,
          claimText: 'A supported fact',
          kind: 'fact',
          evidenceState: 'supported',
          sourceRecordId: '44444444-4444-4444-8444-444444444444',
        }),
      }),
      context
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'claim_source_inaccessible',
    });
  });
});
