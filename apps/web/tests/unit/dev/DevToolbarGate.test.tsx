import { describe, expect, it } from 'vitest';
import {
  isDevToolbarSuppressedPath,
  resetDevToolbarHeight,
  shouldRenderDevToolbar,
} from '@/components/features/dev/DevToolbarGate';

describe('DevToolbarGate production + path gating', () => {
  it('suppresses demo, start, and onboarding customer surfaces', () => {
    expect(isDevToolbarSuppressedPath('/demovideo')).toBe(true);
    expect(isDevToolbarSuppressedPath('/demo')).toBe(true);
    expect(isDevToolbarSuppressedPath('/demo/founder-video')).toBe(true);
    expect(isDevToolbarSuppressedPath('/start')).toBe(true);
    expect(isDevToolbarSuppressedPath('/onboarding')).toBe(true);
    expect(isDevToolbarSuppressedPath('/onboarding/checkout')).toBe(true);
    expect(isDevToolbarSuppressedPath('/app/onboarding')).toBe(true);
    expect(isDevToolbarSuppressedPath('/app/onboarding/claim')).toBe(true);
  });

  it('does not suppress normal app routes used by authenticated creators', () => {
    expect(isDevToolbarSuppressedPath('/app/chat')).toBe(false);
    expect(isDevToolbarSuppressedPath('/app/dashboard/releases')).toBe(false);
  });

  it('never renders for production customers without the opt-in cookie', () => {
    expect(
      shouldRenderDevToolbar({
        env: 'production',
        pathname: '/app/chat',
        hasCookie: false,
        nodeEnv: 'production',
      })
    ).toBe(false);
  });

  it('allows production only with explicit __dev_toolbar cookie opt-in', () => {
    expect(
      shouldRenderDevToolbar({
        env: 'production',
        pathname: '/app/chat',
        hasCookie: true,
        nodeEnv: 'production',
      })
    ).toBe(true);
  });

  it('still hides production opt-in toolbar on suppressed product paths', () => {
    expect(
      shouldRenderDevToolbar({
        env: 'production',
        pathname: '/start',
        hasCookie: true,
        nodeEnv: 'production',
      })
    ).toBe(false);
    expect(
      shouldRenderDevToolbar({
        env: 'production',
        pathname: '/onboarding/checkout',
        hasCookie: true,
        nodeEnv: 'production',
      })
    ).toBe(false);
  });

  it('renders for non-production (dev/preview) on normal app routes', () => {
    expect(
      shouldRenderDevToolbar({
        env: 'development',
        pathname: '/app/chat',
        nodeEnv: 'development',
      })
    ).toBe(true);
    expect(
      shouldRenderDevToolbar({
        env: 'preview',
        pathname: '/app/dashboard',
        nodeEnv: 'production',
      })
    ).toBe(true);
  });

  it('respects disabled / demo / electron / dev-chrome-disabled flags', () => {
    expect(
      shouldRenderDevToolbar({
        env: 'development',
        pathname: '/app/chat',
        disabled: true,
        nodeEnv: 'development',
      })
    ).toBe(false);
    expect(
      shouldRenderDevToolbar({
        env: 'development',
        pathname: '/app/chat',
        isDemoRecording: true,
        nodeEnv: 'development',
      })
    ).toBe(false);
    expect(
      shouldRenderDevToolbar({
        env: 'development',
        pathname: '/app/chat',
        isDevChromeDisabled: true,
        nodeEnv: 'development',
      })
    ).toBe(false);
    expect(
      shouldRenderDevToolbar({
        env: 'development',
        pathname: '/app/chat',
        isElectron: true,
        nodeEnv: 'development',
      })
    ).toBe(false);
  });

  it('resets --dev-toolbar-height to 0px so customer layout metrics exclude chrome', () => {
    document.documentElement.style.setProperty('--dev-toolbar-height', '48px');
    resetDevToolbarHeight();
    expect(
      document.documentElement.style.getPropertyValue('--dev-toolbar-height')
    ).toBe('0px');
  });
});
