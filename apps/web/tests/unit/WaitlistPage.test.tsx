import { render, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

const { mockPush, mockReplace, mockFetch } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ hasEntry: false, status: null, inviteToken: null }),
  }),
}));

let mockUserId = 'user-one';

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: mockUserId,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/auth', () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AuthButton: ({ children }: { children: React.ReactNode }) => (
    <button type='button'>{children}</button>
  ),
  AuthBackButton: () => <button type='button'>Back</button>,
}));

vi.mock('@/components/waitlist/WaitlistPrimaryGoalStep', () => ({
  WaitlistPrimaryGoalStep: () => <div />,
}));

vi.mock('@/components/waitlist/WaitlistSocialStep', () => ({
  WaitlistSocialStep: () => <div />,
}));

vi.mock('@/components/waitlist/WaitlistAdditionalInfoStep', () => ({
  WaitlistAdditionalInfoStep: () => <div />,
}));

vi.mock('@/components/waitlist/WaitlistSkeleton', () => ({
  WaitlistSkeleton: () => <div />,
}));

vi.mock('@/components/waitlist/WaitlistSuccessView', () => ({
  WaitlistSuccessView: () => <div>Waitlist success</div>,
}));

import WaitlistPage from '@/app/waitlist/page';
import { WAITLIST_STORAGE_KEYS } from '@/components/waitlist/types';

global.fetch = mockFetch as unknown as typeof fetch;

describe('WaitlistPage', () => {
  test('clears waitlist session storage when user changes', async () => {
    window.sessionStorage.setItem(WAITLIST_STORAGE_KEYS.submitted, 'true');
    window.sessionStorage.setItem(WAITLIST_STORAGE_KEYS.userId, 'user-one');

    mockUserId = 'user-two';

    render(<WaitlistPage />);

    await waitFor(() => {
      expect(
        window.sessionStorage.getItem(WAITLIST_STORAGE_KEYS.submitted)
      ).toBeNull();
      expect(window.sessionStorage.getItem(WAITLIST_STORAGE_KEYS.userId)).toBe(
        'user-two'
      );
    });
  });
});
