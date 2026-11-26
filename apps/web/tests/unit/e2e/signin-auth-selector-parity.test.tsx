import type { BrowserContext, Page } from '@playwright/test';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authState,
  mockSendVerificationOtp,
  mockSignInEmailOtp,
  routerReplace,
} = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: false },
  mockSendVerificationOtp: vi.fn(),
  mockSignInEmailOtp: vi.fn(),
  routerReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/signin',
  useRouter: () => ({
    replace: routerReplace,
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({
    isLoaded: authState.isLoaded,
    isSignedIn: authState.isSignedIn,
  }),
}));

vi.mock('@/lib/auth/client', () => ({
  isGoogleOneTapConfigured: () => false,
  authClient: {
    emailOtp: { sendVerificationOtp: mockSendVerificationOtp },
    signIn: { emailOtp: mockSignInEmailOtp, social: vi.fn() },
  },
}));

import { SignInPageClient } from '@/app/(auth)/signin/SignInPageClient';
import {
  CODE_FORM_SELECTOR,
  CODE_INPUT_SELECTOR,
  EMAIL_FORM_SELECTOR,
  EMAIL_SUBMIT_BUTTON_SELECTOR,
  ensureProtectedAuthContextPrimed,
  IDENTIFIER_INPUT_SELECTOR,
} from '../../e2e/utils/production-auth-interaction';

const ADMIN_PROBE_EMAIL = 'browse-admin+clerk_test@jov.ie';
const DEPLOYMENT_ORIGIN = 'https://jovie-abc123def-jovie.vercel.app';

