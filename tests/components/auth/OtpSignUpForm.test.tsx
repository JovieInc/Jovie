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

  it('renders email input with correct label', () => {
    render(<OtpSignUpForm />);

    const labels = screen.getAllByTestId('label');
    expect(labels[0]).toHaveTextContent('Email address');
  });

  it('renders verification code input with correct label', () => {
    render(<OtpSignUpForm />);

    const labels = screen.getAllByTestId('label');
    expect(labels[1]).toHaveTextContent('Enter the code we emailed you');
  });

  it('displays "Send code" button in start step', () => {
    render(<OtpSignUpForm />);

    const buttons = screen.getAllByTestId('signup-action');
    expect(buttons[0]).toHaveTextContent('Send code');
  });

  it('displays "Continue" button in verifications step', () => {
    render(<OtpSignUpForm />);

    const buttons = screen.getAllByTestId('signup-action');
    expect(buttons[1]).toHaveTextContent('Continue');
  });

  it('renders navigation link to signin', () => {
    render(<OtpSignUpForm />);

    const signinLinks = screen.getAllByText('Sign in');
    expect(signinLinks).toHaveLength(2); // One in each step
    signinLinks.forEach(link => {
      expect(link.closest('a')).toHaveAttribute('href', '/signin');
    });
  });

  it('uses semantic design tokens instead of hardcoded colors', () => {
    render(<OtpSignUpForm />);

    const globalError = screen.getByTestId('global-error');
    expect(globalError).toHaveClass('text-destructive');

    const fieldErrors = screen.getAllByTestId('field-error');
    fieldErrors.forEach(error => {
      expect(error).toHaveClass('text-destructive');
    });
  });

  it('applies correct styling to email input', () => {
    render(<OtpSignUpForm />);

    const inputs = screen.getAllByTestId('input');
    const emailInput = inputs[0];

    expect(emailInput).toHaveClass('bg-(--bg)');
    expect(emailInput).toHaveClass('text-primary-token');
    expect(emailInput).toHaveClass('border-subtle');
    expect(emailInput).toHaveClass('focus:ring-accent');
  });

  it('applies correct styling to code input with centered text', () => {
    render(<OtpSignUpForm />);

    const inputs = screen.getAllByTestId('input');
    const codeInput = inputs[1];

    expect(codeInput).toHaveClass('text-center');
    expect(codeInput).toHaveClass('tracking-[0.3em]');
  });

  it('renders labels with secondary-token color', () => {
    render(<OtpSignUpForm />);

    const labels = screen.getAllByTestId('label');
    labels.forEach(label => {
      expect(label).toHaveClass('text-secondary-token');
    });
  });

  it('signin link uses accent color', () => {
    render(<OtpSignUpForm />);

    const signinLinks = screen.getAllByText('Sign in');
    signinLinks.forEach(link => {
      expect(link.closest('a')).toHaveClass('text-accent');
    });
  });

  it('uses purple buttons for signup actions', () => {
    render(<OtpSignUpForm />);

    const buttons = screen.getAllByTestId('signup-action');
    buttons.forEach(button => {
      expect(button).toHaveClass('bg-purple-600');
      expect(button).toHaveClass('hover:bg-purple-500');
    });
  });
});
