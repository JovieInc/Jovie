import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useIsAuthenticated = vi.fn(() => false);

vi.mock('@/hooks/useIsAuthenticated', () => ({
  useIsAuthenticated: () => useIsAuthenticated(),
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

import { ProfileClaimFooter } from '@/features/profile/ProfileClaimFooter';

describe('ProfileClaimFooter', () => {
  beforeEach(() => {
    useIsAuthenticated.mockReturnValue(false);
  });

  it('renders claim CTA for logged-out visitors', () => {
    render(<ProfileClaimFooter href='/tim/claim?next=auth' enabled />);
    const cta = screen.getByTestId('profile-claim-footer-cta');
    expect(cta).toHaveAttribute('href', '/tim/claim?next=auth');
    expect(screen.getByText(/Claim your profile/i)).toBeInTheDocument();
  });

  it('hides for authenticated viewers', () => {
    useIsAuthenticated.mockReturnValue(true);
    render(<ProfileClaimFooter href='/tim/claim?next=auth' enabled />);
    expect(screen.queryByTestId('profile-claim-footer')).toBeNull();
  });

  it('hides when disabled', () => {
    render(<ProfileClaimFooter href='/tim/claim?next=auth' enabled={false} />);
    expect(screen.queryByTestId('profile-claim-footer')).toBeNull();
  });
});