describe('production-auth-interaction Vercel bypass priming & /signin selector parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isLoaded = true;
    authState.isSignedIn = false;
    globalThis.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof globalThis.matchMedia;
    globalThis.IntersectionObserver = class IntersectionObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      readonly root = null;
      readonly rootMargin = '';
      readonly thresholds = [];
    } as unknown as typeof IntersectionObserver;
  });

  it('primes origin-bound Vercel bypass and reloads /signin when a secondary context (adminInventoryReadback) is unprimed', async () => {
    const gotoMock = vi.fn().mockResolvedValue(null);
    const cookiesMock = vi.fn().mockResolvedValue([]);
    const primeMock = vi.fn().mockResolvedValue(undefined);

    const fakeContext = {
      cookies: cookiesMock,
    } as unknown as BrowserContext;
    const fakePage = {
      context: () => fakeContext,
      url: () => `${DEPLOYMENT_ORIGIN}/signin`,
      goto: gotoMock,
    } as unknown as Page;

    const primed = await ensureProtectedAuthContextPrimed(fakePage, 15_000, {
      bypassSecret: 'bypass-secret-fixture',
      expectedDeploymentOrigin: DEPLOYMENT_ORIGIN,
      primeBypassImpl: primeMock,
    });

    expect(primed).toBe(true);
    expect(primeMock).toHaveBeenCalledTimes(1);
    expect(primeMock).toHaveBeenCalledWith(fakeContext, DEPLOYMENT_ORIGIN);
    expect(gotoMock).toHaveBeenCalledTimes(1);
    expect(gotoMock).toHaveBeenCalledWith(`${DEPLOYMENT_ORIGIN}/signin`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
  });

  it('skips re-priming when _vercel_jwt is already present or target is a public alias', async () => {
    const gotoMock = vi.fn();
    const primeMock = vi.fn();

    const alreadyPrimedContext = {
      cookies: vi
        .fn()
        .mockResolvedValue([{ name: '_vercel_jwt', value: 'token' }]),
    } as unknown as BrowserContext;
    const alreadyPrimedPage = {
      context: () => alreadyPrimedContext,
      url: () => `${DEPLOYMENT_ORIGIN}/signin`,
      goto: gotoMock,
    } as unknown as Page;

    expect(
      await ensureProtectedAuthContextPrimed(alreadyPrimedPage, 15_000, {
        bypassSecret: 'bypass-secret-fixture',
        expectedDeploymentOrigin: DEPLOYMENT_ORIGIN,
        primeBypassImpl: primeMock,
      })
    ).toBe(false);
    expect(primeMock).not.toHaveBeenCalled();
    expect(gotoMock).not.toHaveBeenCalled();

    const publicAliasPage = {
      context: () =>
        ({
          cookies: vi.fn().mockResolvedValue([]),
        }) as unknown as BrowserContext,
      url: () => 'https://jov.ie/signin',
      goto: gotoMock,
    } as unknown as Page;

    expect(
      await ensureProtectedAuthContextPrimed(publicAliasPage, 15_000, {
        bypassSecret: 'bypass-secret-fixture',
        expectedDeploymentOrigin: 'https://jov.ie',
        primeBypassImpl: primeMock,
      })
    ).toBe(false);
    expect(primeMock).not.toHaveBeenCalled();
  });

  it('keeps closed-loop selector parity between SignInPageClient (/signin) and the production auth probe selectors across email and OTP steps', async () => {
    mockSendVerificationOtp.mockResolvedValue({
      data: { success: true },
      error: null,
    });

    // 1. Pre-hydration SSR markup must expose EMAIL_FORM_SELECTOR, IDENTIFIER_INPUT_SELECTOR,
    // and keep submit disabled until client hydration completes.
    const ssrHtml = renderToStaticMarkup(<SignInPageClient />);
    const ssrContainer = document.createElement('div');
    ssrContainer.innerHTML = ssrHtml;

    const ssrForm = ssrContainer.querySelector(EMAIL_FORM_SELECTOR);
    expect(ssrForm).toBeInstanceOf(HTMLFormElement);
    const ssrInput = ssrForm?.querySelector(IDENTIFIER_INPUT_SELECTOR);
    expect(ssrInput).toBeInstanceOf(HTMLInputElement);
    expect(ssrInput?.getAttribute('name')).toBe('emailAddress');
    expect(ssrInput?.getAttribute('type')).toBe('email');
    expect(ssrInput?.getAttribute('autocomplete')).toBe('email');
    const ssrSubmit = ssrForm?.querySelector(EMAIL_SUBMIT_BUTTON_SELECTOR);
    expect(ssrSubmit).toBeInstanceOf(HTMLButtonElement);
    expect((ssrSubmit as HTMLButtonElement).disabled).toBe(true);

    // 2. Hydrated /signin tree must accept browse-admin+clerk_test@jov.ie via the
    // exact probe selectors and advance to CODE_FORM_SELECTOR + CODE_INPUT_SELECTOR.
    const user = userEvent.setup();
    const { container } = render(<SignInPageClient />);

    const emailForm = container.querySelector(EMAIL_FORM_SELECTOR);
    expect(emailForm).toBeInstanceOf(HTMLFormElement);

    const identifierInput = emailForm?.querySelector(
      IDENTIFIER_INPUT_SELECTOR
    ) as HTMLInputElement | null;
    const submitButton = emailForm?.querySelector(
      EMAIL_SUBMIT_BUTTON_SELECTOR
    ) as HTMLButtonElement | null;
    expect(identifierInput).not.toBeNull();
    expect(submitButton).not.toBeNull();
    expect(submitButton?.disabled).toBe(false);

    await user.type(identifierInput!, ADMIN_PROBE_EMAIL);
    expect(identifierInput?.value).toBe(ADMIN_PROBE_EMAIL);
    await user.click(submitButton!);

    await screen.findByText(/enter the code sent to/i);
    expect(mockSendVerificationOtp).toHaveBeenCalledWith({
      email: ADMIN_PROBE_EMAIL,
      type: 'sign-in',
    });

    const codeForm = container.querySelector(CODE_FORM_SELECTOR);
    expect(codeForm).toBeInstanceOf(HTMLFormElement);
    const codeInput = codeForm?.querySelector(CODE_INPUT_SELECTOR);
    expect(codeInput).toBeInstanceOf(HTMLInputElement);
    const verifyButton = codeForm?.querySelector(EMAIL_SUBMIT_BUTTON_SELECTOR);
    expect(verifyButton).toBeInstanceOf(HTMLButtonElement);
  });
});
