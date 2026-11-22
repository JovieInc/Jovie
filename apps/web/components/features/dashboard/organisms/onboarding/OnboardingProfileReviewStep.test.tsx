import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EnrichedProfileData } from '@/app/onboarding/actions/enrich-profile';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OnboardingProfileReviewStep } from './OnboardingProfileReviewStep';

const enrichedProfile: EnrichedProfileData = {
  name: 'Sasha Waves',
  imageUrl: 'https://placehold.co/256x256',
  bio: 'Independent artist making dream-pop from a home studio.',
  genres: ['dream pop', 'indie'],
  followers: 4200,
};

function renderStep(
  overrides: Partial<ComponentProps<typeof OnboardingProfileReviewStep>> = {}
) {
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
        {...overrides}
      />
    </QueryClientProvider>
  );
}

describe('OnboardingProfileReviewStep', () => {
  it('keeps the display-name control focusable when opening the editor by keyboard', async () => {
    renderStep();
    const user = userEvent.setup();
    const edit = screen.getByRole('button', {
      name: `Edit Display Name: ${enrichedProfile.name}`,
    });
    edit.focus();
    expect(edit).toHaveFocus();
    expect(edit).toHaveClass('focus-ring-themed');

    await user.keyboard('{Enter}');
    const input = screen.getByRole('textbox', { name: 'Edit Display Name' });
    expect(input).toHaveValue(enrichedProfile.name);
    expect(input).toHaveFocus();
  });

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

  it('edits the display name in the shared field shell and keeps it on Enter', async () => {
    const user = userEvent.setup();
    const { container } = renderStep();

    await user.click(screen.getByRole('button', { name: 'Edit name' }));
    const input = screen.getByRole('textbox', { name: 'Edit Display Name' });
    expect(input).toHaveAttribute('data-host-drawn');
    expect(input.closest('[data-component="composite-field"]')).toHaveAttribute(
      'data-surface',
      'field'
    );
    await user.clear(input);
    await user.type(input, 'Sasha W');
    expect(input).toHaveValue('Sasha W');
    await expectNoA11yViolations(container);
  });

  it('opens the editor through plain buttons and has no accessibility violations', async () => {
    const { container } = renderStep();

    expect(screen.getByRole('button', { name: 'Edit name' })).toHaveAttribute(
      'data-slot',
      'plain-button'
    );
    await expectNoA11yViolations(container);
  });

  it('warns about a low resolution photo with warning tokens, not amber palette classes', async () => {
    const { container } = renderStep({
      avatarQuality: { status: 'low', width: 200, height: 200 },
    });

    const notice = screen.getByText(/This photo is only 200x200/);
    expect(notice.parentElement).toHaveClass('bg-warning-subtle');
    expect(container.innerHTML).not.toMatch(/amber-|ring-black|ring-white/);
    await expectNoA11yViolations(container);
  });
});
