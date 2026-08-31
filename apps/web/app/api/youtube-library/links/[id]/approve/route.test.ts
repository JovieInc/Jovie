import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateLinkOwnership: vi.fn(),
  reconcileApprovedYouTubeCollaborators: vi.fn(),
  captureError: vi.fn(),
  updateWhere: vi.fn(async () => undefined),
  updateSet: vi.fn(),
}));

vi.mock('../shared', () => ({
  validateLinkOwnership: mocks.validateLinkOwnership,
}));
vi.mock('@/lib/db', () => ({
  db: {
    update: vi.fn(() => ({
      set: mocks.updateSet.mockImplementation(() => ({
        where: mocks.updateWhere,
      })),
    })),
  },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('@/lib/library/graph-store', () => ({
  reconcileApprovedYouTubeCollaborators:
    mocks.reconcileApprovedYouTubeCollaborators,
}));

import { POST } from './route';

describe('POST /api/youtube-library/links/[id]/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateLinkOwnership.mockResolvedValue({
      userId: 'user-1',
      link: {
        id: 'link-1',
        status: 'pending_review',
        creatorProfileId: 'profile-1',
      },
    });
    mocks.reconcileApprovedYouTubeCollaborators.mockResolvedValue(1);
  });

  it('approves a pending link and reconciles collaborator edges', async () => {
    const response = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'link-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.validateLinkOwnership).toHaveBeenCalledWith('link-1', {
      allowedStatuses: ['pending_review', 'approved'],
    });
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'approved',
        approvedBy: 'user-1',
      })
    );
    expect(mocks.reconcileApprovedYouTubeCollaborators).toHaveBeenCalledWith(
      'profile-1',
      expect.any(Date)
    );
  });

  it('reconciles an already-approved link so retry can recover projection', async () => {
    mocks.validateLinkOwnership.mockResolvedValueOnce({
      userId: 'user-1',
      link: {
        id: 'link-1',
        status: 'approved',
        creatorProfileId: 'profile-1',
      },
    });

    const response = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'link-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.updateSet).not.toHaveBeenCalled();
    expect(mocks.reconcileApprovedYouTubeCollaborators).toHaveBeenCalledWith(
      'profile-1',
      expect.any(Date)
    );
  });
});
