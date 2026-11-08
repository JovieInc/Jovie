import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Which routes mount Vercel Web Analytics. CoreProviders decides it: through
// LazyProviders on the provider tree, or directly on the homepage's
// provider-free shell. The homepage and pricing are the top of the signup
// funnel, so a visitor who lands there must send a pageview.

const pathnameRef = vi.hoisted(() => {
  // Production ships with theme switching off; start from that build.
  delete process.env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING;
  return { current: '/' };
});

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameRef.current,
}));
vi.mock('@/lib/env-client', () => ({
  env: { IS_TEST: false, IS_E2E: false, IS_DEV: false },
}));
vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('./DeferredAnalytics', () => ({
  DeferredAnalytics: () => <span data-testid='vercel-analytics' />,
}));
vi.mock('./LazyProviders', () => ({
  LazyProviders: ({
    children,
    enableAnalytics,
  }: {
    children: ReactNode;
    enableAnalytics?: boolean;
  }) => (
    <>
      {children}
      {enableAnalytics ? <span data-testid='vercel-analytics' /> : null}
    </>
  ),
}));
vi.mock('./NuqsProvider', () => ({
  NuqsProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('./QueryProvider', () => ({
  QueryProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/hooks/useChunkErrorHandler', () => ({
  useChunkErrorHandler: vi.fn(),
}));
vi.mock('@jovie/ui', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

async function analyticsMountsOn(pathname: string): Promise<number> {
  pathnameRef.current = pathname;
  const { CoreProviders } = await import(
    '@/components/providers/CoreProviders'
  );
  const { unmount } = render(
    <CoreProviders>
      <main>page</main>
    </CoreProviders>
  );
  const count = screen.queryAllByTestId('vercel-analytics').length;
  unmount();
  return count;
}

afterEach(() => {
  vi.resetModules();
  delete process.env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING;
});

describe.each([
  ['theme switching off (production)', undefined],
  ['theme switching on', '1'],
])('CoreProviders Web Analytics route gate, %s', (_label, themeFlag) => {
  function setThemeFlag() {
    if (themeFlag) process.env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING = themeFlag;
  }

  it('mounts analytics exactly once on the homepage', async () => {
    setThemeFlag();
    expect(await analyticsMountsOn('/')).toBe(1);
  });

  it('mounts analytics on the prerendered homepage key', async () => {
    // Next prerenders "/" as "/index"; usePublicPathname maps it back.
    setThemeFlag();
    expect(await analyticsMountsOn('/index')).toBe(1);
  });

  it('mounts analytics on pricing', async () => {
    setThemeFlag();
    expect(await analyticsMountsOn('/pricing')).toBe(1);
  });

  it('keeps mounting analytics on other public marketing pages', async () => {
    setThemeFlag();
    expect(await analyticsMountsOn('/artist-profiles')).toBe(1);
    expect(await analyticsMountsOn('/product')).toBe(1);
  });

  it('keeps analytics off the excluded marketing prefixes', async () => {
    setThemeFlag();
    expect(await analyticsMountsOn('/blog/some-post')).toBe(0);
  });
});
