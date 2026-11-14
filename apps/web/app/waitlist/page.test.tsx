import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  resolve: vi.fn(),
  access: vi.fn(),
  reservedHandle: vi.fn(),
  gateEnabled: vi.fn(),
  signupClosed: vi.fn(),
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
vi.mock('@/lib/waitlist/public-signup-gate', () => ({
  isPublicSignupClosed: mocks.signupClosed,
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
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '0');
    mocks.identity.mockResolvedValue({
      clerkUserId: 'ba-user-1',
      email: 'test@example.com',
    });
    mocks.resolve.mockResolvedValue({
      state: 'WAITLIST_PENDING',
      context: { email: 'test@example.com' },
    });
    mocks.gateEnabled.mockResolvedValue(true);
    mocks.signupClosed.mockReturnValue(true);
    mocks.access.mockResolvedValue({ entryId: null, status: null });
    mocks.reservedHandle.mockResolvedValue(null);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('hands anonymous visitors to /start when public signup is open', async () => {
    mocks.resolve.mockResolvedValue({ state: 'UNAUTHENTICATED', context: {} });
    mocks.signupClosed.mockReturnValue(false);

    await expect(WaitlistPage()).rejects.toThrow(
      `redirect:${APP_ROUTES.START}`
    );
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it('keeps the public waitlist form when public signup is closed', async () => {
    mocks.resolve.mockResolvedValue({ state: 'UNAUTHENTICATED', context: {} });

    const result = await WaitlistPage();

    expect(result.props.children.props.signupClosed).toBe(true);
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it('renders an honest error when a pending account has no saved receipt', async () => {
    const result = await WaitlistPage();
    const receipt = result.props.children;

    expect(receipt.props.outcome).toBe('receipt_unavailable');
    expect(receipt.props.email).toBe('test@example.com');
  });

  it('passes the held handle to the pending receipt so copy can claim it', async () => {
    mocks.signupClosed.mockReturnValue(false);
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
    // Invite-only GTM: the waitlist receipt never carries a paid ask.
    expect(receipt.props.proCheckoutPriceId).toBeUndefined();
  });

  it('smoke runtime: hands an anonymous visitor to /start with signup open (prod parity)', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    mocks.resolve.mockResolvedValue({ state: 'UNAUTHENTICATED', context: {} });
    mocks.signupClosed.mockReturnValue(false);

    await expect(WaitlistPage()).rejects.toThrow(
      `redirect:${APP_ROUTES.START}`
    );
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it('smoke runtime: keeps the landing when public signup is closed', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    mocks.resolve.mockResolvedValue({ state: 'UNAUTHENTICATED', context: {} });
    mocks.signupClosed.mockReturnValue(true);

    const result = await WaitlistPage();

    expect(result.props.children.props.signupClosed).toBe(true);
  });

  it('smoke runtime: a synthetic actor the DB-less gate cannot resolve keeps the landing', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    mocks.resolve.mockRejectedValue(new Error('noop database'));
    mocks.signupClosed.mockReturnValue(false);

    const result = await WaitlistPage();

    expect(result.props.children.props.signupClosed).toBe(false);
  });
});
