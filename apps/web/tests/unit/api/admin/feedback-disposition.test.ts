import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEntitlements = vi.hoisted(() => vi.fn());
const mockAuth = vi.hoisted(() => vi.fn());
const mockRecordDisposition = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  getOvieOperatorEntitlements: mockEntitlements,
}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mockAuth }));
vi.mock('@/lib/feedback', () => ({
  getFeedbackDecisions: vi.fn(),
  recordFeedbackDisposition: mockRecordDisposition,
}));

function request(body: unknown) {
  return new Request(
    'http://localhost/api/admin/feedback/feedback_1/disposition',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

describe('POST /api/admin/feedback/[id]/disposition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });
    mockAuth.mockResolvedValue({ userId: 'admin_123' });
    mockRecordDisposition.mockResolvedValue({ id: 'feedback_1' });
  });

  it('derives the decision actor from the authenticated admin', async () => {
    const { POST } = await import(
      '@/app/api/admin/feedback/[id]/disposition/route'
    );
    const response = await POST(
      request({
        disposition: 'now',
        reason: 'Matches the current bottleneck',
        actor: 'summer',
      }),
      { params: Promise.resolve({ id: 'feedback_1' }) }
    );

    expect(response.status).toBe(200);
    expect(mockRecordDisposition).toHaveBeenCalledWith({
      feedbackItemId: 'feedback_1',
      disposition: 'now',
      reason: 'Matches the current bottleneck',
      actor: 'admin_123',
      payload: undefined,
    });
  });

  it.each([
    { isAuthenticated: false, isAdmin: false, status: 401 },
    { isAuthenticated: true, isAdmin: false, status: 403 },
  ])('rejects unauthorized writes before recording (%s)', async access => {
    mockEntitlements.mockResolvedValue(access);
    const { POST } = await import(
      '@/app/api/admin/feedback/[id]/disposition/route'
    );
    const response = await POST(
      request({ disposition: 'later', reason: 'Not yet' }),
      { params: Promise.resolve({ id: 'feedback_1' }) }
    );

    expect(response.status).toBe(access.status);
    expect(mockRecordDisposition).not.toHaveBeenCalled();
  });

  it('rejects invalid dispositions before recording', async () => {
    const { POST } = await import(
      '@/app/api/admin/feedback/[id]/disposition/route'
    );
    const response = await POST(
      request({ disposition: 'soon', reason: 'Ambiguous' }),
      { params: Promise.resolve({ id: 'feedback_1' }) }
    );

    expect(response.status).toBe(400);
    expect(mockRecordDisposition).not.toHaveBeenCalled();
  });
});
