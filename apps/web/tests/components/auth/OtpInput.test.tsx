import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OtpInput } from '@/components/auth/atoms/OtpInput';

// Mock Clerk Elements
vi.mock('@clerk/elements/common', () => ({
  Input: ({
    type,
    autoSubmit,
    length,
    className,
    'aria-label': ariaLabel,
    render,
  }: {
    type: string;
    autoSubmit?: boolean;
    length?: number;
    className?: string;
    'aria-label'?: string;
    render?: (props: { value: string; status: string }) => React.ReactNode;
  }) => (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: Test mock component with ARIA props
    <div
      data-testid='clerk-otp-input'
      data-type={type}
      data-auto-submit={autoSubmit}
      data-length={length}
      className={className}
      aria-label={ariaLabel}
    >
      {/* Render 6 digit slots for testing */}
      {render && (
        <div data-testid='otp-slots'>
          {Array.from({ length: length || 6 }).map((_, i) => (
            <div key={i} data-testid={`otp-slot-${i}`}>
              {render({
                value: '',
                status: i === 0 ? 'cursor' : 'selected',
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  ),
}));

describe('OtpInput', () => {
  it('renders with type="otp"', () => {
    render(<OtpInput />);

    const input = screen.getByTestId('clerk-otp-input');
    expect(input).toHaveAttribute('data-type', 'otp');
  });

  it('has autoSubmit enabled by default', () => {
    render(<OtpInput />);

    const input = screen.getByTestId('clerk-otp-input');
    expect(input).toHaveAttribute('data-auto-submit', 'true');
  });

  it('can disable autoSubmit', () => {
    render(<OtpInput autoSubmit={false} />);

    const input = screen.getByTestId('clerk-otp-input');
    expect(input).toHaveAttribute('data-auto-submit', 'false');
  });

  it('has length of 6 digits', () => {
    render(<OtpInput />);

    const input = screen.getByTestId('clerk-otp-input');
    expect(input).toHaveAttribute('data-length', '6');
  });

  it('renders 6 digit slots', () => {
    render(<OtpInput />);

    const slots = screen.getByTestId('otp-slots');
    expect(slots.children).toHaveLength(6);
  });

  it('has accessible aria-label', () => {
    render(<OtpInput aria-label='Enter verification code' />);

    const input = screen.getByTestId('clerk-otp-input');
    expect(input).toHaveAttribute('aria-label', 'Enter verification code');
  });

  it('uses default aria-label when not provided', () => {
    render(<OtpInput />);

    const input = screen.getByTestId('clerk-otp-input');
    expect(input).toHaveAttribute('aria-label', 'One-time password');
  });

  it('renders with flex layout for digit slots', () => {
    render(<OtpInput />);

    const input = screen.getByTestId('clerk-otp-input');
    expect(input).toHaveClass('flex', 'justify-center', 'gap-2');
  });

  it('renders cursor indicator for active slot', () => {
    render(<OtpInput />);

    // First slot should have cursor status
    const firstSlot = screen.getByTestId('otp-slot-0');
    const cursorIndicator = firstSlot.querySelector('[aria-hidden="true"]');
    expect(cursorIndicator).toBeInTheDocument();
  });
});
