import { describe, expect, test, vi } from 'vitest';

const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error('NEXT_REDIRECT');
  },
}));

describe('WaitlistPage', () => {
  test('server-side redirects to /onboarding', async () => {
    const { default: WaitlistPage } = await import('../../app/waitlist/page');

    expect(() => WaitlistPage()).toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
  });
});
