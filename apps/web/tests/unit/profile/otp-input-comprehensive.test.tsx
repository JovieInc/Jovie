import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useHapticFeedback', () => ({
  useHapticFeedback: () => ({
    light: vi.fn(),
    medium: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    heavy: vi.fn(),
  }),
}));

// Must import after mocks are set up
import { OtpInput } from '@/features/auth/atoms/otp-input/OtpInput';

/**
 * Returns only the 6 visible digit inputs, excluding the autofill overlay input.
 */
function getDigitInputs(): HTMLInputElement[] {
  return screen
    .getAllByRole('textbox')
    .filter(
      el => !((el as HTMLElement).dataset.testid === 'otp-autofill-input')
    )
    .filter(el =>
      el.getAttribute('aria-label')?.startsWith('Digit ')
    ) as HTMLInputElement[];
}

describe('OtpInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders 6 digit input slots', () => {
    render(<OtpInput autoFocus={false} />);

    const inputs = getDigitInputs();
    expect(inputs).toHaveLength(6);

    for (let i = 0; i < 6; i++) {
      expect(inputs[i]).toHaveAttribute('aria-label', `Digit ${i + 1} of 6`);
    }
  });

  it('auto-advances focus on digit entry', async () => {
    const onChange = vi.fn();
    render(<OtpInput onChange={onChange} autoFocus={false} />);

    const inputs = getDigitInputs();
    inputs[0].focus();

    fireEvent.change(inputs[0], { target: { value: '1' } });

    expect(document.activeElement).toBe(inputs[1]);
  });

  it('backspace moves to previous input', () => {
    render(<OtpInput autoFocus={false} />);

    const inputs = getDigitInputs();
    inputs[1].focus();

    fireEvent.keyDown(inputs[1], { key: 'Backspace' });

    expect(document.activeElement).toBe(inputs[0]);
  });

  it('pastes full 6-digit code', () => {
    const onChange = vi.fn();
    render(<OtpInput onChange={onChange} autoFocus={false} />);

    const inputs = getDigitInputs();
    inputs[0].focus();

    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => '123456' },
    });

    expect(onChange).toHaveBeenCalledWith('123456');
  });

  it('rejects non-digit characters', () => {
    const onChange = vi.fn();
    render(<OtpInput onChange={onChange} autoFocus={false} />);

    const inputs = getDigitInputs();
    inputs[0].focus();

    fireEvent.change(inputs[0], { target: { value: 'abc' } });

    // onChange should not be called since no digits were extracted
    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires onComplete when all 6 digits entered', () => {
    const onComplete = vi.fn();
    const onChange = vi.fn();
    render(
      <OtpInput onChange={onChange} onComplete={onComplete} autoFocus={false} />
    );

    const inputs = getDigitInputs();

    for (let i = 0; i < 6; i++) {
      inputs[i].focus();
      fireEvent.change(inputs[i], { target: { value: String(i + 1) } });
    }

    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('applies disabled state to all inputs', () => {
    render(<OtpInput disabled autoFocus={false} />);

    const inputs = getDigitInputs();
    expect(inputs).toHaveLength(6);

    for (const input of inputs) {
      expect(input).toBeDisabled();
    }
  });

  it('ArrowLeft moves focus to previous input', () => {
    render(<OtpInput autoFocus={false} />);

    const inputs = getDigitInputs();
    inputs[2].focus();

    fireEvent.keyDown(inputs[2], { key: 'ArrowLeft' });

    expect(document.activeElement).toBe(inputs[1]);
  });

  it('ArrowRight moves focus to next input', () => {
    render(<OtpInput autoFocus={false} />);

    const inputs = getDigitInputs();
    inputs[2].focus();

    fireEvent.keyDown(inputs[2], { key: 'ArrowRight' });

    expect(document.activeElement).toBe(inputs[3]);
  });
});
