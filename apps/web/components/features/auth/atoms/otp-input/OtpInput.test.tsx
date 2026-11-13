import { render, screen } from '@testing-library/react';
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
}: {
  readonly onComplete?: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  const [renders, setRenders] = useState(0);
  return (
    <>
      <OtpInput
        value={value}
        onChange={setValue}
        onComplete={onComplete}
        autoFocus={false}
      />
      <button type='button' onClick={() => setRenders(renders + 1)}>
        Rerender {renders}
      </button>
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
    render(<ControlledOtp />);

    await user.type(digit(1), '123');
    await user.click(screen.getByRole('button', { name: 'Rerender 0' }));
    await user.click(digit(4));
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
});
