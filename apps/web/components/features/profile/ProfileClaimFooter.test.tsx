import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileClaimFooter } from './ProfileClaimFooter';

const useIsAuthenticated = vi.fn(() => false);

vi.mock('@/hooks/useIsAuthenticated', () => ({
  useIsAuthenticated: () => useIsAuthenticated(),
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/acquisition/proof-claim-client', () => ({
  emitProofClaimEvent: vi.fn(),
  rememberProofClaimAttribution: vi.fn(),
}));

describe('ProfileClaimFooter', () => {
  beforeEach(() => {
    useIsAuthenticated.mockReturnValue(false);
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
    expect(cta).toHaveAccessibleName('Request access');
    expect(screen.getByText('Request access')).toBeInTheDocument();
    expect(screen.queryByText(/unclaimed/i)).toBeNull();
  });
});
