import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import WaitlistPage from '@/app/waitlist/page';
import { CanonicalUserState } from '@/lib/auth/canonical-user-state';

const {
  mockGetWaitlistAccess,
  mockGetWaitlistReservedHandle,
  mockNotFound,
  mockRedirect,
  mockResolveStartEntryProfile,
  mockResolveUserState,
} = vi.hoisted(() => ({
  mockGetWaitlistAccess: vi.fn(),
  mockGetWaitlistReservedHandle: vi.fn(),
  mockNotFound: vi.fn(),
  mockRedirect: vi.fn(),
  mockResolveStartEntryProfile: vi.fn(),
  mockResolveUserState: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error('NEXT_REDIRECT');
  },
  notFound: (...args: unknown[]) => {
    mockNotFound(...args);
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('@/lib/auth/gate', async () => ({
  CanonicalUserState: (await import('@/lib/auth/canonical-user-state'))
    .CanonicalUserState,
  getWaitlistAccess: mockGetWaitlistAccess,
  getWaitlistReservedHandle: mockGetWaitlistReservedHandle,
  resolveUserState: mockResolveUserState,
}));

vi.mock('@/lib/onboarding/start-entry-profile.server', () => ({
  resolveStartEntryProfile: mockResolveStartEntryProfile,
}));

describe('WaitlistPage', () => {
  beforeEach(() => {
    mockGetWaitlistAccess.mockReset();
    mockGetWaitlistReservedHandle.mockReset();
    mockGetWaitlistReservedHandle.mockResolvedValue(null);
    mockNotFound.mockClear();
    mockRedirect.mockClear();
    mockResolveStartEntryProfile.mockReset();
    mockResolveStartEntryProfile.mockResolvedValue(null);
    mockResolveUserState.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test.each([
    { state: CanonicalUserState.BANNED, expectedRedirect: '/unavailable' },
    {
      state: CanonicalUserState.USER_CREATION_FAILED,
      expectedRedirect: '/error/user-creation-failed',
    },
    { state: CanonicalUserState.ACTIVE, expectedRedirect: '/app' },
    { state: CanonicalUserState.NEEDS_ONBOARDING, expectedRedirect: '/start' },
    { state: CanonicalUserState.NEEDS_DB_USER, expectedRedirect: '/start' },
    {
      state: CanonicalUserState.NEEDS_WAITLIST_SUBMISSION,
      expectedRedirect: '/start',
    },
  ])(
    'server-side redirects $state users to $expectedRedirect',
    async ({ state, expectedRedirect }) => {
      mockRedirect.mockClear();
      mockNotFound.mockClear();
      mockResolveUserState.mockResolvedValue({
        state,
        context: { email: 'artist@example.com' },
      });

      await expect(WaitlistPage()).rejects.toThrow('NEXT_REDIRECT');
      expect(mockRedirect).toHaveBeenCalledTimes(1);
      expect(mockRedirect).toHaveBeenCalledWith(expectedRedirect);
      expect(mockNotFound).not.toHaveBeenCalled();
    }
  );

  test('renders the public waitlist entry for signed-out visitors', async () => {
    mockRedirect.mockClear();
    mockNotFound.mockClear();
    mockResolveUserState.mockResolvedValue({
      state: CanonicalUserState.UNAUTHENTICATED,
      context: { email: null },
    });

    const { WaitlistPublicLanding } = await import(
      '@/components/features/waitlist/WaitlistPublicLanding'
    );

    const result = await WaitlistPage();

    expect(result.type.name).toBe('WaitlistRouteWithContract');
    expect(result.props.children.type).toBe(WaitlistPublicLanding);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(mockResolveUserState).toHaveBeenCalledWith({
      createDbUserIfMissing: false,
    });
    expect(mockGetWaitlistAccess).not.toHaveBeenCalled();
    expect(result.props.children.props.signInHref).toBe(
      '/signin?redirect_url=%2Fwaitlist'
    );
  });

  test('preserves a validated entry handoff through verified sign-in', async () => {
    mockResolveUserState.mockResolvedValue({
      state: CanonicalUserState.UNAUTHENTICATED,
      context: { email: null },
    });

    const result = await WaitlistPage({
      searchParams: Promise.resolve({
        starter_prompt: 'Help me launch this release',
      }),
    });
    const landing = result.props.children;

    expect(landing.props.starterHandoff).toEqual({
      kind: 'prompt',
      prompt: 'Help me launch this release',
    });
    expect(landing.props.signInHref).toContain(
      'redirect_url=%2Fwaitlist%3Fstarter_prompt%3DHelp%2Bme%2Blaunch%2Bthis%2Brelease'
    );
    expect(mockResolveStartEntryProfile).not.toHaveBeenCalled();
  });

  test('renders the anonymous entry during the DB-less public route smoke', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    mockRedirect.mockClear();
    mockNotFound.mockClear();
    mockResolveUserState.mockClear();

    const { WaitlistPublicLanding } = await import(
      '@/components/features/waitlist/WaitlistPublicLanding'
    );

    const result = await WaitlistPage();

    expect(result.type.name).toBe('WaitlistRouteWithContract');
    expect(result.props.children.type).toBe(WaitlistPublicLanding);
    expect(mockResolveUserState).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  test('fails closed when canonical pending state has no durable row', async () => {
    mockResolveUserState.mockResolvedValue({
      state: CanonicalUserState.WAITLIST_PENDING,
      context: { email: 'artist@example.com' },
    });
    mockGetWaitlistAccess.mockResolvedValue({
      entryId: null,
      status: null,
      statusReason: null,
    });

    const { WaitlistSuccessView } = await import(
      '@/components/features/waitlist/WaitlistSuccessView'
    );

    const result = await WaitlistPage();

    expect(mockGetWaitlistAccess).toHaveBeenCalledWith('artist@example.com');
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(result.type.name).toBe('WaitlistRouteWithContract');
    expect(result.props.children.type).toBe(WaitlistSuccessView);
    expect(result.props.children.props.outcome).toBe('receipt_unavailable');
  });

  test('renders the waitlist confirmation view without redirecting for WAITLIST_PENDING', async () => {
    mockRedirect.mockClear();
    mockNotFound.mockClear();
    mockResolveUserState.mockResolvedValue({
      state: CanonicalUserState.WAITLIST_PENDING,
      context: { email: 'artist@example.com' },
    });
    mockGetWaitlistAccess.mockResolvedValue({
      entryId: 'entry-1',
      status: 'waitlisted',
      statusReason: 'chat_started',
    });
    mockGetWaitlistReservedHandle.mockResolvedValue('tim');

    const { WaitlistSuccessView } = await import(
      '@/components/features/waitlist/WaitlistSuccessView'
    );

    const result = await WaitlistPage();

    expect(mockResolveUserState).toHaveBeenCalledWith({
      createDbUserIfMissing: false,
    });
    expect(mockGetWaitlistReservedHandle).toHaveBeenCalledWith('entry-1');
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(result.type.name).toBe('WaitlistRouteWithContract');
    expect(result.props.children.type).toBe(WaitlistSuccessView);
    expect(result.props.children.props.reservedHandle).toBe('tim');
    expect(result.props.children.props.outcome).toBe('pending');
  });

  test.each(['rejected', 'expired', 'blocked'] as const)(
    'never mistakes a %s row for a pending receipt',
    async status => {
      mockResolveUserState.mockResolvedValue({
        state: CanonicalUserState.WAITLIST_PENDING,
        context: { email: 'artist@example.com' },
      });
      mockGetWaitlistAccess.mockResolvedValue({
        entryId: 'terminal-entry',
        status,
        statusReason: 'terminal',
      });

      const result = await WaitlistPage();

      expect(result.props.children.props.outcome).toBe('receipt_unavailable');
      expect(mockGetWaitlistReservedHandle).not.toHaveBeenCalled();
    }
  );

  test.each([
    CanonicalUserState.WAITLIST_PENDING,
    CanonicalUserState.NEEDS_WAITLIST_SUBMISSION,
    CanonicalUserState.NEEDS_DB_USER,
  ])(
    'never renders saved confirmation for %s without a durable pending entry',
    async state => {
      mockRedirect.mockClear();
      mockNotFound.mockClear();
      mockResolveUserState.mockResolvedValue({
        state,
        context: { email: 'artist@example.com' },
      });
      mockGetWaitlistAccess.mockResolvedValue({
        entryId: null,
        status: null,
        statusReason: null,
      });

      if (state === CanonicalUserState.WAITLIST_PENDING) {
        const { WaitlistSuccessView } = await import(
          '@/components/features/waitlist/WaitlistSuccessView'
        );
        const result = await WaitlistPage();
        expect(result.props.children.type).toBe(WaitlistSuccessView);
        expect(result.props.children.props.outcome).toBe('receipt_unavailable');
        expect(mockRedirect).not.toHaveBeenCalled();
        expect(mockNotFound).not.toHaveBeenCalled();
        return;
      }

      await expect(WaitlistPage()).rejects.toThrow('NEXT_REDIRECT');
      expect(mockRedirect).toHaveBeenCalledWith('/start');
      expect(mockNotFound).not.toHaveBeenCalled();
    }
  );
});
