import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  OnboardingHandleCheckCard,
  OnboardingSocialLinkCard,
} from './OnboardingToolStatusCards';

vi.mock('@/lib/queries/useHandleAvailabilityQuery', () => ({
  useHandleAvailabilityQuery: () => ({
    data: { available: true },
    isLoading: false,
    isFetching: false,
  }),
}));

describe('OnboardingToolStatusCards', () => {
  it('edits the proposed handle in a host-drawn field', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <OnboardingHandleCheckCard
        state='output-available'
        output={{ action: 'check_handle', handle: 'alexexample' }}
        onConfirmHandle={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Change Handle' }));
    const input = screen.getByRole('textbox', { name: 'Edit Proposed Handle' });
    expect(input).toHaveAttribute('data-host-drawn');
    await user.clear(input);
    await user.type(input, 'alex.example');
    expect(input).toHaveValue('alex.example');
    await expectNoA11yViolations(container);
  });

  it('attaches a full social link', async () => {
    const user = userEvent.setup();
    const onAttachAccount = vi.fn();
    render(
      <OnboardingSocialLinkCard
        state='output-available'
        output={{ action: 'propose_social_link', url: 'https://instagram.com' }}
        onAttachAccount={onAttachAccount}
      />
    );
    const input = screen.getByRole('textbox', { name: 'Social Profile URL' });
    await user.clear(input);
    await user.type(input, 'https://instagram.com/alexexample');
    await user.click(screen.getByTestId('onboarding-attach-account'));
    expect(onAttachAccount).toHaveBeenCalledWith(
      'https://www.instagram.com/alexexample/'
    );
  });
});
