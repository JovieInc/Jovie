import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OtpInput } from './OtpInput';
import type { OtpInputProps } from './types';

vi.mock('@/hooks/useHapticFeedback', () => ({
  useHapticFeedback: () => ({
    light: vi.fn(),
    medium: vi.fn(),
    success: vi.fn(),
  }),
}));

const digit = (n: number) => screen.getByLabelText(`Digit ${n} of 6`);
const box = (n: number) => digit(n).parentElement as HTMLElement;

function CodeHarness({
  note,
  ...props
}: OtpInputProps & { readonly note: string }) {
  return (
    <div>
      <p>{note}</p>
      <OtpInput autoFocus={false} {...props} />
    </div>
  );
}

describe('OtpInput', () => {
  it('advances on each digit and reports the completed code', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onComplete = vi.fn();
    render(
      <OtpInput autoFocus={false} onChange={onChange} onComplete={onComplete} />
    );

    await user.click(digit(1));
    await user.keyboard('123456');

    expect(onChange).toHaveBeenLastCalledWith('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
    expect(digit(6)).toHaveFocus();
  });

  it('moves back on Backspace from an empty box', async () => {
    const user = userEvent.setup();
    render(<OtpInput autoFocus={false} />);

    await user.click(digit(1));
    await user.keyboard('12');
    expect(digit(3)).toHaveFocus();
    await user.keyboard('{Backspace}');
    expect(digit(2)).toHaveFocus();
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
    expect(overlay).toHaveClass('opacity-0', 'text-base');

    fireEvent.change(overlay, { target: { value: '246810' } });
    expect(onComplete).toHaveBeenCalledWith('246810');
    expect(digit(4)).toHaveValue('8');
  });

  it('hints one-time-code on the first box only', () => {
    render(<OtpInput autoFocus={false} />);
    expect(digit(1)).toHaveAttribute('autocomplete', 'one-time-code');
    expect(digit(2)).toHaveAttribute('autocomplete', 'off');
  });

  it('marks every box invalid and points at the error message', () => {
    render(<OtpInput autoFocus={false} error errorId='otp-error' />);
    for (let n = 1; n <= 6; n++) {
      expect(digit(n)).toHaveAttribute('aria-invalid', 'true');
      expect(digit(n)).toHaveAttribute('aria-describedby', 'otp-error');
      expect(box(n)).toHaveClass('bg-pearl-error');
    }
  });

  it('locks every box while disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OtpInput autoFocus={false} disabled onChange={onChange} />);
    await user.type(digit(1), '1');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('otp-autofill-input')).toBeDisabled();
  });

  it('paints the hero box text with the on-media token in dark', () => {
    render(<OtpInput autoFocus={false} size='hero' />);
    expect(box(1)).toHaveClass('dark:text-on-media', 'h-8', 'w-7');
    expect(box(1).className).not.toMatch(/\b(?:text|bg|border)-white\b/);
    expect(digit(1)).toHaveClass('text-app');
  });

  it('keeps typed digits and focus across a rerender, Escape and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CodeHarness note='Enter the code' />);

    await user.click(digit(1));
    await user.keyboard('42');
    expect(digit(1)).toHaveValue('4');
    expect(digit(2)).toHaveValue('2');
    expect(digit(3)).toHaveFocus();

    rerender(<CodeHarness note='We sent a new code' />);
    expect(digit(1)).toHaveValue('4');
    expect(digit(2)).toHaveValue('2');
    expect(digit(3)).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(digit(2)).toHaveValue('2');
    expect(digit(3)).toHaveFocus();

    fireEvent.blur(digit(3));
    expect(digit(1)).toHaveValue('4');
    expect(digit(2)).toHaveValue('2');
    expect(screen.getByTestId('otp-autofill-input')).toHaveValue('42');
  });

  it.each([
    ['empty', {}],
    ['partial', { value: '123' }],
    ['error', { value: '000000', error: true, errorId: 'otp-error' }],
    ['disabled', { disabled: true }],
    ['compact', { size: 'compact' as const, value: '12' }],
    ['hero', { size: 'hero' as const, value: '12' }],
  ])('has no axe violations in the %s state', async (_state, props) => {
    const { container } = render(
      <div>
        <OtpInput autoFocus={false} {...props} />
        <p id='otp-error'>That code is not valid.</p>
      </div>
    );
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in a right-to-left layout', async () => {
    const { container } = render(
      <div dir='rtl'>
        <OtpInput autoFocus={false} aria-label='رمز التحقق' value='12' />
      </div>
    );
    await expectNoA11yViolations(container);
  });
});
