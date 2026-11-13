import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  limit: vi.fn(),
  retrieve: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: mocks.profile }) }),
    }),
  },
}));
vi.mock('@/lib/rate-limit', () => ({
  getClientIP: () => '192.0.2.1',
  tipCheckoutLimiter: { limit: mocks.limit },
}));
vi.mock('@/lib/stripe/client', () => ({
  stripe: { checkout: { sessions: { retrieve: mocks.retrieve } } },
}));
vi.mock('@/lib/stripe/retry', () => ({
  withStripeRetry: (_name: string, run: () => Promise<unknown>) => run(),
}));

import { resolveTipCheckoutReturn } from './checkout-return.server';

const session = {
  status: 'complete',
  payment_status: 'paid',
  mode: 'payment',
  metadata: {
    source: 'tip_checkout',
    profile_id: 'profile-1',
    handle: 'artist',
  },
  customer_details: { email: 'private@example.com', name: 'Private Payer' },
};
const check = (id: string | string[] | undefined = 'cs_test_123') =>
  resolveTipCheckoutReturn('Artist', id, new Headers());

describe('tip checkout return verification', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.limit.mockResolvedValue({ success: true });
    mocks.profile.mockResolvedValue([{ id: 'profile-1', isPublic: true }]);
    mocks.retrieve.mockResolvedValue(session);
  });

  it.each(
    [
      undefined,
      '',
      'paid',
      'cs_test_<script>',
      ['cs_test_123'],
      `cs_test_${'a'.repeat(201)}`,
    ].map(id => ({ id }))
  )(
    'rejects missing or invalid session $id without provider calls',
    async ({ id }) => {
      expect(await resolveTipCheckoutReturn('artist', id, new Headers())).toBe(
        'unverified'
      );
      expect(mocks.retrieve).not.toHaveBeenCalled();
      expect(mocks.profile).not.toHaveBeenCalled();
    }
  );

  it('confirms only a completed paid tip for this recipient and exposes no payer data', async () => {
    expect(await check()).toBe('confirmed');
    expect(mocks.retrieve).toHaveBeenCalledWith(
      'cs_test_123',
      {},
      { timeout: 5000, maxNetworkRetries: 0 }
    );
    expect(mocks.limit).toHaveBeenCalledWith('return:192.0.2.1');
  });

  it.each([
    { mode: 'subscription' },
    { metadata: null },
    { metadata: { ...session.metadata, source: 'merch' } },
    { metadata: { ...session.metadata, profile_id: 'another-recipient' } },
    { metadata: { ...session.metadata, handle: 'another-artist' } },
  ])('does not attribute someone else’s session: %j', async mismatch => {
    mocks.retrieve.mockResolvedValue({ ...session, ...mismatch });
    expect(await check()).toBe('unverified');
  });

  it.each([
    { profiles: [] },
    { profiles: [{ id: 'profile-1', isPublic: false }] },
  ])(
    'does not disclose private or missing profile payment state',
    async ({ profiles }) => {
      mocks.profile.mockResolvedValue(profiles);
      expect(await check()).toBe('unverified');
      expect(mocks.retrieve).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['complete', 'unpaid', 'pending'],
    ['open', 'unpaid', 'incomplete'],
    ['expired', 'unpaid', 'incomplete'],
    ['complete', 'no_payment_required', 'incomplete'],
    ['open', 'paid', 'incomplete'],
  ])(
    'handles %s/%s without false success',
    async (status, payment_status, expected) => {
      mocks.retrieve.mockResolvedValue({ ...session, status, payment_status });
      expect(await check()).toBe(expected);
    }
  );

  it('rechecks on repeated navigation, without creating or fulfilling payments', async () => {
    mocks.retrieve.mockResolvedValueOnce({
      ...session,
      payment_status: 'unpaid',
    });
    expect(await check()).toBe('pending');
    expect(await check()).toBe('confirmed');
    expect(mocks.retrieve).toHaveBeenCalledTimes(2);
  });

  it('fails closed if the limiter denies or fails', async () => {
    mocks.limit.mockResolvedValueOnce({ success: false });
    expect(await check()).toBe('unavailable');
    mocks.limit.mockRejectedValueOnce(new Error('unavailable'));
    expect(await check()).toBe('unavailable');
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it('treats a nonexistent Stripe session as unverified without leaking its error', async () => {
    mocks.retrieve.mockRejectedValueOnce(
      Object.assign(new Error('private session data'), {
        code: 'resource_missing',
      })
    );
    expect(await check()).toBe('unverified');
  });

  it('fails closed on provider errors and database failures', async () => {
    mocks.retrieve.mockRejectedValueOnce(
      new Error('No such checkout session: private session data')
    );
    expect(await check()).toBe('unavailable');
    mocks.profile.mockRejectedValueOnce(new Error('db unavailable'));
    expect(await check()).toBe('unavailable');
  });
});
