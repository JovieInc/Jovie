import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAppFlagsSnapshot: vi.fn(async () => ({ CHAT_JANK_MONITOR: false })),
  providerProps: [] as Array<{
    forceBypassClerk?: boolean;
    skipCoreProviders?: boolean;
  }>,
  resolveStartRouteFlagNames: vi.fn(() => ['CHAT_JANK_MONITOR']),
}));

vi.mock('@/components/providers/ResolvedClientProviders', () => ({
  ResolvedClientProviders: ({
    children,
    forceBypassClerk,
    skipCoreProviders,
  }: {
    readonly children: ReactNode;
    readonly forceBypassClerk?: boolean;
    readonly skipCoreProviders?: boolean;
  }) => {
    mocks.providerProps.push({ forceBypassClerk, skipCoreProviders });

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
  vi.unstubAllEnvs();
});

describe('start route layout', () => {
  it('bypasses Clerk only for local public no-auth smoke runs', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    vi.stubEnv('VERCEL_ENV', '');
    const { default: StartLayout } = await import('./layout');

    render(await StartLayout({ children: <div data-testid='child' /> }));

    expect(screen.getByTestId('resolved-client-providers')).toBeInTheDocument();
    expect(screen.getByTestId('app-flag-provider')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(mocks.providerProps).toEqual([
      { forceBypassClerk: true, skipCoreProviders: true },
    ]);
    expect(mocks.getAppFlagsSnapshot).toHaveBeenCalledWith({
      flagNames: ['CHAT_JANK_MONITOR'],
    });
  });

  it('keeps Clerk enabled for secure Vercel smoke runs', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    const { default: StartLayout } = await import('./layout');

    render(await StartLayout({ children: <div data-testid='child' /> }));

    expect(mocks.providerProps).toEqual([
      { forceBypassClerk: false, skipCoreProviders: true },
    ]);
  });

  it('keeps live auth enabled for the real-auth Golden Path on loopback', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    vi.stubEnv('E2E_TEST_MODE', '1');
    vi.stubEnv('VERCEL_ENV', '');
    const { default: StartLayout } = await import('./layout');

    render(await StartLayout({ children: <div data-testid='child' /> }));

    expect(mocks.providerProps).toEqual([
      { forceBypassClerk: false, skipCoreProviders: true },
    ]);
  });

  it('bypasses Clerk for local Playwright E2E runs', async () => {
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '1');
    vi.stubEnv('VERCEL_ENV', '');
    const { default: StartLayout } = await import('./layout');

    render(await StartLayout({ children: <div data-testid='child' /> }));

    expect(mocks.providerProps).toEqual([
      { forceBypassClerk: true, skipCoreProviders: true },
    ]);
  });
});
