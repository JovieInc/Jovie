import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CoreProviders,
  getCoreProviderVariant,
  isThemeEnabledRoute,
} from '@/components/providers/CoreProviders';

// These cases cover the theme-switching policy itself; production ships with
// theme switching off (dark forced), covered in lib/theme/route-policy.test.ts.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING = '1';
});

describe('getCoreProviderVariant', () => {
  it('returns full for authenticated app route groups', () => {
    expect(getCoreProviderVariant('/app/dashboard')).toBe('full');
    expect(getCoreProviderVariant('/account')).toBe('full');
    expect(getCoreProviderVariant('/artist-selection')).toBe('full');
    expect(getCoreProviderVariant('/billing')).toBe('full');
    expect(getCoreProviderVariant('/sso-callback')).toBe('full');
    expect(getCoreProviderVariant('/onboarding')).toBe('full');
  });

  it('returns homepage for the marketing root route', () => {
    expect(getCoreProviderVariant('/')).toBe('homepage');
  });

  it('returns public for marketing and profile routes', () => {
    expect(getCoreProviderVariant('/pricing')).toBe('public');
    expect(getCoreProviderVariant('/blog/some-post')).toBe('public');
    expect(getCoreProviderVariant('/artistname')).toBe('public');
  });
});

describe('isThemeEnabledRoute', () => {
  it('enables theme preference for app, onboarding, auth, and waitlist routes', () => {
    expect(isThemeEnabledRoute('/app/dashboard')).toBe(true);
    expect(isThemeEnabledRoute('/onboarding/step-1')).toBe(true);
    expect(isThemeEnabledRoute('/signin')).toBe(true);
    expect(isThemeEnabledRoute('/signup')).toBe(true);
    expect(isThemeEnabledRoute('/waitlist')).toBe(true);
  });

  it('enables only the declared marketing route families', () => {
    expect(isThemeEnabledRoute('/')).toBe(true);
    expect(isThemeEnabledRoute('/pricing')).toBe(true);
    expect(isThemeEnabledRoute('/blog/linear')).toBe(true);
    expect(isThemeEnabledRoute('/engineering/ship')).toBe(true);
    expect(isThemeEnabledRoute('/compare/cursor')).toBe(true);
    expect(isThemeEnabledRoute('/pricing-extra')).toBe(false);
    expect(isThemeEnabledRoute('/blogroll')).toBe(false);
  });

  it('keeps unrelated public and nonmarketing surfaces outside the policy', () => {
    expect(isThemeEnabledRoute('/artistname')).toBe(false);
    expect(isThemeEnabledRoute('/artistname/about')).toBe(false);
    expect(isThemeEnabledRoute('/playlists')).toBe(false);
    expect(isThemeEnabledRoute('/brand')).toBe(false);
    expect(isThemeEnabledRoute('/pitch')).toBe(false);
  });
});

const pathnameRef = vi.hoisted(() => ({ current: '/pricing' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameRef.current,
}));
vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
// Both analytics mounts render the same marker, so a test can count them.
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
vi.mock('./DeferredAnalytics', () => ({
  DeferredAnalytics: () => <span data-testid='vercel-analytics' />,
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
  TooltipProvider: ({
    children,
    delayDuration,
    skipDelayDuration,
  }: {
    children: ReactNode;
    delayDuration?: number;
    skipDelayDuration?: number;
  }) => (
    <div
      data-testid='core-tooltip-scope'
      data-delay={delayDuration}
      data-skip={skipDelayDuration}
    >
      {children}
    </div>
  ),
}));
it('keeps the public provider graph on the shared tooltip timing scope', () => {
  render(
    <CoreProviders>
      <button type='button'>Public action</button>
    </CoreProviders>
  );
  expect(screen.getByRole('button', { name: 'Public action' })).toBeVisible();
  expect(screen.getByTestId('core-tooltip-scope')).not.toHaveAttribute(
    'data-delay'
  );
  expect(screen.getByTestId('core-tooltip-scope')).not.toHaveAttribute(
    'data-skip'
  );
});

describe('prerendered homepage pathname', () => {
  it('CoreProviders.tsx reads "/index" as "/" via usePublicPathname', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(process.cwd(), 'components/providers/CoreProviders.tsx'),
      'utf8'
    );
    expect(source).toContain('usePublicPathname');
    expect(source).not.toMatch(/\busePathname\b/);
  });
});

// Which routes mount Vercel Web Analytics: through LazyProviders on the
// provider tree, or directly on the homepage's provider-free shell. The
// homepage and pricing are the top of the signup funnel, so a visitor who
// lands there must send a pageview, in the production build (theme switching
// off) as well as with theme switching on.
describe.each([
  ['theme switching off (production)', undefined],
  ['theme switching on', '1'],
])('Web Analytics route gate, %s', (_label, themeFlag) => {
  afterEach(() => {
    vi.doUnmock('@/lib/env-client');
    vi.resetModules();
    process.env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING = '1';
    pathnameRef.current = '/pricing';
  });

  async function analyticsMountsOn(pathname: string): Promise<number> {
    vi.resetModules();
    if (themeFlag) process.env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING = themeFlag;
    else delete process.env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING;
    vi.doMock('@/lib/env-client', () => ({
      env: { IS_TEST: false, IS_E2E: false, IS_DEV: false },
    }));
    pathnameRef.current = pathname;
    const { CoreProviders: FreshCoreProviders } = await import(
      '@/components/providers/CoreProviders'
    );
    const { unmount } = render(
      <FreshCoreProviders>
        <main>page</main>
      </FreshCoreProviders>
    );
    const count = screen.queryAllByTestId('vercel-analytics').length;
    unmount();
    return count;
  }

  it('mounts analytics exactly once on the homepage', async () => {
    expect(await analyticsMountsOn('/')).toBe(1);
  });

  it('mounts analytics on the prerendered homepage key', async () => {
    // Next prerenders "/" as "/index"; usePublicPathname maps it back.
    expect(await analyticsMountsOn('/index')).toBe(1);
  });

  it('mounts analytics on pricing', async () => {
    expect(await analyticsMountsOn('/pricing')).toBe(1);
  });

  it('keeps mounting analytics on other public marketing pages', async () => {
    expect(await analyticsMountsOn('/artist-profiles')).toBe(1);
    expect(await analyticsMountsOn('/product')).toBe(1);
  });

  it('keeps analytics off the excluded marketing prefixes', async () => {
    expect(await analyticsMountsOn('/blog/some-post')).toBe(0);
  });
});
