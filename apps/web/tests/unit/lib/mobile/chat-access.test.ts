import { afterEach, describe, expect, it, vi } from 'vitest';

const { isMobileChatEnabled, isMobileChatRuntimeEnabled } = await import(
  '@/lib/mobile/chat/access'
);

describe('isMobileChatRuntimeEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true without an environment rollout flag', () => {
    vi.stubEnv('MOBILE_CHAT_RUNTIME_ENABLED', '');
    expect(isMobileChatRuntimeEnabled()).toBe(true);
  });

  it('ignores the old alpha gate environment switch', () => {
    vi.stubEnv('MOBILE_CHAT_ALPHA_GATE_ENABLED', 'true');
    expect(isMobileChatRuntimeEnabled()).toBe(true);
  });
});

describe('isMobileChatEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true for an authenticated mobile user without rollout env', async () => {
    vi.stubEnv('MOBILE_CHAT_RUNTIME_ENABLED', '');
    await expect(isMobileChatEnabled('user_123')).resolves.toBe(true);
  });

  it('ignores the old per-user alpha gate for authenticated users', async () => {
    vi.stubEnv('MOBILE_CHAT_RUNTIME_ENABLED', '');
    vi.stubEnv('MOBILE_CHAT_ALPHA_GATE_ENABLED', 'true');
    await expect(isMobileChatEnabled('user_123')).resolves.toBe(true);
  });

  it('returns false when userId is null', async () => {
    vi.stubEnv('MOBILE_CHAT_RUNTIME_ENABLED', '');
    vi.stubEnv('MOBILE_CHAT_ALPHA_GATE_ENABLED', 'true');
    await expect(isMobileChatEnabled(null)).resolves.toBe(false);
  });
});
