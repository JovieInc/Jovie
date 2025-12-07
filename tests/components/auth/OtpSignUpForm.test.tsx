import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OtpSignUpForm } from '@/components/auth/OtpSignUpForm';

// Mock Clerk Elements
vi.mock('@clerk/elements/common', () => ({
  GlobalError: ({ className }: { className?: string }) => (
    <div data-testid='global-error' className={className} />
  ),
  Field: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='field'>{children}</div>
  ),
  Input: ({
    type,
    children,
    asChild,
  }: {
    type: string;
    children?: React.ReactNode;
    asChild?: boolean;
  }) => (
    <div data-testid='clerk-input' data-type={type} data-aschild={asChild}>
      {children}
    </div>
  ),
  FieldError: ({ className }: { className?: string }) => (
    <div data-testid='field-error' className={className} />
  ),
}));

vi.mock('@clerk/elements/sign-up', () => ({
  Root: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='signup-root'>{children}</div>
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
    <div data-testid={`signup-step-${name}`} aria-label={ariaLabel}>
      {children}
    </div>
  ),
  Strategy: ({
    name,
    children,
  }: {
    name: string;
    children: React.ReactNode;
  }) => <div data-testid={`signup-strategy-${name}`}>{children}</div>,
  Action: ({
    children,
    className,
  }: {
    submit?: boolean;
    children: React.ReactNode;
    className?: string;
  }) => (
    <button data-testid='signup-action' className={className}>
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

describe('OtpSignUpForm', () => {
  it('renders the signup form correctly', () => {
    render(<OtpSignUpForm />);

    expect(screen.getByTestId('signup-root')).toBeInTheDocument();
  });

  it('renders both form steps', () => {
    render(<OtpSignUpForm />);

    expect(screen.getByTestId('signup-step-start')).toBeInTheDocument();
    expect(screen.getByTestId('signup-step-verifications')).toBeInTheDocument();
  });

  it('includes ARIA labels for accessibility', () => {
    render(<OtpSignUpForm />);

    const startStep = screen.getByTestId('signup-step-start');
    const verificationsStep = screen.getByTestId('signup-step-verifications');

    expect(startStep).toHaveAttribute('aria-label', 'Enter your email address');
    expect(verificationsStep).toHaveAttribute(
      'aria-label',
      'Verify your email with code'
    );
  });

  it('displays "Continue with Email" button in start step', () => {
    render(<OtpSignUpForm />);

    const buttons = screen.getAllByTestId('signup-action');
    expect(buttons[0]).toHaveTextContent('Continue with Email');
  });

  it('displays "Continue" button in verifications step', () => {
    render(<OtpSignUpForm />);

    const buttons = screen.getAllByTestId('signup-action');
    expect(buttons[1]).toHaveTextContent('Continue');
  });

  it('uses semantic design tokens for global error', () => {
    render(<OtpSignUpForm />);

    const globalError = screen.getByTestId('global-error');
    expect(globalError).toHaveClass('text-destructive');
  });

  it('renders field errors with correct styling', () => {
    render(<OtpSignUpForm />);

    const fieldErrors = screen.getAllByTestId('field-error');
    expect(fieldErrors.length).toBeGreaterThan(0);
  });

  it('renders email input field', () => {
    render(<OtpSignUpForm />);

    const inputs = screen.getAllByTestId('clerk-input');
    expect(inputs[0]).toHaveAttribute('data-type', 'email');
  });

  it('renders code input field for OTP', () => {
    render(<OtpSignUpForm />);

    const inputs = screen.getAllByTestId('clerk-input');
    expect(inputs[1]).toHaveAttribute('data-type', 'text');
  });

  it('uses AuthInput component with asChild pattern', () => {
    render(<OtpSignUpForm />);

    const inputs = screen.getAllByTestId('clerk-input');
    inputs.forEach(input => {
      expect(input).toHaveAttribute('data-aschild', 'true');
    });
  });
});
