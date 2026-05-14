import { describe, expect, it, vi } from 'vitest';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('/onboarding redirect shim', () => {
  it('redirects to /start when no query params are present', async () => {
    const { default: OnboardingPage } = await import('@/app/onboarding/page');

    await expect(
      OnboardingPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('REDIRECT:/start');
  });

  it('preserves resume, handle, username, and intent_id params', async () => {
    const { default: OnboardingPage } = await import('@/app/onboarding/page');

    await expect(
      OnboardingPage({
        searchParams: Promise.resolve({
          resume: 'spotify',
          handle: 'artist',
          username: 'legacy-artist',
          intent_id: 'intent_123',
        }),
      })
    ).rejects.toThrow(
      'REDIRECT:/start?resume=spotify&handle=artist&username=legacy-artist&intent_id=intent_123'
    );
  });
});
