import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';
import { OtpDigitInput } from './otp-digit-input';

function DigitHarness({ note }: { readonly note: string }) {
  const [digit, setDigit] = React.useState('');
  return (
    <div className='relative h-12 w-11'>
      <p>{note}</p>
      <OtpDigitInput
        aria-label='Digit 1 of 6'
        value={digit}
        onChange={event => setDigit(event.target.value.slice(-1))}
      />
    </div>
  );
}

describe('OtpDigitInput', () => {
  it('is a numeric one-time code field that fills its box', () => {
    render(<OtpDigitInput aria-label='Digit 1 of 6' />);
    const input = screen.getByRole('textbox', { name: 'Digit 1 of 6' });
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('pattern', '[0-9]*');
    expect(input).not.toHaveAttribute('tabindex');
    expect(input).toHaveClass(
      'absolute',
      'inset-0',
      'h-full',
      'w-full',
      'bg-transparent',
      'text-center',
      'border-none',
      'disabled:cursor-not-allowed'
    );
  });

  it('takes the face text size from the composing box', () => {
    render(
      <OtpDigitInput
        aria-label='Digit 1 of 6'
        className='text-[1.22rem] sm:text-[1.3rem]'
      />
    );
    expect(screen.getByRole('textbox')).toHaveClass(
      'text-[1.22rem]',
      'sm:text-[1.3rem]',
      'text-center'
    );
  });

  it('renders the autofill overlay out of the tab order with the code hint', () => {
    render(<OtpDigitInput variant='autofill' aria-label='Autofill code' />);
    const input = screen.getByRole('textbox', { name: 'Autofill code' });
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(input).toHaveAttribute('tabindex', '-1');
    expect(input).not.toHaveAttribute('pattern');
    expect(input).toHaveClass('opacity-0', 'text-base', 'z-0', 'cursor-text');
  });

  it('lets the caller override autocomplete and forwards the ref', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(
      <OtpDigitInput ref={ref} aria-label='Digit 2 of 6' autoComplete='off' />
    );
    expect(ref.current).toBe(screen.getByRole('textbox'));
    expect(ref.current).toHaveAttribute('autocomplete', 'off');
  });

  it('calls its handlers for typing, keys, focus and blur', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onKeyDown = vi.fn();
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    render(
      <OtpDigitInput
        aria-label='Digit 1 of 6'
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );
    await user.type(screen.getByRole('textbox'), '7');
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('keeps the typed digit and focus across a rerender, Escape and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DigitHarness note='Enter the code' />);
    const input = screen.getByRole('textbox', { name: 'Digit 1 of 6' });

    await user.type(input, '4');
    expect(input).toHaveValue('4');

    rerender(<DigitHarness note='We sent a new code' />);
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('4');
    expect(input).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(input).toHaveValue('4');
    expect(input).toHaveFocus();

    fireEvent.blur(input);
    expect(input).toHaveValue('4');
  });

  it('does not take input while disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <OtpDigitInput aria-label='Digit 1 of 6' disabled onChange={onChange} />
    );
    await user.type(screen.getByRole('textbox'), '3');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('has no axe violations across empty, filled, invalid, disabled and autofill', async () => {
    const { container } = render(
      <div>
        <OtpDigitInput aria-label='Digit 1 of 6' />
        <OtpDigitInput aria-label='Digit 2 of 6' value='5' readOnly />
        <OtpDigitInput
          aria-label='Digit 3 of 6'
          aria-invalid
          aria-describedby='otp-error'
        />
        <p id='otp-error'>That code is not valid.</p>
        <OtpDigitInput aria-label='Digit 4 of 6' disabled />
        <OtpDigitInput variant='autofill' aria-label='Autofill code' />
      </div>
    );
    await expectNoA11yViolations(container);
  });

  it('has no axe violations inside a right-to-left row', async () => {
    const { container } = render(
      <fieldset dir='rtl'>
        <legend>رمز التحقق</legend>
        <OtpDigitInput aria-label='Digit 1 of 6' value='1' readOnly />
        <OtpDigitInput aria-label='Digit 2 of 6' />
      </fieldset>
    );
    await expectNoA11yViolations(container);
  });
});
