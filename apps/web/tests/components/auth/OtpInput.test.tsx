import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OtpInput } from '@/components/auth/atoms/OtpInput';

// Mock haptic feedback hook
vi.mock('@/hooks/useHapticFeedback', () => ({
  useHapticFeedback: () => ({
    light: vi.fn(),
    medium: vi.fn(),
    success: vi.fn(),
  }),
}));

describe('OtpInput', () => {
  it('renders 6 digit input boxes', () => {
    render(<OtpInput />);

    const group = screen.getByRole('group', { name: 'One-time password' });
    expect(group).toBeInTheDocument();

    // Should have 6 digit labels
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByLabelText(`Digit ${i} of 6`)).toBeInTheDocument();
    }
  });

  it('has accessible aria-label', () => {
    render(<OtpInput aria-label='Enter verification code' />);

    const group = screen.getByRole('group', {
      name: 'Enter verification code',
    });
    expect(group).toBeInTheDocument();
  });

  it('uses default aria-label when not provided', () => {
    render(<OtpInput />);

    const group = screen.getByRole('group', { name: 'One-time password' });
    expect(group).toBeInTheDocument();
  });

  it('accepts numeric input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OtpInput onChange={onChange} />);

    const firstInput = screen.getByLabelText('Digit 1 of 6');
    await user.type(firstInput, '1');

    expect(onChange).toHaveBeenCalledWith('1');
  });

  it('auto-advances to next input on digit entry', async () => {
    const user = userEvent.setup();
    render(<OtpInput />);

    const firstInput = screen.getByLabelText('Digit 1 of 6');
    const secondInput = screen.getByLabelText('Digit 2 of 6');

    await user.type(firstInput, '1');

    expect(document.activeElement).toBe(secondInput);
  });

  it('handles backspace to go to previous input', async () => {
    const user = userEvent.setup();
    render(<OtpInput value='12' />);

    const secondInput = screen.getByLabelText('Digit 2 of 6');
    await user.click(secondInput);
    await user.keyboard('{Backspace}');

    const firstInput = screen.getByLabelText('Digit 1 of 6');
    expect(document.activeElement).toBe(firstInput);
  });

  it('rejects non-numeric input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OtpInput onChange={onChange} />);

    const firstInput = screen.getByLabelText('Digit 1 of 6');
    await user.type(firstInput, 'a');

    // onChange should not be called with letters
    expect(onChange).not.toHaveBeenCalledWith('a');
  });

  it('calls onComplete when all 6 digits are entered', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    const firstInput = screen.getByLabelText('Digit 1 of 6');
    await user.type(firstInput, '123456');

    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('handles paste with full code', async () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    const group = screen.getByRole('group', { name: 'One-time password' });

    // Simulate paste event
    const clipboardData = {
      getData: () => '123456',
    };
    fireEvent.paste(group, { clipboardData });

    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('handles paste with partial code', async () => {
    const onChange = vi.fn();
    render(<OtpInput onChange={onChange} />);

    const group = screen.getByRole('group', { name: 'One-time password' });

    // Simulate paste event
    const clipboardData = {
      getData: () => '123',
    };
    fireEvent.paste(group, { clipboardData });

    expect(onChange).toHaveBeenCalledWith('123');
  });

  it('respects disabled state', () => {
    render(<OtpInput disabled />);

    const firstInput = screen.getByLabelText('Digit 1 of 6');
    expect(firstInput).toBeDisabled();
  });

  it('shows error styling when error prop is true', () => {
    const { container } = render(<OtpInput error />);

    const digitBox = container.querySelector('[class*="border-destructive"]');
    expect(digitBox).toBeInTheDocument();
  });

  it('renders progress indicator on mobile', () => {
    render(<OtpInput value='123' />);

    // Progress indicator should exist (hidden on desktop via sm:hidden)
    const progressDots = document.querySelectorAll(
      '[class*="rounded-full"][class*="bg-"]'
    );
    expect(progressDots.length).toBe(6);
  });

  it('supports controlled value', () => {
    const { rerender } = render(<OtpInput value='123' />);

    expect(screen.getByLabelText('Digit 1 of 6')).toHaveValue('1');
    expect(screen.getByLabelText('Digit 2 of 6')).toHaveValue('2');
    expect(screen.getByLabelText('Digit 3 of 6')).toHaveValue('3');

    rerender(<OtpInput value='456789' />);

    expect(screen.getByLabelText('Digit 1 of 6')).toHaveValue('4');
    expect(screen.getByLabelText('Digit 6 of 6')).toHaveValue('9');
  });
});
