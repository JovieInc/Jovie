import { afterEach, describe, expect, it, vi } from 'vitest';

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/app/(auth)/signin/SignInPageClient', () => ({
  SignInPageClient: () => null,
}));
vi.mock('@/components/molecules/LoadingSkeleton', () => ({
  AuthFormSkeleton: () => null,
}));

import SignInPage from './page';

afterEach(() => vi.clearAllMocks());

describe('Ovie sign-in destination', () => {
  it('defaults to company controls and preserves authentication query values', async () => {
    await expect(
      SignInPage({
        searchParams: Promise.resolve({
          error: 'expired',
          ignored: ['a', 'b'],
        }),
      })
    ).rejects.toThrow('redirect:/signin?error=expired&redirect_url=%2Fhud');
  });

  it('renders shared sign-in for an existing operator deep link', async () => {
    const result = await SignInPage({
      searchParams: Promise.resolve({
        redirect_url: '/app/ov/creators?q=test',
      }),
    });
    expect(result).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
