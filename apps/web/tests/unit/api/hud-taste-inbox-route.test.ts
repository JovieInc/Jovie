import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const accessMock = vi.fn();
const actionMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('@/lib/hud/require-admin-hud-api', () => ({
  requireAdminHudApiAccess: accessMock,
}));
vi.mock('@/lib/hud/taste-inbox', () => ({
  fetchTasteInbox: fetchMock,
  applyTasteAction: actionMock,
}));

describe('HUD Taste Inbox API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMock.mockResolvedValue(null);
  });

  it('fails closed before reading a payload for non-admins', async () => {
    accessMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );
    const { POST } = await import('@/app/api/admin/hud/taste-inbox/route');
    const response = await POST(
      new Request('http://localhost/api/admin/hud/taste-inbox', {
        method: 'POST',
        body: '{}',
      })
    );
    expect(response.status).toBe(403);
    expect(actionMock).not.toHaveBeenCalled();
  });

  it('validates action and passes approved input to the write-back service', async () => {
    const { POST } = await import('@/app/api/admin/hud/taste-inbox/route');
    const response = await POST(
      new Request('http://localhost/api/admin/hud/taste-inbox', {
        method: 'POST',
        body: JSON.stringify({
          issueId: 'issue-1',
          action: 'comment',
          comment: 'Keep the tighter crop.',
        }),
      })
    );
    expect(response.status).toBe(200);
    expect(actionMock).toHaveBeenCalledWith({
      issueId: 'issue-1',
      action: 'comment',
      comment: 'Keep the tighter crop.',
    });
  });
});
