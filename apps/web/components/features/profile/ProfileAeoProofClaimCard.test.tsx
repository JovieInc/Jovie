import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileAeoProofClaimCard } from './ProfileAeoProofClaimCard';

vi.mock('@/lib/acquisition/proof-claim-client', () => ({
  emitProofClaimEvent: vi.fn(),
  rememberProofClaimAttribution: vi.fn(),
}));

describe('ProfileAeoProofClaimCard', () => {
  it('renders a taste-safe proof-to-claim CTA without calling the profile unclaimed', () => {
    render(
      <ProfileAeoProofClaimCard
        artistName='Tim White'
        href='/waitlist?campaign=proof-to-claim'
        label='Request access'
        note='Limited · Request access'
      />
    );

    expect(screen.getByRole('heading', { name: 'jov.ie/you' })).toBeVisible();
    expect(screen.getByText('Limited · Request access')).toBeVisible();
    const cta = screen.getByTestId('profile-aeo-claim-cta');
    expect(cta).toHaveAttribute('href', '/waitlist?campaign=proof-to-claim');
    expect(cta).toHaveTextContent('Request access');
    expect(screen.queryByText(/Claim artist profile/i)).toBeNull();
    expect(screen.queryByText(/unclaimed/i)).toBeNull();
  });

  it('keeps the CTA left-aligned so the bottom-right consent card never covers it (JOV-7114)', () => {
    render(
      <ProfileAeoProofClaimCard
        artistName='Tim White'
        href='/start'
        label='Claim yours'
        note='Limited · Reserve your name'
      />
    );

    const row = screen.getByTestId('profile-aeo-claim-cta').parentElement;
    expect(row).toHaveClass('items-start');
    expect(row?.className).not.toMatch(/justify-between/);
  });
});
