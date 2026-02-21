import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

import { WAITLIST_STORAGE_KEYS } from '@/components/waitlist/types';
import WaitlistPage from '../../app/waitlist/page';

global.fetch = mockFetch as unknown as typeof fetch;

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe('WaitlistPage', () => {
  test('clears waitlist session storage when user changes', async () => {
    window.sessionStorage.setItem(WAITLIST_STORAGE_KEYS.submitted, 'true');
    mockUserId = 'user-one';

    const queryClient = createTestQueryClient();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <WaitlistPage />
      </QueryClientProvider>
    );

    mockUserId = 'user-two';

    rerender(
      <QueryClientProvider client={queryClient}>
        <WaitlistPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(
        window.sessionStorage.getItem(WAITLIST_STORAGE_KEYS.submitted)
      ).toBeNull();
    });
  });
});
