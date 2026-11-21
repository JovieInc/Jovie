import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OnboardingHandleStep } from './OnboardingHandleStep';

function renderStep(
  overrides: Partial<ComponentProps<typeof OnboardingHandleStep>> = {}
) {
  const onSubmit = vi.fn(event => event?.preventDefault());
  const onHandleChange = vi.fn();
  const view = render(
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
  return { onSubmit, onHandleChange, container: view.container };
}

describe('OnboardingHandleStep keyboard focus', () => {
  it('draws the focus ring on the field shell and keeps submit reachable by keyboard', async () => {
    const { onSubmit } = renderStep();
    const user = userEvent.setup();
    await user.tab();
    const input = screen.getByRole('textbox', { name: 'Claim Your Handle' });
    expect(input).toHaveFocus();
    // The shared field shell draws the ring around the whole pill.
    expect(input.closest('[data-component="composite-field"]')).not.toBeNull();

    await user.tab();
    const submit = screen.getByRole('button', { name: 'Continue' });
    expect(submit).toHaveFocus();
    expect(submit).toHaveAttribute('data-variant', 'primary');
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
    expect(input.closest('[data-component="composite-field"]')).not.toBeNull();
    expect(screen.getByTestId('handle-unavailable')).toHaveTextContent(
      'That handle is unavailable'
    );
    const submit = screen.getByRole('button', { name: 'Continue' });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription('Choose another handle');
    await user.tab();
    expect(submit).not.toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the button spinner while submitting and prevents another submission', async () => {
    const { onSubmit } = renderStep({ isSubmitting: true });
    const submit = screen.getByRole('button', { name: 'Continue' });
    const spinner = screen.getByRole('status', { name: 'Loading' });
    expect(submit).toContainElement(spinner);
    expect(spinner).toHaveAttribute('data-tone', 'inverse');
    expect(submit).toBeDisabled();
    await userEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('OnboardingHandleStep handle URL', () => {
  it('groups the jov.ie/ prefix with the input so the URL reads as one string', () => {
    renderStep();
    const input = screen.getByRole('textbox', { name: 'Claim Your Handle' });
    const group = input.parentElement;

    // Prefix and handle share a gapless group; the submit button keeps the
    // outer row's gap. A gap here rendered as "jov.ie/ sashawaves".
    expect(group?.firstElementChild).toHaveTextContent('jov.ie/');
    expect(group?.className).not.toMatch(/\bgap-/);
    expect(
      group?.contains(screen.getByTestId('onboarding-handle-submit'))
    ).toBe(false);
  });
});

describe('OnboardingHandleStep shared field shell', () => {
  it('draws the pill with the composite field and host-drawn input and stays axe-clean', async () => {
    const { container } = renderStep();
    const input = screen.getByRole('textbox', { name: 'Claim Your Handle' });

    expect(input).toHaveAttribute('data-host-drawn');
    expect(input.closest('[data-component="composite-field"]')).toHaveAttribute(
      'data-surface',
      'field'
    );
    await expectNoA11yViolations(container);
  });

  it('normalises typed input and offers suggestions through plain buttons', async () => {
    const user = userEvent.setup();
    const { onHandleChange, container } = renderStep({
      handleValidation: {
        available: false,
        checking: false,
        error: 'That handle is taken',
        clientValid: true,
        suggestions: ['sashawaves1'],
      },
      ctaDisabledReason: 'Choose another handle',
    });

    await user.type(
      screen.getByRole('textbox', { name: 'Claim Your Handle' }),
      ' X'
    );
    expect(onHandleChange).toHaveBeenLastCalledWith('sashawavesx');

    const suggestion = screen.getByRole('button', {
      name: 'jov.ie/sashawaves1',
    });
    expect(suggestion).toHaveAttribute('data-slot', 'plain-button');
    await user.click(suggestion);
    expect(onHandleChange).toHaveBeenLastCalledWith('sashawaves1');
    await expectNoA11yViolations(container);
  });

  it('shows the claimed confirmation without accessibility violations', async () => {
    const { container } = renderStep({ autoSubmitClaimed: true });
    expect(screen.getByText('jov.ie/sashawaves is yours.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
