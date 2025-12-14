import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OtpSignInForm } from '@/components/auth/OtpSignInForm';

// Mock Clerk Elements
vi.mock('@clerk/elements/common', () => ({
  GlobalError: ({ className }: { className?: string }) => (
    <div data-testid='global-error' className={className} />
  ),
  Field: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='field'>{children}</div>
  ),
  Label: ({
    children,
    className,
  }: {
    children?: React.ReactNode;
    className?: string;
  }) => (
    <label data-testid='clerk-label' className={className}>
      {children}
    </label>
  ),
  Input: ({
    type,
    children,
    asChild,
    autoSubmit,
    length,
    'aria-label': ariaLabel,
  }: {
    type: string;
    children?: React.ReactNode;
    asChild?: boolean;
    autoSubmit?: boolean;
    length?: number;
    'aria-label'?: string;
  }) => (
    <div
      data-testid='clerk-input'
      data-type={type}
      data-aschild={asChild}
      data-auto-submit={autoSubmit}
      data-length={length}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  ),
  FieldError: ({ className }: { className?: string }) => (
    <div data-testid='field-error' className={className} />
  ),
  Loading: ({
    children,
  }: {
    children: (isLoading: boolean) => React.ReactNode;
  }) => children(false),
}));

vi.mock('@clerk/elements/sign-in', () => ({
  Root: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='signin-root'>{children}</div>
  ),
  Step: ({
    name,
    children,
    'aria-label': ariaLabel,
  }: {
    name: string;
    children: React.ReactNode;
    'aria-label'?: string;
  }) => (
    <div data-testid={`signin-step-${name}`} aria-label={ariaLabel}>
      {children}
    </div>
  ),
  Strategy: ({
    name,
    children,
  }: {
    name: string;
    children: React.ReactNode;
  }) => <div data-testid={`signin-strategy-${name}`}>{children}</div>,
  Action: ({
    children,
    className,
    'aria-busy': ariaBusy,
  }: {
    submit?: boolean;
    navigate?: string;
    children: React.ReactNode;
    className?: string;
    'aria-busy'?: boolean;
  }) => (
    <button
      data-testid='signin-action'
      className={className}
      aria-busy={ariaBusy}
    >
      {children}
    </button>
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('OtpSignInForm', () => {
  it('renders the signin form correctly', () => {
    render(<OtpSignInForm />);

    expect(screen.getByTestId('signin-root')).toBeInTheDocument();
  });

  it('renders both form steps', () => {
    render(<OtpSignInForm />);

    expect(screen.getByTestId('signin-step-start')).toBeInTheDocument();
    expect(screen.getByTestId('signin-step-verifications')).toBeInTheDocument();
  });

  it('includes ARIA labels for accessibility', () => {
    render(<OtpSignInForm />);

    const startStep = screen.getByTestId('signin-step-start');
    const verificationsStep = screen.getByTestId('signin-step-verifications');

    expect(startStep).toHaveAttribute('aria-label', 'Enter your email address');
    expect(verificationsStep).toHaveAttribute(
      'aria-label',
      'Verify your email with code'
    );
  });

  it('displays "Continue with Email" button in start step', () => {
    render(<OtpSignInForm />);

    const buttons = screen.getAllByTestId('signin-action');
    expect(buttons[0]).toHaveTextContent('Continue with Email');
  });

  it('displays "Verify Code" button in verifications step', () => {
    render(<OtpSignInForm />);

    const buttons = screen.getAllByTestId('signin-action');
    expect(buttons[1]).toHaveTextContent('Verify Code');
  });

  it('uses semantic design tokens for global error', () => {
    render(<OtpSignInForm />);

    const globalError = screen.getByTestId('global-error');
    expect(globalError).toHaveClass('text-destructive');
  });

  it('renders field errors with correct styling', () => {
    render(<OtpSignInForm />);

    const fieldErrors = screen.getAllByTestId('field-error');
    expect(fieldErrors.length).toBeGreaterThan(0);
  });

  it('renders email input field', () => {
    render(<OtpSignInForm />);

    const inputs = screen.getAllByTestId('clerk-input');
    expect(inputs[0]).toHaveAttribute('data-type', 'email');
  });

  it('renders OTP input with type="otp" and autoSubmit', () => {
    render(<OtpSignInForm />);

    const inputs = screen.getAllByTestId('clerk-input');
    const otpInput = inputs[1];
    expect(otpInput).toHaveAttribute('data-type', 'otp');
    expect(otpInput).toHaveAttribute('data-auto-submit', 'true');
  });

  it('has screen reader labels for form fields', () => {
    render(<OtpSignInForm />);

    const labels = screen.getAllByTestId('clerk-label');
    expect(labels.length).toBeGreaterThan(0);
    labels.forEach(label => {
      expect(label).toHaveClass('sr-only');
    });
  });

  it('has aria-live region for global errors', () => {
    render(<OtpSignInForm />);

    const errorContainer = screen.getByRole('alert');
    expect(errorContainer).toHaveAttribute('aria-live', 'polite');
  });
});
