import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canUseOvChatMode, parseChatMode } from '@/lib/chat/ov-mode';

const { isAdminMock, privacyMock, authMock } = vi.hoisted(() => ({
  privacyMock: vi.fn(),
  authMock: vi.fn(),
  isAdminMock: vi.fn<(userId: string) => Promise<boolean>>(),
}));

vi.mock('@/lib/ovie/privacy-lock/server', () => ({
  assertOviePrivacyUnlocked: privacyMock,
}));
vi.mock('@/lib/auth/cached', () => ({ getFreshAuth: authMock }));
vi.mock('@/lib/admin/roles', () => ({
  isAdmin: isAdminMock,
}));

describe('parseChatMode', () => {
  it('treats an omitted chatMode as customer mode', () => {
    expect(parseChatMode(undefined)).toEqual({ ok: true, chatMode: null });
    expect(parseChatMode(null)).toEqual({ ok: true, chatMode: null });
  });

  it("accepts only the literal 'ov'", () => {
    expect(parseChatMode('ov')).toEqual({ ok: true, chatMode: 'ov' });
  });

  it('rejects any other value', () => {
    expect(parseChatMode('admin')).toEqual({ ok: false });
    expect(parseChatMode('OV')).toEqual({ ok: false });
    expect(parseChatMode('')).toEqual({ ok: false });
    expect(parseChatMode(1)).toEqual({ ok: false });
    expect(parseChatMode({ mode: 'ov' })).toEqual({ ok: false });
  });
});

describe('canUseOvChatMode', () => {
  beforeEach(() => {
    isAdminMock.mockReset();
    privacyMock.mockResolvedValue(undefined);
    authMock.mockResolvedValue({ userId: 'user_1', sessionId: 's1' });
  });

  it('fails closed without a user id', async () => {
    await expect(canUseOvChatMode(null)).resolves.toBe(false);
    expect(isAdminMock).not.toHaveBeenCalled();
  });

  it('denies non-admin users', async () => {
    isAdminMock.mockResolvedValue(false);
    await expect(canUseOvChatMode('user_1')).resolves.toBe(false);
    expect(isAdminMock).toHaveBeenCalledWith('user_1');
  });

  it('allows admin users', async () => {
    isAdminMock.mockResolvedValue(true);
    await expect(canUseOvChatMode('user_1')).resolves.toBe(true);
    expect(isAdminMock).toHaveBeenCalledWith('user_1');
  });
  it('denies locked operator chat without affecting omitted customer mode', async () => {
    isAdminMock.mockResolvedValue(true);
    privacyMock.mockRejectedValue(Error('Locked'));
    expect(await canUseOvChatMode('user_1')).toBe(false);
    expect(parseChatMode(undefined)).toEqual({ ok: true, chatMode: null });
  });
  it('rejects identity/session mismatch', async () => {
    isAdminMock.mockResolvedValue(true);
    authMock.mockResolvedValue({ userId: 'other_user', sessionId: 's1' });
    expect(await canUseOvChatMode('user_1')).toBe(false);
  });
});
