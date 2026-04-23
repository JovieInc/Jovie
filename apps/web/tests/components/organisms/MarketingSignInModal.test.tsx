import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignIn: () => <div data-testid='clerk-signin-stub' />,
}));

vi.mock('@clerk/ui', () => ({ ui: {} }));

vi.mock('@/components/providers/clerkAvailability', () => ({
  getClerkProxyUrl: () => 'https://example.test/__clerk',
}));

import { MarketingSignInModal } from '@/components/organisms/MarketingSignInModal';

describe('MarketingSignInModal', () => {
  it('renders the reserved-size skeleton while Clerk is loading', () => {
    render(<MarketingSignInModal onClose={() => undefined} />);
    expect(screen.getByTestId('marketing-signin-skeleton')).toBeInTheDocument();
  });

  it('reserves ≥520px min-height on the card wrapper to prevent layout shift', () => {
    const { container } = render(
      <MarketingSignInModal onClose={() => undefined} />
    );
    const skeleton = screen.getByTestId('marketing-signin-skeleton');
    const card = skeleton.parentElement as HTMLElement;
    expect(card).toHaveStyle({ minHeight: '520px' });
    expect(container).toBeTruthy();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<MarketingSignInModal onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<MarketingSignInModal onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close sign in'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes a dialog role with accessible name', () => {
    render(<MarketingSignInModal onClose={() => undefined} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Sign in to Jovie');
  });
});
