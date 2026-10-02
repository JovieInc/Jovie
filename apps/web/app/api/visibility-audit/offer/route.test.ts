import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAppFlagValue: vi.fn(),
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: mocks.getAppFlagValue,
}));

import { GET } from './route';

describe('/api/visibility-audit/offer', () => {
  beforeEach(() => {
    mocks.getAppFlagValue.mockReset();
    vi.stubEnv('VISIBILITY_AUDIT_PAYMENT_LINK_URL', '');
  });

  it('returns visible false when the flag is off', async () => {
    mocks.getAppFlagValue.mockResolvedValue(false);
    vi.stubEnv(
      'VISIBILITY_AUDIT_PAYMENT_LINK_URL',
      'https://buy.stripe.com/test_a1b2c3'
    );
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ visible: false });
  });

  it('returns the payment link when the flag and URL are both set', async () => {
    mocks.getAppFlagValue.mockResolvedValue(true);
    vi.stubEnv(
      'VISIBILITY_AUDIT_PAYMENT_LINK_URL',
      'https://buy.stripe.com/test_a1b2c3'
    );
    const response = await GET();
    const body = await response.json();
    expect(body.visible).toBe(true);
    expect(body.href).toBe('https://buy.stripe.com/test_a1b2c3');
    expect(body.priceUsd).toBe(199);
  });
});
