import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmailCodeAuthForm } from './EmailCodeAuthForm';

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: vi.fn() },
    signIn: { emailOtp: vi.fn() },
  },
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ isLoaded: true, isSignedIn: false }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/analytics/signup-funnel-client', () => ({
  trackFunnelStep: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe('Pen sign-in polish (glm/auth-focal-polish)', () => {
  it('renders the email CTA on the approved auth pill geometry with no restyled Button sizes', () => {
    render(<EmailCodeAuthForm mode='sign-in' redirectUrl='/start' />);
    const cta = screen.getByRole('button', { name: 'Send sign-in code' });
    expect(cta).toHaveClass('w-full');
    expect(cta.className).not.toMatch(/\bh-8\b/);
    expect(cta.className).not.toMatch(/\bmin-h-8\b/);
  });

  it('draws Send sign-in code as the 28px Pen oaz9c pill inside its tap layer', () => {
    render(<EmailCodeAuthForm mode='sign-in' redirectUrl='/start' />);
    const cta = screen.getByRole('button', { name: 'Send sign-in code' });
    expect(cta).toHaveClass('h-7');
    expect(cta).toHaveClass('min-h-7');
    expect(cta).not.toHaveClass('my-2');
  });
});
