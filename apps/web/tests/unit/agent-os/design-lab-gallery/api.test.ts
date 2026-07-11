import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROPOSED_SECTIONS } from '@/data/marketing';
import { DesignProposalSchema } from '@/lib/agent-os/design-lab/types';

const mocks = vi.hoisted(() => ({
  entitlements: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
  mutate: vi.fn(),
  review: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mocks.entitlements,
}));
vi.mock('@/lib/agent-os/design-lab/proposals', async importOriginal => {
  const actual =
    await importOriginal<
      typeof import('@/lib/agent-os/design-lab/proposals')
    >();
  return {
    ...actual,
    listDesignProposals: mocks.list,
    getDesignProposal: mocks.get,
    saveDesignProposal: mocks.save,
    mutateDesignProposal: mocks.mutate,
  };
});
vi.mock('@/lib/agent-os/design-lab/review', () => ({
  reviewDesignProposal: mocks.review,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

const admin = {
  isAuthenticated: true,
  isAdmin: true,
  email: 'reviewer@jovie.test',
  userId: 'user_1',
};

const approvedProposal = DesignProposalSchema.parse({
  id: PROPOSED_SECTIONS[0].id,
  kind: 'section-gap',
  surfaceId: 'section-gap:feature-split',
  surfaceName: PROPOSED_SECTIONS[0].proposedSectionName,
  proposalText: PROPOSED_SECTIONS[0].problem,
  assetRefs: [],
  scoring: null,
  linearIssueId: 'UNASSIGNED',
  linearIssueUrl: null,
  status: 'approved',
  designGap: PROPOSED_SECTIONS[0],
  createdAt: '2026-07-11T00:00:00.000Z',
  reviewedAt: '2026-07-11T01:00:00.000Z',
  reviewer: 'reviewer@jovie.test',
  reviewNotes: null,
  reviewDecision: 'yes',
  dayBucket: '2026-07-11',
});
const proposedProposal = DesignProposalSchema.parse({
  ...approvedProposal,
  status: 'proposed',
  reviewedAt: null,
  reviewer: null,
  reviewDecision: null,
});

describe('Design Lab gallery API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.entitlements.mockResolvedValue(admin);
    mocks.list.mockResolvedValue([]);
    mocks.get.mockResolvedValue(null);
    mocks.save.mockResolvedValue(undefined);
    mocks.mutate.mockImplementation(async input => {
      const source = (await mocks.get()) ?? proposedProposal;
      const mutation = await input.mutate(source);
      await mocks.save(mutation.proposal);
      return mutation.result;
    });
  });

  it('returns the canonical role-gate denial for gallery requests', async () => {
    mocks.entitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: false,
    });
    const { GET } = await import('@/app/api/admin/design-lab/proposals/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/design-lab/proposals')
    );
    expect(response.status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('merges committed records and filters by status, type, and route', async () => {
    const { GET } = await import('@/app/api/admin/design-lab/proposals/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/admin/design-lab/proposals?status=reviewing&sectionType=feature-grid&affectedRoute=%2Fdownload'
      )
    );
    const payload = (await response.json()) as {
      proposals: Array<{ id: string }>;
    };
    expect(response.status).toBe(200);
    expect(mocks.entitlements).toHaveBeenCalledOnce();
    expect(payload.proposals.map(item => item.id)).toEqual([
      'PROPOSED-SECTION-0004',
    ]);
  });

  it('limits the dedicated gallery query to section-gap records', async () => {
    const { GET } = await import('@/app/api/admin/design-lab/proposals/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/admin/design-lab/proposals?kind=section-gap'
      )
    );
    const payload = (await response.json()) as {
      proposals: Array<{ id: string; kind: string; designGap: unknown }>;
    };
    expect(response.status).toBe(200);
    expect(payload.proposals).toHaveLength(PROPOSED_SECTIONS.length);
    expect(
      payload.proposals.every(
        item =>
          item.kind === 'section-gap' &&
          item.id.startsWith('PROPOSED-SECTION-') &&
          item.designGap !== null
      )
    ).toBe(true);
  });

  it('validates compact feedback before persisting a comment', async () => {
    const { POST } = await import(
      '@/app/api/admin/design-lab/proposals/[proposalId]/comments/route'
    );
    const response = await POST(
      new NextRequest('http://localhost/comments', {
        method: 'POST',
        body: JSON.stringify({
          dayBucket: '2026-07-11',
          compactFeedback: 'WRONG-ID: tighten the mobile hierarchy',
        }),
      }),
      { params: Promise.resolve({ proposalId: 'PROPOSED-SECTION-0001' }) }
    );
    expect(response.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('appends valid compact feedback with the authenticated reviewer', async () => {
    const { POST } = await import(
      '@/app/api/admin/design-lab/proposals/[proposalId]/comments/route'
    );
    const response = await POST(
      new NextRequest('http://localhost/comments', {
        method: 'POST',
        body: JSON.stringify({
          dayBucket: '2026-07-11',
          compactFeedback:
            'PROPOSED-SECTION-0001: tighten the mobile hierarchy',
        }),
      }),
      { params: Promise.resolve({ proposalId: 'PROPOSED-SECTION-0001' }) }
    );
    expect(response.status).toBe(200);
    const saved =
      mocks.save.mock.calls[1]?.[0] ?? mocks.save.mock.calls[0]?.[0];
    expect(saved.designGap.comments.at(-1)).toMatchObject({
      author: 'reviewer@jovie.test',
      body: 'tighten the mobile hierarchy',
    });
  });

  it('requires approved status and evidence before implementation', async () => {
    const { POST } = await import(
      '@/app/api/admin/design-lab/proposals/[proposalId]/implemented/route'
    );
    const response = await POST(
      new NextRequest('http://localhost/implemented', {
        method: 'POST',
        body: JSON.stringify({
          dayBucket: '2026-07-11',
          evidenceRefs: ['tests/design-lab.png'],
        }),
      }),
      { params: Promise.resolve({ proposalId: 'PROPOSED-SECTION-0001' }) }
    );
    expect(response.status).toBe(409);
  });

  it('records implementation evidence only on an approved proposal', async () => {
    mocks.get.mockResolvedValue(approvedProposal);
    const { POST } = await import(
      '@/app/api/admin/design-lab/proposals/[proposalId]/implemented/route'
    );
    const response = await POST(
      new NextRequest('http://localhost/implemented', {
        method: 'POST',
        body: JSON.stringify({
          dayBucket: '2026-07-11',
          evidenceRefs: ['tests/design-lab-desktop.png'],
        }),
      }),
      { params: Promise.resolve({ proposalId: 'PROPOSED-SECTION-0001' }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'implemented',
        designGap: expect.objectContaining({
          registryTask: expect.objectContaining({
            evidenceRefs: ['tests/design-lab-desktop.png'],
          }),
        }),
      })
    );
  });

  it('maps reviewing conflicts to 409', async () => {
    mocks.review.mockRejectedValue(
      new Error('Design proposal review is already in progress.')
    );
    const { POST } = await import(
      '@/app/api/admin/design-lab/proposals/[proposalId]/review/route'
    );
    const response = await POST(
      new NextRequest('http://localhost/review', {
        method: 'POST',
        body: JSON.stringify({
          dayBucket: '2026-07-11',
          decision: 'yes',
        }),
      }),
      { params: Promise.resolve({ proposalId: 'PROPOSED-SECTION-0004' }) }
    );
    expect(response.status).toBe(409);
  });
});
