import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppleStyleOnboardingForm } from '@/components/dashboard/organisms/AppleStyleOnboardingForm';

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: { id: '1', emailAddresses: [] } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => ({ get: () => null }),
}));
vi.mock('@/lib/analytics', () => ({ track: () => {}, identify: () => {} }));

describe('AppleStyleOnboardingForm messages', () => {
  it('shows error message without notification', () => {
    render(
      <AppleStyleOnboardingForm
        initialStepIndex={2}
        initialState={{ error: 'Something went wrong', notification: null }}
      />
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.queryByText('Link copied to clipboard!')
    ).not.toBeInTheDocument();
  });

  it('shows notification without error', () => {
    render(
      <AppleStyleOnboardingForm
        initialStepIndex={3}
        initialState={{
          notification: 'Link copied to clipboard!',
          error: null,
        }}
      />
    );

    expect(screen.getByText('Link copied to clipboard!')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });
});
