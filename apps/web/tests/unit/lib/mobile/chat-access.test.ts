import { afterEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getAppFlagValueMock: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: hoisted.getAppFlagValueMock,
}));

const { isMobileChatEnabled, isMobileChatRuntimeEnabled } = await import(
  '@/lib/mobile/chat/access'
);

describe('isMobileChatRuntimeEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true when MOBILE_CHAT_RUNTIME_ENABLED=true', () => {
    vi.stubEnv('MOBILE_CHAT_RUNTIME_ENABLED', 'true');
    expect(isMobileChatRuntimeEnabled()).toBe(true);
  });

  it('returns false when MOBILE_CHAT_RUNTIME_ENABLED is not set', () => {
    vi.stubEnv('MOBILE_CHAT_RUNTIME_ENABLED', '');
    expect(isMobileChatRuntimeEnabled()).toBe(false);
  });
});

describe('isMobileChatEnabled', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns false when runtime switch is off, skipping the per-user gate', async () => {
    vi.stubEnv('MOBILE_CHAT_RUNTIME_ENABLED', '');
    await expect(isMobileChatEnabled('user_123')).resolves.toBe(false);
    expect(hoisted.getAppFlagValueMock).not.toHaveBeenCalled();
  });

  it('returns true when runtime switch is on and alpha gate is not enabled', async () => {
    vi.stubEnv('MOBILE_CHAT_RUNTIME_ENABLED', 'true');
    await expect(isMobileChatEnabled('user_123')).resolves.toBe(true);
    expect(hoisted.getAppFlagValueMock).not.toHaveBeenCalled();
  });

  it('checks IOS_APP_ALPHA_ACCESS flag when MOBILE_CHAT_ALPHA_GATE_ENABLED=true and user has access', async () => {
    vi.stubEnv('MOBILE_CHAT_RUNTIME_ENABLED', 'true');
    vi.stubEnv('MOBILE_CHAT_ALPHA_GATE_ENABLED', 'true');
    hoisted.getAppFlagValueMock.mockResolvedValue(true);

    await expect(isMobileChatEnabled('user_123')).resolves.toBe(true);
    expect(hoisted.getAppFlagValueMock).toHaveBeenCalledWith(
      'IOS_APP_ALPHA_ACCESS',
      { userId: 'user_123' }
    );
  });

  it('returns false when alpha gate is enabled and user lacks the flag', async () => {
    vi.stubEnv('MOBILE_CHAT_RUNTIME_ENABLED', 'true');
    vi.stubEnv('MOBILE_CHAT_ALPHA_GATE_ENABLED', 'true');
    hoisted.getAppFlagValueMock.mockResolvedValue(false);

    await expect(isMobileChatEnabled('user_123')).resolves.toBe(false);
  });

  it('returns false when alpha gate is enabled and userId is null', async () => {
    vi.stubEnv('MOBILE_CHAT_RUNTIME_ENABLED', 'true');
    vi.stubEnv('MOBILE_CHAT_ALPHA_GATE_ENABLED', 'true');
    hoisted.getAppFlagValueMock.mockResolvedValue(false);

    await expect(isMobileChatEnabled(null)).resolves.toBe(false);
    expect(hoisted.getAppFlagValueMock).toHaveBeenCalledWith(
      'IOS_APP_ALPHA_ACCESS',
      { userId: null }
    );
  });
});
