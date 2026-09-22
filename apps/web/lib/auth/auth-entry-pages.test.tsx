import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { CanonicalUserState } from './canonical-user-state';

const { resolveUserState } = vi.hoisted(() => ({ resolveUserState: vi.fn() }));
vi.mock('./gate', async () => ({
  ...(await vi.importActual('./canonical-user-state')),
  resolveUserState,
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../app/(auth)/signup/SignUpPageClient', () => ({
  SignUpPageClient: () => null,
}));
vi.mock('../../app/(auth)/signin/SignInPageClient', () => ({
  SignInPageClient: () => null,
}));
vi.mock('../../app/@auth/(.)signup/SignupModalClient', () => ({
  SignupModalClient: () => null,
}));
vi.mock('../../app/@auth/(.)signin/SigninModalClient', () => ({
  SigninModalClient: () => null,
}));

import SigninModalPage from '../../app/@auth/(.)signin/page';
import SignupModalPage from '../../app/@auth/(.)signup/page';
import SignInPage from '../../app/(auth)/signin/page';
import SignUpPage from '../../app/(auth)/signup/page';

describe.each([SignUpPage, SignInPage, SignupModalPage, SigninModalPage])(
  'canonical auth entry %s',
  Page => {
    beforeEach(() => {
      resolveUserState.mockReset();
    });
    it('routes current paid subscribers to billing and never mounts a trial pitch', async () => {
      resolveUserState.mockResolvedValue({
        state: CanonicalUserState.ACTIVE,
        context: { isPro: true },
      });
      await expect(
        Page({
          searchParams: Promise.resolve({
            plan: 'pro',
            interval: 'monthly',
            artist: 'Tim',
          }),
        })
      ).rejects.toThrow(`redirect:${APP_ROUTES.SETTINGS_BILLING}`);
    });
    it('preserves onboarding and pending waitlist states', async () => {
      resolveUserState.mockResolvedValue({
        state: CanonicalUserState.NEEDS_ONBOARDING,
        context: { isPro: false },
      });
      await expect(
        Page({ searchParams: Promise.resolve({ plan: 'pro' }) })
      ).rejects.toThrow(`redirect:${APP_ROUTES.START}`);
      resolveUserState.mockResolvedValue({
        state: CanonicalUserState.WAITLIST_PENDING,
        context: { isPro: false },
      });
      await expect(
        Page({ searchParams: Promise.resolve({ plan: 'pro' }) })
      ).rejects.toThrow(`redirect:${APP_ROUTES.WAITLIST}`);
    });
    it('renders anonymous entry', async () => {
      resolveUserState.mockResolvedValue({
        state: CanonicalUserState.UNAUTHENTICATED,
      });
      expect(await Page({ searchParams: Promise.resolve({}) })).toBeTruthy();
    });
  }
);
