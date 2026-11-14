import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  isAdmin: vi.fn(),
  privacy: vi.fn(),
  flag: vi.fn(),
  send: vi.fn(),
  revalidate: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.auth }));
vi.mock('@/lib/admin/roles', () => ({ isAdmin: mocks.isAdmin }));
vi.mock('@/lib/ovie/privacy-lock/server', () => ({
  assertOviePrivacyUnlocked: mocks.privacy,
}));
vi.mock('@/lib/flags/server', () => ({ getAppFlagValue: mocks.flag }));
vi.mock('@/lib/ovie/fleet-room-send.server', () => ({
  sendFleetRoomMessage: mocks.send,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));

const { sendFleetRoomMessageAction } = await import('./actions');

// The action reads a submitted form; build one as the browser would post it.
async function form(fields: Record<string, string> = {}) {
  return new Request('https://jov.ie/app/ov/room', {
    method: 'POST',
    body: new URLSearchParams(fields),
  }).formData();
}

const IDLE = { status: 'idle' } as const;

describe('sendFleetRoomMessageAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'u1' });
    mocks.isAdmin.mockResolvedValue(true);
    mocks.privacy.mockResolvedValue(undefined);
    mocks.flag.mockResolvedValue(true);
  });

  it('posts for an admin with the flag on and refreshes the room', async () => {
    mocks.send.mockResolvedValue({
      status: 'sent',
      eventId: 'linear-comment:c1',
      thread: 'JOV-7998',
    });
    expect(
      await sendFleetRoomMessageAction(
        IDLE,
        await form({ agentId: 'chloe', text: 'hi' })
      )
    ).toEqual({ status: 'sent', message: 'Posted in JOV-7998.' });
    expect(mocks.auth).toHaveBeenCalledWith({ session: 'fresh' });
    expect(mocks.send).toHaveBeenCalledWith({ agentId: 'chloe', text: 'hi' });
    expect(mocks.revalidate).toHaveBeenCalledWith('/app/ov/room');
  });

  it('refuses non-admins and a flag that is off without sending', async () => {
    mocks.isAdmin.mockResolvedValueOnce(false);
    expect(
      (
        await sendFleetRoomMessageAction(
          IDLE,
          await form({ agentId: 'chloe', text: 'hi' })
        )
      ).status
    ).toBe('error');
    mocks.flag.mockResolvedValueOnce(false);
    expect(
      await sendFleetRoomMessageAction(
        IDLE,
        await form({ agentId: 'chloe', text: 'hi' })
      )
    ).toEqual({ status: 'error', message: 'The fleet room is off.' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('turns a refusal or a thrown send into plain copy', async () => {
    mocks.send.mockResolvedValueOnce({ status: 'rejected', reason: 'empty' });
    expect(
      await sendFleetRoomMessageAction(
        IDLE,
        await form({ agentId: 'chloe', text: '' })
      )
    ).toEqual({
      status: 'error',
      message: 'Type a message first.',
    });
    mocks.send.mockRejectedValueOnce(new Error('linear down'));
    expect(await sendFleetRoomMessageAction(IDLE, await form())).toEqual({
      status: 'error',
      message: 'Linear did not take the message. Try again.',
    });
    expect(mocks.captureError).toHaveBeenCalledTimes(1);
  });
});
