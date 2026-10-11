import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
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

vi.mock('next/navigation', () => ({ usePathname: () => '/pricing' }));
vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('./LazyProviders', () => ({
  LazyProviders: ({ children }: { children: ReactNode }) => <>{children}</>,
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
