import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  resolve: vi.fn(),
  access: vi.fn(),
  reservedHandle: vi.fn(),
  gateEnabled: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock('@/lib/auth/gate', async () => ({
  ...(await vi.importActual('@/lib/auth/canonical-user-state')),
  resolveRequestAuthIdentity: mocks.identity,
  resolveUserState: mocks.resolve,
  getWaitlistAccess: mocks.access,
  getWaitlistReservedHandle: mocks.reservedHandle,
}));
vi.mock('@/lib/waitlist/settings', () => ({
  isWaitlistGateEnabled: mocks.gateEnabled,
}));
vi.mock('@/components/features/waitlist/WaitlistPublicLanding', () => ({
  WaitlistPublicLanding: () => null,
}));
vi.mock('@/components/features/waitlist/WaitlistSuccessView', () => ({
  WaitlistSuccessView: () => null,
}));
vi.mock('@/lib/config/pricing', () => ({
  PRICING: { pro: { monthly: { priceId: 'price_pro_monthly' } } },
}));
vi.mock('@/components/site/MarketingPageContractMarkers', () => ({
  MarketingPageContractMarkers: () => null,
}));

import WaitlistPage from './page';

describe('waitlist receipt reload', () => {
  beforeEach(() => {
    mocks.identity.mockResolvedValue({
      clerkUserId: 'ba-user-1',
      email: 'test@example.com',
    });
    mocks.resolve.mockResolvedValue({
      state: 'WAITLIST_PENDING',
      context: { email: 'test@example.com' },
    });
    mocks.gateEnabled.mockResolvedValue(true);
    mocks.access.mockResolvedValue({ entryId: null, status: null });
    mocks.reservedHandle.mockResolvedValue(null);
  });

  it('renders an honest error when a pending account has no saved receipt', async () => {
    const result = await WaitlistPage();
    const receipt = result.props.children;

    expect(receipt.props.outcome).toBe('receipt_unavailable');
    expect(receipt.props.email).toBe('test@example.com');
  });

  it('passes the held handle to the pending receipt so copy can claim it', async () => {
    mocks.access.mockResolvedValue({
      entryId: 'entry_1',
      status: 'waitlisted',
    });
    mocks.reservedHandle.mockResolvedValue('coolartist');

    const result = await WaitlistPage();
    const receipt = result.props.children;

    expect(mocks.reservedHandle).toHaveBeenCalledWith('entry_1');
    expect(receipt.props.reservedHandle).toBe('coolartist');
    expect(receipt.props.email).toBe('test@example.com');
    // Anyone waiting can buy Pro now; payment admits them (JOV-7701).
    expect(receipt.props.proCheckoutPriceId).toBe('price_pro_monthly');
  });
});
