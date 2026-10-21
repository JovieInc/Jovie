import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  close: vi.fn(),
  comment: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  getOvieOperatorEntitlements: mocks.access,
}));
vi.mock('@/lib/hud/linear-actions', () => ({
  closeLinearIssue: mocks.close,
  commentOnLinearIssue: mocks.comment,
  fetchTimActionIssues: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { POST } from '@/app/api/admin/hud/tim-actions/route';

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/admin/hud/tim-actions', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  );
}

describe('POST /api/admin/hud/tim-actions answers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ isAuthenticated: true, isAdmin: true });
    mocks.close.mockResolvedValue(true);
    mocks.comment.mockResolvedValue(true);
  });

  it('records the answer as a comment before closing', async () => {
    const order: string[] = [];
    mocks.comment.mockImplementation(async () => {
      order.push('comment');
      return true;
    });
    mocks.close.mockImplementation(async () => {
      order.push('close');
      return true;
    });
    const response = await post({ issueId: 'iss', answer: ' Signed in ' });
    expect(response.status).toBe(200);
    expect(mocks.comment).toHaveBeenCalledWith(
      'iss',
      'Answered in Ovie: Signed in'
    );
    expect(order).toEqual(['comment', 'close']);
  });

  it('keeps the issue open when the answer cannot be recorded', async () => {
    mocks.comment.mockResolvedValue(false);
    const response = await post({ issueId: 'iss', answer: 'OK' });
    expect(response.status).toBe(502);
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it('closes without a comment when no answer is given', async () => {
    const response = await post({ issueId: 'iss' });
    expect(response.status).toBe(200);
    expect(mocks.comment).not.toHaveBeenCalled();
  });

  it('rejects non-string and oversized answers', async () => {
    expect((await post({ issueId: 'iss', answer: 4 })).status).toBe(400);
    expect(
      (await post({ issueId: 'iss', answer: 'x'.repeat(2001) })).status
    ).toBe(400);
    expect(mocks.close).not.toHaveBeenCalled();
  });
});
