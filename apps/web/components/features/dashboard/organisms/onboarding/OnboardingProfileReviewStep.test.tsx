import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EnrichedProfileData } from '@/app/onboarding/actions/enrich-profile';
import { OnboardingProfileReviewStep } from './OnboardingProfileReviewStep';

const enrichedProfile: EnrichedProfileData = {
  name: 'Sasha Waves',
  imageUrl: 'https://placehold.co/256x256',
  bio: 'Independent artist making dream-pop from a home studio.',
  genres: ['dream pop', 'indie'],
  followers: 4200,
};

function renderStep() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OnboardingProfileReviewStep
        title='Review your profile'
        prompt="Here's what fans will see first."
        enrichedProfile={enrichedProfile}
        handle='sashawaves'
        onGoToDashboard={vi.fn()}
        isEnriching={false}
        isStepResume
      />
    </QueryClientProvider>
  );
}

describe('OnboardingProfileReviewStep', () => {
  it('renders the name validation error with the error token, not raw red-* (JOV-6773)', () => {
    renderStep();

    fireEvent.click(screen.getByRole('button', { name: 'Edit name' }));
    const input = screen.getByLabelText('Edit Display Name');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    const error = screen.getByText('Display name is required');
    expect(error.className).toContain('text-error');
    expect(error.className).not.toMatch(/\bred-\d/);
  });
});
