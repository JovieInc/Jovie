import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAppFlagsSnapshot: vi.fn(async () => ({ CHAT_JANK_MONITOR: false })),
  providerProps: [] as Array<{
    forceSignedOutDefaults?: boolean;
    skipCoreProviders?: boolean;
  }>,
  resolveStartRouteFlagNames: vi.fn(() => ['CHAT_JANK_MONITOR']),
  getRequestSession: vi.fn<() => Promise<Record<string, unknown> | null>>(
    async () => null
  ),
}));

vi.mock('@/lib/auth/request-session', () => ({
  getRequestSession: mocks.getRequestSession,
}));

vi.mock('@/components/providers/ResolvedClientProviders', () => ({
  ResolvedClientProviders: ({
    children,
    forceSignedOutDefaults,
    skipCoreProviders,
  }: {
    readonly children: ReactNode;
    readonly forceSignedOutDefaults?: boolean;
    readonly skipCoreProviders?: boolean;
  }) => {
    mocks.providerProps.push({ forceSignedOutDefaults, skipCoreProviders });

    return <div data-testid='resolved-client-providers'>{children}</div>;
  },
}));

vi.mock('@/lib/flags/client', () => ({
  AppFlagProvider: ({ children }: { readonly children: ReactNode }) => (
    <div data-testid='app-flag-provider'>{children}</div>
  ),
}));

vi.mock('@/lib/flags/route-snapshots', () => ({
  resolveStartRouteFlagNames: mocks.resolveStartRouteFlagNames,
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagsSnapshot: mocks.getAppFlagsSnapshot,
}));

afterEach(() => {
  mocks.getAppFlagsSnapshot.mockClear();
  mocks.providerProps.length = 0;
  mocks.resolveStartRouteFlagNames.mockClear();
  mocks.getRequestSession.mockClear();
  mocks.getRequestSession.mockImplementation(async () => null);
  vi.unstubAllEnvs();
});

describe('start route layout', () => {
  it('uses signed-out defaults only for local public no-auth smoke runs', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    vi.stubEnv('VERCEL_ENV', '');
    const { default: StartLayout } = await import('./layout');

    render(await StartLayout({ children: <div data-testid='child' /> }));

    expect(screen.getByTestId('resolved-client-providers')).toBeInTheDocument();
    expect(screen.getByTestId('app-flag-provider')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(mocks.providerProps).toEqual([
      { forceSignedOutDefaults: true, skipCoreProviders: true },
    ]);
    expect(mocks.getAppFlagsSnapshot).toHaveBeenCalledWith({
      flagNames: ['CHAT_JANK_MONITOR'],
    });
  });

  it('keeps live auth enabled for secure Vercel smoke runs', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    const { default: StartLayout } = await import('./layout');

    render(await StartLayout({ children: <div data-testid='child' /> }));

    expect(mocks.providerProps).toEqual([
      { forceSignedOutDefaults: false, skipCoreProviders: true },
    ]);
  });

  it('keeps live auth enabled for the real-auth Golden Path on loopback', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    vi.stubEnv('E2E_TEST_MODE', '1');
    vi.stubEnv('VERCEL_ENV', '');
    const { default: StartLayout } = await import('./layout');

    render(await StartLayout({ children: <div data-testid='child' /> }));

    expect(mocks.providerProps).toEqual([
      { forceSignedOutDefaults: false, skipCoreProviders: true },
    ]);
  });

  it('uses signed-out defaults for local Playwright E2E runs', async () => {
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '1');
    vi.stubEnv('VERCEL_ENV', '');
    const { default: StartLayout } = await import('./layout');

    render(await StartLayout({ children: <div data-testid='child' /> }));

    expect(mocks.providerProps).toEqual([
      { forceSignedOutDefaults: true, skipCoreProviders: true },
    ]);
  });

  it('keeps the live cookie-backed provider for a real bypass session (JOV-7653)', async () => {
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '1');
    vi.stubEnv('VERCEL_ENV', '');
    mocks.getRequestSession.mockImplementation(async () => ({
      session: { userId: 'ba_dev_creator-id' },
      user: { id: 'ba_dev_creator-id' },
    }));
    const { default: StartLayout } = await import('./layout');

    render(await StartLayout({ children: <div data-testid='child' /> }));

    // A real session must not be forced signed-out: the forced defaults made
    // the boundary's restore identity mismatch (invalid-restore) and wedged
    // the nightly auth.setup.
    expect(mocks.providerProps).toEqual([
      { forceSignedOutDefaults: false, skipCoreProviders: true },
    ]);
  });

  it.each(['production', 'preview'])(
    'never reads the session on a secure %s deployment',
    async vercelEnv => {
      vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
      vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '1');
      vi.stubEnv('VERCEL_ENV', vercelEnv);
      const { default: StartLayout } = await import('./layout');

      render(await StartLayout({ children: <div data-testid='child' /> }));

      expect(mocks.getRequestSession).not.toHaveBeenCalled();
      expect(mocks.providerProps).toEqual([
        { forceSignedOutDefaults: false, skipCoreProviders: true },
      ]);
    }
  );

  it('never reads the session when no smoke or E2E flag asks for forced defaults', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
    vi.stubEnv('VERCEL_ENV', '');
    const { default: StartLayout } = await import('./layout');

    render(await StartLayout({ children: <div data-testid='child' /> }));

    expect(mocks.getRequestSession).not.toHaveBeenCalled();
    expect(mocks.providerProps).toEqual([
      { forceSignedOutDefaults: false, skipCoreProviders: true },
    ]);
  });

  it('reads flags while the session read is still pending', async () => {
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '1');
    vi.stubEnv('VERCEL_ENV', '');
    let resolveSession: (session: null) => void = () => {};
    mocks.getRequestSession.mockImplementation(
      () =>
        new Promise<null>(resolve => {
          resolveSession = resolve;
        })
    );
    const { default: StartLayout } = await import('./layout');

    const pending = StartLayout({ children: <div data-testid='child' /> });

    await vi.waitFor(() => {
      expect(mocks.getRequestSession).toHaveBeenCalledWith('cookie');
      expect(mocks.getAppFlagsSnapshot).toHaveBeenCalledOnce();
    });

    resolveSession(null);
    render(await pending);
    expect(mocks.providerProps).toEqual([
      { forceSignedOutDefaults: true, skipCoreProviders: true },
    ]);
  });

  it('falls back to forced defaults when the session read cannot resolve (DB-less capture)', async () => {
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '1');
    vi.stubEnv('VERCEL_ENV', '');
    mocks.getRequestSession.mockImplementation(async () => {
      throw new Error('no database');
    });
    const { default: StartLayout } = await import('./layout');

    render(await StartLayout({ children: <div data-testid='child' /> }));

    expect(mocks.providerProps).toEqual([
      { forceSignedOutDefaults: true, skipCoreProviders: true },
    ]);
  });
});
