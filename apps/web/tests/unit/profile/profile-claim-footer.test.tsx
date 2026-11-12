import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  afterEach(() => window.history.replaceState(null, '', '/'));

  it('preserves campaign attribution on the footer claim CTA', () => {
    window.history.replaceState(
      null,
      '',
      '/artist?utm_campaign=claim-link-outreach&utm_source=claim_link&utm_medium=dm&token=synthetic'
    );
    render(<ProfileClaimFooter href='/artist/claim?next=auth' />);
    expect(screen.getByTestId('profile-claim-footer-cta')).toHaveAttribute(
      'href',
      '/artist/claim?next=auth&utm_source=claim_link&utm_medium=dm&utm_campaign=claim-link-outreach'
    );
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

  it('renders the proof-to-claim Request access CTA without calling the profile unclaimed', () => {
    render(
      <ProfileClaimFooter
        href='/waitlist?campaign=proof-to-claim'
        label='Request access'
        proofClaim
      />
    );
    const cta = screen.getByTestId('profile-claim-footer-cta');
    expect(cta).toHaveAttribute('href', '/waitlist?campaign=proof-to-claim');
    expect(cta).toHaveAccessibleName('Jovie · Request access');
    expect(screen.getByText('Request access')).toBeInTheDocument();
    expect(screen.queryByText(/Claim Your Profile/i)).toBeNull();
    expect(screen.queryByText(/unclaimed/i)).toBeNull();
  });
});
