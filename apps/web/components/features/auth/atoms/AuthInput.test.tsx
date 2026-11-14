import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AuthInput } from './AuthInput';

/** Mirrors EmailCodeAuthForm: a controlled email field whose parent re-renders. */
function ControlledEmailField({
  error = false,
  tick = 0,
}: {
  readonly error?: boolean;
  readonly tick?: number;
}) {
  const [email, setEmail] = useState('');
  return (
    <div data-tick={tick}>
      <label htmlFor='auth-email'>Email</label>
      <AuthInput
        id='auth-email'
        type='email'
        name='emailAddress'
        autoComplete='email'
        placeholder='you@example.com'
        value={email}
        error={error}
        onChange={event => setEmail(event.target.value)}
      />
    </div>
  );
}

describe('AuthInput states', () => {
  it('applies the mobile email keyboard hints to an email field', async () => {
    const { container } = render(
      <AuthInput
        type='email'
        aria-label='Email'
        placeholder='you@example.com'
      />
    );

    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('inputmode', 'email');
    expect(input).toHaveAttribute('autocapitalize', 'none');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveAttribute('enterkeyhint', 'next');
    expect(input).not.toHaveAttribute('aria-invalid');
    await expectNoA11yViolations(container);
  });

  it('leaves a text field to the browser defaults and honours caller hints', async () => {
    const { container } = render(
      <AuthInput
        type='text'
        aria-label='Display Name'
        enterKeyHint='done'
        autoCapitalize='words'
      />
    );

    const input = screen.getByRole('textbox', { name: 'Display Name' });
    expect(input).not.toHaveAttribute('inputmode');
    expect(input).toHaveAttribute('autocapitalize', 'words');
    expect(input).toHaveAttribute('enterkeyhint', 'done');
    await expectNoA11yViolations(container);
  });

  it('marks an errored field invalid without dropping what was typed', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<ControlledEmailField />);

    const input = screen.getByRole('textbox', { name: 'Email' });
    await user.type(input, 'not-an-email');
    rerender(<ControlledEmailField error />);

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveClass('border-destructive');
    expect(input).toHaveValue('not-an-email');
    await expectNoA11yViolations(container);
  });

  it('keeps typed text and focus through a parent re-render, Escape and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ControlledEmailField tick={0} />);

    const input = screen.getByRole('textbox', { name: 'Email' });
    await user.type(input, 'artist@example.com');
    rerender(<ControlledEmailField tick={1} />);

    expect(screen.getByRole('textbox', { name: 'Email' })).toBe(input);
    expect(input).toHaveValue('artist@example.com');
    expect(input).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(input).toHaveValue('artist@example.com');
    expect(input).toHaveFocus();

    await user.tab();
    expect(input).not.toHaveFocus();
    expect(input).toHaveValue('artist@example.com');
  });

  it('has no axe violations for a long email in a right-to-left page', async () => {
    const user = userEvent.setup();
    const email = 'booking.and.management.team@example-records-group.com';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ControlledEmailField />
      </div>
    );

    const input = screen.getByRole('textbox', { name: 'Email' });
    await user.type(input, email);
    expect(input).toHaveValue(email);
    await expectNoA11yViolations(container);
  });
});
