import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const hoisted = vi.hoisted(() => ({
  getCurrentUserEntitlements: vi.fn(),
  listPendingDesignProposals: vi.fn(),
  reviewDesignProposal: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlements,
}));

vi.mock('@/lib/agent-os/design-lab/proposals', () => ({
  listPendingDesignProposals: hoisted.listPendingDesignProposals,
}));

vi.mock('@/lib/agent-os/design-lab/review', () => ({
  reviewDesignProposal: hoisted.reviewDesignProposal,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

function entitlements(overrides: Record<string, unknown>) {
  return {
    userId: 'admin-1',
    email: 'tim@example.com',
    isAuthenticated: true,
    isAdmin: false,
    isPro: false,
    hasAdvancedFeatures: false,
    canRemoveBranding: false,
    ...overrides,
  };
}

function reviewRequest(body: unknown): NextRequest {
  return new Request(
    'https://jov.ie/api/admin/design-lab/proposals/proposal-1/review',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  ) as NextRequest;
}

describe('Taste Inbox design proposal API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCurrentUserEntitlements.mockResolvedValue(
      entitlements({ isAdmin: true })
    );
    hoisted.listPendingDesignProposals.mockResolvedValue([]);
    hoisted.reviewDesignProposal.mockResolvedValue({
      proposal: { id: 'proposal-1' },
      tasteMemoryWritten: true,
      linearUpdated: true,
      dispatchTriggered: false,
      dispatchId: null,
    });
  });

  it('lists pending proposals for a recently reverified admin', async () => {
    hoisted.listPendingDesignProposals.mockResolvedValue([
      { id: 'proposal-1', status: 'pending' },
    ]);

    const { GET } = await import('@/app/api/admin/design-lab/proposals/route');
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      proposals: [{ id: 'proposal-1', status: 'pending' }],
    });
  });

  it('returns an actionable forbidden response when admin reverification is stale', async () => {
    hoisted.getCurrentUserEntitlements.mockResolvedValue(entitlements({}));

    const { GET } = await import('@/app/api/admin/design-lab/proposals/route');
    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'ovie_taste_inbox_forbidden',
      action: 'reverify_admin',
    });
    expect(hoisted.listPendingDesignProposals).not.toHaveBeenCalled();
  });

  it('reviews a proposal for a reverified admin and preserves receipt inputs', async () => {
    const { POST } = await import(
      '@/app/api/admin/design-lab/proposals/[proposalId]/review/route'
    );
    const response = await POST(
      reviewRequest({
        dayBucket: '2026-09-01',
        decision: 'no',
        notes: 'Do not resurface this version.',
      }),
      { params: Promise.resolve({ proposalId: 'proposal-1' }) }
    );

    expect(response.status).toBe(200);
    expect(hoisted.reviewDesignProposal).toHaveBeenCalledWith({
      dayBucket: '2026-09-01',
      proposalId: 'proposal-1',
      decision: 'no',
      notes: 'Do not resurface this version.',
      reviewer: 'tim@example.com',
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      result: {
        tasteMemoryWritten: true,
        linearUpdated: true,
      },
    });
  });
});
