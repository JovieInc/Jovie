import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OtpInput } from './OtpInput';

vi.mock('@/hooks/useHapticFeedback', () => ({
  useHapticFeedback: () => ({
    light: vi.fn(),
    medium: vi.fn(),
    success: vi.fn(),
  }),
}));

const digit = (n: number) => screen.getByLabelText(`Digit ${n} of 6`);

function ControlledOtp({
  onComplete,
  note = '',
}: {
  readonly onComplete?: (value: string) => void;
  readonly note?: string;
}) {
  const [value, setValue] = useState('');
  return (
    <>
      <p>{note}</p>
      <OtpInput
        value={value}
        onChange={setValue}
        onComplete={onComplete}
        autoFocus={false}
      />
    </>
  );
}

describe('OtpInput', () => {
  it('advances through the boxes as digits are typed and reports the code', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OtpInput onChange={onChange} autoFocus={false} />);

    await user.click(digit(1));
    await user.keyboard('12');

    expect(digit(1)).toHaveValue('1');
    expect(digit(2)).toHaveValue('2');
    expect(digit(3)).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('12');
  });

  it('keeps typed digits and focus when the parent re-renders', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ControlledOtp note='Enter the code' />);

    await user.type(digit(1), '123');
    const focusedInput = digit(4);
    expect(focusedInput).toHaveFocus();
    rerender(<ControlledOtp note='We sent a new code' />);
    expect(digit(4)).toBe(focusedInput);
    expect(digit(4)).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(digit(1)).toHaveValue('1');
    expect(digit(2)).toHaveValue('2');
    expect(digit(3)).toHaveValue('3');
    expect(screen.getByTestId('otp-autofill-input')).toHaveValue('123');
    expect(digit(4)).toHaveFocus();
  });

  it('completes once all six digits are in', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<ControlledOtp onComplete={onComplete} />);

    await user.type(digit(1), '123456');

    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('steps back with Backspace', async () => {
    const user = userEvent.setup();
    render(<ControlledOtp />);

    await user.type(digit(1), '12');
    await user.keyboard('{Backspace}');

    expect(digit(2)).toHaveValue('');
    expect(digit(1)).toHaveValue('1');
  });

  it('fills every box from a pasted code', () => {
    const onComplete = vi.fn();
    render(<OtpInput autoFocus={false} onComplete={onComplete} />);

    fireEvent.paste(screen.getByRole('group', { name: 'One-time password' }), {
      clipboardData: { getData: () => '987654' },
    });

    expect(onComplete).toHaveBeenCalledWith('987654');
    expect(digit(1)).toHaveValue('9');
    expect(digit(6)).toHaveValue('4');
  });

  it('takes a platform one-time code through the autofill overlay', () => {
    const onComplete = vi.fn();
    render(<OtpInput autoFocus={false} onComplete={onComplete} />);

    const overlay = screen.getByTestId('otp-autofill-input');
    expect(overlay).toHaveAttribute('autocomplete', 'one-time-code');
    expect(overlay).toHaveAttribute('tabindex', '-1');
    expect(overlay).toHaveAttribute('inputmode', 'numeric');

    fireEvent.change(overlay, { target: { value: '246810' } });
    expect(onComplete).toHaveBeenCalledWith('246810');
    expect(digit(4)).toHaveValue('8');
  });

  it('hints one-time-code on the first box only', () => {
    render(<OtpInput autoFocus={false} />);
    expect(digit(1)).toHaveAttribute('autocomplete', 'one-time-code');
    expect(digit(2)).toHaveAttribute('autocomplete', 'off');
  });

  it('marks every box invalid and ties it to the error message', () => {
    render(
      <>
        <OtpInput value='000000' error errorId='otp-error' autoFocus={false} />
        <p id='otp-error'>That code did not match.</p>
      </>
    );

    expect(digit(1)).toHaveAttribute('aria-invalid', 'true');
    expect(digit(1)).toHaveAttribute('aria-describedby', 'otp-error');
    expect(
      screen.getByRole('group', { name: 'One-time password' })
    ).toHaveAttribute('aria-describedby', 'otp-error');
  });

  it('disables every box and the autofill field', () => {
    render(<OtpInput value='12' disabled autoFocus={false} />);

    expect(digit(1)).toBeDisabled();
    expect(digit(6)).toBeDisabled();
    expect(screen.getByTestId('otp-autofill-input')).toBeDisabled();
  });

  it('draws the hero digits with the on-media token, not raw white', () => {
    render(<OtpInput size='hero' autoFocus={false} />);

    const shell = digit(1).closest('div');
    expect(shell?.className).toContain('dark:text-on-media');
    expect(shell?.className).not.toMatch(/\b(?:bg|text|border)-white\b/);
  });

  it('has no accessibility violations empty, filled or in error', async () => {
    const { container, rerender } = render(<OtpInput autoFocus={false} />);
    await expectNoA11yViolations(container);

    rerender(<OtpInput value='123' autoFocus={false} />);
    await expectNoA11yViolations(container);

    rerender(
      <>
        <OtpInput value='000000' error errorId='otp-error' autoFocus={false} />
        <p id='otp-error'>That code did not match.</p>
      </>
    );
    await expectNoA11yViolations(container);
  });

  it('has no accessibility violations in a right-to-left layout', async () => {
    const { container } = render(
      <div dir='rtl'>
        <OtpInput autoFocus={false} aria-label='رمز التحقق' value='12' />
      </div>
    );
    await expectNoA11yViolations(container);
  });
});
