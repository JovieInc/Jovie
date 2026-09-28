import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  resolve: vi.fn(),
  access: vi.fn(),
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
  });

  it('renders an honest error when a pending account has no saved receipt', async () => {
    const result = await WaitlistPage();
    const receipt = result.props.children;

    expect(receipt.props.outcome).toBe('receipt_unavailable');
    expect(receipt.props.email).toBe('test@example.com');
  });
});
