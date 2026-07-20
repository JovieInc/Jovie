import type { BrowserContext } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installRuntimeAutomationBypass,
  ONBOARDING_SESSION_COOKIE_NAME,
  resetAuthStatePreservingOnboardingSession,
} from '../../e2e/utils/runtime-automation-bypass';

describe('installRuntimeAutomationBypass', () => {
  afterEach(() => {
    delete document.documentElement?.dataset.e2eMode;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('marks an existing document root without constructing an observer', () => {
    const MutationObserverSpy = vi.fn();
    vi.stubGlobal('MutationObserver', MutationObserverSpy);

    installRuntimeAutomationBypass();

    expect(document.documentElement.dataset.e2eMode).toBe('1');
    expect(MutationObserverSpy).not.toHaveBeenCalled();
  });

  it('marks a document root inserted after init and disconnects its observer', async () => {
    const originalRoot = document.documentElement;
    originalRoot.remove();
    expect(document.documentElement).toBeNull();

    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');

    try {
      installRuntimeAutomationBypass();
      expect(disconnect).not.toHaveBeenCalled();

      document.append(originalRoot);

      await vi.waitFor(() => {
        expect(document.documentElement?.dataset.e2eMode).toBe('1');
        expect(disconnect).toHaveBeenCalledOnce();
      });
    } finally {
      if (!document.documentElement) document.append(originalRoot);
    }
  });

  it('preserves only the signed onboarding cookie while clearing auth state', async () => {
    const onboardingCookie = {
      name: ONBOARDING_SESSION_COOKIE_NAME,
      value: 'session.signature',
      domain: 'localhost',
      path: '/',
    };
    const clearCookies = vi.fn().mockResolvedValue(undefined);
    const addCookies = vi.fn().mockResolvedValue(undefined);
    const context = {
      cookies: vi.fn().mockResolvedValue([
        onboardingCookie,
        {
          name: 'better-auth.session_token',
          value: 'auth',
          domain: 'localhost',
          path: '/',
        },
      ]),
      clearCookies,
      addCookies,
    } as unknown as BrowserContext;

    await resetAuthStatePreservingOnboardingSession(context);

    expect(clearCookies).toHaveBeenCalledOnce();
    expect(addCookies).toHaveBeenCalledWith([onboardingCookie]);
  });
});
