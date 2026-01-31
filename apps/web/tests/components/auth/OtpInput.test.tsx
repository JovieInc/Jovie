import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OtpInput } from '@/components/auth/atoms/otp-input';

// Mock haptic feedback hook
vi.mock('@/hooks/useHapticFeedback', () => ({
  useHapticFeedback: () => ({
    light: vi.fn(),
    medium: vi.fn(),
    success: vi.fn(),
  }),
}));

describe('OtpInput', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });
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
    const onChange = vi.fn();
    render(<OtpInput value='12' onChange={onChange} />);

    const secondInput = screen.getByLabelText('Digit 2 of 6');
    await user.click(secondInput);
    fireEvent.keyDown(secondInput, { key: 'Backspace' });

    expect(onChange).toHaveBeenCalledWith('1');
    expect(document.activeElement).toBe(secondInput);
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

  // New tests for enhanced functionality

  it('handles paste with spaces in code', () => {
    const onChange = vi.fn();
    render(<OtpInput onChange={onChange} />);

    const group = screen.getByRole('group', { name: 'One-time password' });

    // Simulate paste with spaces (e.g., "123 456")
    const clipboardData = {
      getData: () => '123 456',
    };
    fireEvent.paste(group, { clipboardData });

    expect(onChange).toHaveBeenCalledWith('123456');
  });

  it('handles paste with dashes in code', () => {
    const onChange = vi.fn();
    render(<OtpInput onChange={onChange} />);

    const group = screen.getByRole('group', { name: 'One-time password' });

    // Simulate paste with dashes (e.g., "123-456")
    const clipboardData = {
      getData: () => '123-456',
    };
    fireEvent.paste(group, { clipboardData });

    expect(onChange).toHaveBeenCalledWith('123456');
  });

  it('truncates paste longer than 6 digits', () => {
    const onChange = vi.fn();
    render(<OtpInput onChange={onChange} />);

    const group = screen.getByRole('group', { name: 'One-time password' });

    // Simulate paste with more than 6 digits
    const clipboardData = {
      getData: () => '12345678',
    };
    fireEvent.paste(group, { clipboardData });

    expect(onChange).toHaveBeenCalledWith('123456');
  });

  it('renders autofill overlay input with correct attributes', () => {
    render(<OtpInput />);

    const autofillInput = screen.getByTestId('otp-autofill-input');
    expect(autofillInput).toBeInTheDocument();
    expect(autofillInput).toHaveAttribute('autocomplete', 'one-time-code');
    expect(autofillInput).toHaveAttribute('inputMode', 'numeric');
  });

  it('first visible input has autocomplete one-time-code', () => {
    render(<OtpInput />);

    const firstInput = screen.getByLabelText('Digit 1 of 6');
    expect(firstInput).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('handles arrow key navigation', async () => {
    const user = userEvent.setup();
    render(<OtpInput value='123' />);

    const firstInput = screen.getByLabelText('Digit 1 of 6');
    const secondInput = screen.getByLabelText('Digit 2 of 6');

    await user.click(firstInput);
    fireEvent.keyDown(firstInput, { key: 'ArrowRight' });

    expect(document.activeElement).toBe(secondInput);

    fireEvent.keyDown(secondInput, { key: 'ArrowLeft' });

    expect(document.activeElement).toBe(firstInput);
  });

  it('associates error with inputs via aria-describedby', () => {
    const errorId = 'test-error';
    render(<OtpInput error errorId={errorId} />);

    const firstInput = screen.getByLabelText('Digit 1 of 6');
    expect(firstInput).toHaveAttribute('aria-describedby', errorId);

    const group = screen.getByRole('group', { name: 'One-time password' });
    expect(group).toHaveAttribute('aria-describedby', errorId);
  });

  it('clears current digit on backspace when filled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OtpInput value='123' onChange={onChange} />);

    // Focus second input which has "2"
    const secondInput = screen.getByLabelText('Digit 2 of 6');
    await user.click(secondInput);
    fireEvent.keyDown(secondInput, { key: 'Backspace' });

    // Should clear digit 2, resulting in "13"
    expect(onChange).toHaveBeenCalledWith('13');
  });

  it('moves to previous on backspace when current is empty', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OtpInput value='12' onChange={onChange} />);

    // Focus third input which is empty
    const thirdInput = screen.getByLabelText('Digit 3 of 6');
    await user.click(thirdInput);
    fireEvent.keyDown(thirdInput, { key: 'Backspace' });

    // Should clear digit 2 and focus input 2
    expect(onChange).toHaveBeenCalledWith('1');
    const secondInput = screen.getByLabelText('Digit 2 of 6');
    expect(document.activeElement).toBe(secondInput);
  });

  it('handles autofill input change', () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    const autofillInput = screen.getByTestId('otp-autofill-input');

    // Simulate autofill populating the hidden input
    fireEvent.change(autofillInput, { target: { value: '654321' } });

    expect(onComplete).toHaveBeenCalledWith('654321');
  });

  // iOS-specific tests
  it('handles paste on individual input (iOS compatibility)', () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    const firstInput = screen.getByLabelText('Digit 1 of 6');

    // Simulate paste event on individual input (iOS Safari)
    const clipboardData = {
      getData: () => '123456',
    };
    fireEvent.paste(firstInput, { clipboardData });

    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('handles iOS autofill via insertReplacementText', () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    const firstInput = screen.getByLabelText('Digit 1 of 6');

    // Simulate iOS OTP keyboard autofill (insertReplacementText)
    fireEvent.input(firstInput, {
      target: { value: '987654' },
      nativeEvent: { inputType: 'insertReplacementText' },
    });

    expect(onComplete).toHaveBeenCalledWith('987654');
  });

  it('handles iOS paste via insertFromPaste input type', () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    const firstInput = screen.getByLabelText('Digit 1 of 6');

    // Simulate iOS paste via input event
    fireEvent.input(firstInput, {
      target: { value: '246810' },
      nativeEvent: { inputType: 'insertFromPaste' },
    });

    expect(onComplete).toHaveBeenCalledWith('246810');
  });

  it('handles multi-character input change (iOS autofill)', () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    const firstInput = screen.getByLabelText('Digit 1 of 6');

    // Simulate iOS autofill inserting full OTP via onChange
    fireEvent.change(firstInput, { target: { value: '135792' } });

    expect(onComplete).toHaveBeenCalledWith('135792');
  });

  it('handles partial multi-character input and focuses next empty input', () => {
    const onChange = vi.fn();
    render(<OtpInput onChange={onChange} />);

    const firstInput = screen.getByLabelText('Digit 1 of 6');

    // Simulate partial paste/autofill
    fireEvent.change(firstInput, { target: { value: '123' } });

    expect(onChange).toHaveBeenCalledWith('123');

    // Should focus the 4th input (index 3)
    const fourthInput = screen.getByLabelText('Digit 4 of 6');
    expect(document.activeElement).toBe(fourthInput);
  });
});
