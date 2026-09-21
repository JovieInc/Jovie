import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProofClaimCtaLink } from './ProofClaimCtaLink';

const emitProofClaimEvent = vi.fn();
const rememberProofClaimAttribution = vi.fn();

vi.mock('@/lib/acquisition/proof-claim-client', () => ({
  emitProofClaimEvent: (...args: unknown[]) => emitProofClaimEvent(...args),
  rememberProofClaimAttribution: () => rememberProofClaimAttribution(),
}));

describe('ProofClaimCtaLink', () => {
  it('renders the taste-safe proof CTA and emits claim_started on click', () => {
    render(
      <ProofClaimCtaLink
        href='/waitlist?campaign=proof-to-claim'
        label='Request access'
        ariaLabel='Request access — get your Jovie from the Tim White profile'
      />
    );

    const cta = screen.getByTestId('proof-claim-cta');
    expect(cta).toHaveAttribute('href', '/waitlist?campaign=proof-to-claim');
    expect(cta).toHaveAccessibleName(
      'Request access — get your Jovie from the Tim White profile'
    );
    expect(cta).toHaveTextContent('Request access');
    expect(screen.queryByText(/unclaimed/i)).toBeNull();

    fireEvent.click(cta);
    expect(rememberProofClaimAttribution).toHaveBeenCalled();
    expect(emitProofClaimEvent).toHaveBeenCalledWith(
      'claim_started',
      expect.objectContaining({
        destination: '/waitlist?campaign=proof-to-claim',
        label: 'Request access',
      })
    );
  });
});
