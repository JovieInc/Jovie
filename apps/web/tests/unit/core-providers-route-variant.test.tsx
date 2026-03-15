import { describe, expect, it } from 'vitest';
import {
  getCoreProviderVariant,
  isThemeEnabledRoute,
} from '@/components/providers/CoreProviders';

describe('getCoreProviderVariant', () => {
  it('returns full for authenticated app route groups', () => {
    expect(getCoreProviderVariant('/app/dashboard')).toBe('full');
    expect(getCoreProviderVariant('/account')).toBe('full');
    expect(getCoreProviderVariant('/artist-selection')).toBe('full');
    expect(getCoreProviderVariant('/billing')).toBe('full');
    expect(getCoreProviderVariant('/sso-callback')).toBe('full');
    expect(getCoreProviderVariant('/onboarding')).toBe('full');
  });

  it('returns public for marketing and profile routes', () => {
    expect(getCoreProviderVariant('/')).toBe('public');
    expect(getCoreProviderVariant('/pricing')).toBe('public');
    expect(getCoreProviderVariant('/blog/some-post')).toBe('public');
    expect(getCoreProviderVariant('/artistname')).toBe('public');
  });
});

describe('isThemeEnabledRoute', () => {
  it('enables theme preference for app and onboarding routes', () => {
    expect(isThemeEnabledRoute('/app/dashboard')).toBe(true);
    expect(isThemeEnabledRoute('/onboarding/step-1')).toBe(true);
  });

  it('keeps public and auth surfaces dark', () => {
    expect(isThemeEnabledRoute('/')).toBe(false);
    expect(isThemeEnabledRoute('/signin')).toBe(false);
    expect(isThemeEnabledRoute('/waitlist')).toBe(false);
    expect(isThemeEnabledRoute('/artistname')).toBe(false);
  });
});
