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
    children: React.ReactNode;
    className?: string;
  }) => (
    <label data-testid='label' className={className}>
      {children}
    </label>
  ),
  Input: ({ type, className }: { type: string; className?: string }) => (
    <input
      data-testid='input'
      type={type}
      className={className}
      aria-label={type === 'email' ? 'Email input' : 'Code input'}
    />
  ),
  FieldError: ({ className }: { className?: string }) => (
    <div data-testid='field-error' className={className} />
  ),
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
  Action: ({
    children,
    className,
  }: {
    submit?: boolean;
    children: React.ReactNode;
    className?: string;
  }) => (
    <button data-testid='signin-action' className={className}>
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

  it('renders email input with correct label', () => {
    render(<OtpSignInForm />);

    const labels = screen.getAllByTestId('label');
    expect(labels[0]).toHaveTextContent('Email address');
  });

  it('renders verification code input with correct label', () => {
    render(<OtpSignInForm />);

    const labels = screen.getAllByTestId('label');
    expect(labels[1]).toHaveTextContent('Enter the code we emailed you');
  });

  it('displays "Send code" button in start step', () => {
    render(<OtpSignInForm />);

    const buttons = screen.getAllByTestId('signin-action');
    expect(buttons[0]).toHaveTextContent('Send code');
  });

  it('displays "Continue" button in verifications step', () => {
    render(<OtpSignInForm />);

    const buttons = screen.getAllByTestId('signin-action');
    expect(buttons[1]).toHaveTextContent('Continue');
  });

  it('renders navigation link to signup', () => {
    render(<OtpSignInForm />);

    const signupLinks = screen.getAllByText('Sign up');
    expect(signupLinks).toHaveLength(2); // One in each step
    signupLinks.forEach(link => {
      expect(link.closest('a')).toHaveAttribute('href', '/signup');
    });
  });

  it('uses semantic design tokens instead of hardcoded colors', () => {
    render(<OtpSignInForm />);

    const globalError = screen.getByTestId('global-error');
    expect(globalError).toHaveClass('text-destructive');

    const fieldErrors = screen.getAllByTestId('field-error');
    fieldErrors.forEach(error => {
      expect(error).toHaveClass('text-destructive');
    });
  });

  it('applies correct styling to email input', () => {
    render(<OtpSignInForm />);

    const inputs = screen.getAllByTestId('input');
    const emailInput = inputs[0];

    expect(emailInput).toHaveClass('bg-(--bg)');
    expect(emailInput).toHaveClass('text-primary-token');
    expect(emailInput).toHaveClass('border-subtle');
    expect(emailInput).toHaveClass('focus:ring-accent');
  });

  it('applies correct styling to code input with centered text', () => {
    render(<OtpSignInForm />);

    const inputs = screen.getAllByTestId('input');
    const codeInput = inputs[1];

    expect(codeInput).toHaveClass('text-center');
    expect(codeInput).toHaveClass('tracking-[0.3em]');
  });

  it('renders labels with secondary-token color', () => {
    render(<OtpSignInForm />);

    const labels = screen.getAllByTestId('label');
    labels.forEach(label => {
      expect(label).toHaveClass('text-secondary-token');
    });
  });

  it('signup link uses accent color', () => {
    render(<OtpSignInForm />);

    const signupLinks = screen.getAllByText('Sign up');
    signupLinks.forEach(link => {
      expect(link.closest('a')).toHaveClass('text-accent');
    });
  });
});
