import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingHandleStep } from './OnboardingHandleStep';

function renderStep(
  overrides: Partial<ComponentProps<typeof OnboardingHandleStep>> = {}
) {
  const onSubmit = vi.fn(event => event?.preventDefault());
  const onHandleChange = vi.fn();
  render(
    <OnboardingHandleStep
      title='Claim your handle'
      handleInput='sashawaves'
      isHydrated
      handleValidation={{
        available: true,
        checking: false,
        error: null,
        clientValid: true,
        suggestions: [],
      }}
      stateError={null}
      isSubmitting={false}
      isTransitioning={false}
      ctaDisabledReason={null}
      inputRef={{ current: null }}
      onHandleChange={onHandleChange}
      onSubmit={onSubmit}
      {...overrides}
    />
  );
  return { onSubmit, onHandleChange };
}

describe('OnboardingHandleStep keyboard focus', () => {
  it('uses the field frame for input focus and keeps submit reachable by keyboard', async () => {
    const { onSubmit } = renderStep();
    const user = userEvent.setup();
    await user.tab();
    const input = screen.getByRole('textbox', { name: 'Claim Your Handle' });
    expect(input).toHaveFocus();
    expect(input.closest('.focus-field-inset')).not.toBeNull();
    expect(input).not.toHaveClass('focus-ring-themed');

    await user.tab();
    const submit = screen.getByTestId('onboarding-handle-submit');
    expect(submit).toHaveFocus();
    expect(submit).toHaveClass('focus-ring-themed');
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('keeps the field focus target when invalid and skips the disabled submit', async () => {
    const { onSubmit } = renderStep({
      stateError: 'That handle is unavailable',
      ctaDisabledReason: 'Choose another handle',
    });
    const user = userEvent.setup();
    await user.tab();
    const input = screen.getByRole('textbox', { name: 'Claim Your Handle' });
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.closest('.focus-field-inset')).not.toBeNull();
    expect(screen.getByTestId('handle-unavailable')).toHaveTextContent(
      'That handle is unavailable'
    );
    const submit = screen.getByTestId('onboarding-handle-submit');
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription('Choose another handle');
    await user.tab();
    expect(submit).not.toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the button spinner while submitting and prevents another submission', async () => {
    const { onSubmit } = renderStep({ isSubmitting: true });
    const submit = screen.getByTestId('onboarding-handle-submit');
    const spinner = screen.getByRole('status', { name: 'Loading' });
    expect(submit).toContainElement(spinner);
    expect(spinner).toHaveAttribute('data-tone', 'inverse');
    expect(submit).toBeDisabled();
    await userEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
