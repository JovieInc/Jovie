import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OtpSignUpForm } from '@/components/auth/OtpSignUpForm';

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({
    client: {},
  }),
}));

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

  Connection: ({
    name,
    children,
    className,
    disabled,
    'aria-busy': ariaBusy,
  }: {
    name: string;
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
    'aria-busy'?: boolean;
  }) => (
    <button
      data-testid='clerk-connection'
      data-name={name}
      className={className}
      disabled={disabled}
      aria-busy={ariaBusy}
    >
      {children}
    </button>
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
    'aria-busy': ariaBusy,
  }: {
    submit?: boolean;
    navigate?: string;
    children: React.ReactNode;
    className?: string;
    'aria-busy'?: boolean;
  }) => (
    <button
      data-testid='signup-action'
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

    expect(startStep).toHaveAttribute('aria-label', 'Choose a sign-up method');
    expect(verificationsStep).toHaveAttribute(
      'aria-label',
      'Verify your email with code'
    );
  });

  it('renders the multi-method sign-up buttons', () => {
    render(<OtpSignUpForm />);

    expect(screen.getByText('Continue with email')).toBeInTheDocument();
    expect(screen.getByText('Continue with Spotify')).toBeInTheDocument();
    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
  });

  it('displays "Verify Code" button in verifications step', () => {
    render(<OtpSignUpForm />);

    const buttons = screen.getAllByTestId('signup-action');
    expect(
      buttons.some(button => button.textContent?.includes('Verify Code'))
    ).toBe(true);
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

  it('renders email input field after choosing email flow', () => {
    render(<OtpSignUpForm />);

    fireEvent.click(screen.getByText('Continue with email'));

    const inputs = screen.getAllByTestId('clerk-input');
    expect(inputs[0]).toHaveAttribute('data-type', 'email');
  });

  it('renders OTP input with type="otp" and autoSubmit', () => {
    render(<OtpSignUpForm />);

    const verificationsStep = screen.getByTestId('signup-step-verifications');
    const otpInput = within(verificationsStep).getByTestId('clerk-input');
    expect(otpInput).toHaveAttribute('data-type', 'otp');
    expect(otpInput).toHaveAttribute('data-auto-submit', 'true');
  });

  it('has screen reader labels for form fields', () => {
    render(<OtpSignUpForm />);

    const labels = screen.getAllByTestId('clerk-label');
    expect(labels.length).toBeGreaterThan(0);
    labels.forEach(label => {
      expect(label).toHaveClass('sr-only');
    });
  });

  it('has aria-live region for global errors', () => {
    render(<OtpSignUpForm />);

    const errorContainer = screen.getByRole('alert');
    expect(errorContainer).toHaveAttribute('aria-live', 'polite');
  });
});
