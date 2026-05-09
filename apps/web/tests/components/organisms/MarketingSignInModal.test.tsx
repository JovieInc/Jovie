import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignIn: () => <div data-testid='clerk-signin-stub' />,
  SignUp: () => <div data-testid='clerk-signup-stub' />,
}));

vi.mock('@clerk/ui', () => ({ ui: {} }));

vi.mock('@/components/providers/clerkAvailability', () => ({
  getClerkProxyUrl: () => 'https://example.test/__clerk',
}));

import { AuthModal } from '@/components/organisms/AuthModal';

describe('AuthModal (via MarketingSignInModal compat shim)', () => {
  it('renders the reserved-size skeleton while Clerk is loading', () => {
    render(<AuthModal onClose={() => undefined} />);
    expect(screen.getByTestId('auth-modal-skeleton')).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<AuthModal onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop close button is clicked', () => {
    const onClose = vi.fn();
    render(<AuthModal onClose={onClose} />);
    // The backdrop button and close X button both have aria-label='Close'
    const closeButtons = screen.getAllByLabelText('Close');
    fireEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes a dialog role with accessible name for sign-in mode', () => {
    render(<AuthModal onClose={() => undefined} defaultMode='signin' />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Sign in to Jovie');
  });

  it('exposes a dialog role with accessible name for sign-up mode', () => {
    render(<AuthModal onClose={() => undefined} defaultMode='signup' />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      'Create your Jovie account'
    );
  });
});
