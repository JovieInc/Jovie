import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getCoreProviderVariant,
  isThemeEnabledRoute,
} from '@/components/providers/CoreProviders';

const providerSource = readFileSync(
  resolve(process.cwd(), 'components/providers/CoreProviders.tsx'),
  'utf8'
);
expect(providerSource).toContain('CoreProvidersInner');

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
