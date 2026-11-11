import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isWaitlistGateEnabled: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/lib/waitlist/settings', () => ({
  isWaitlistGateEnabled: mocks.isWaitlistGateEnabled,
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
}));

import { isChatAccessControlled } from '@/lib/waitlist/onboarding-access-gate';

describe('isChatAccessControlled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isWaitlistGateEnabled.mockResolvedValue(false);
  });
  afterEach(() => {
    delete process.env.FEATURE_PUBLIC_SIGNUP_CLOSED;
  });

  it('controls an anonymous chat while signup is closed, even with the DB gate off', async () => {
    await expect(isChatAccessControlled(false, 'req')).resolves.toBe(true);
    expect(mocks.isWaitlistGateEnabled).not.toHaveBeenCalled();
  });

  it('lets the DB gate decide for a signed-in chat', async () => {
    await expect(isChatAccessControlled(true, 'req')).resolves.toBe(false);
    mocks.isWaitlistGateEnabled.mockResolvedValue(true);
    await expect(isChatAccessControlled(true, 'req')).resolves.toBe(true);
  });

  it('lets the DB gate decide for an anonymous chat once signup reopens', async () => {
    process.env.FEATURE_PUBLIC_SIGNUP_CLOSED = 'false';
    await expect(isChatAccessControlled(false, 'req')).resolves.toBe(false);
  });

  it('fails closed when the gate setting cannot be read', async () => {
    mocks.isWaitlistGateEnabled.mockRejectedValue(new Error('down'));
    await expect(isChatAccessControlled(true, 'req-1')).resolves.toBe(true);
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });
});
