import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AudienceMobileCard } from '@/components/organisms/table';
import type { AudienceMember } from '@/types';

const baseMember: AudienceMember = {
  id: '1',
  type: 'email',
  displayName: 'Tim White',
  locationLabel: '',
  geoCity: null,
  geoCountry: null,
  visits: 1,
  engagementScore: 50,
  intentLevel: 'medium',
  latestActions: [],
  referrerHistory: [],
  utmParams: {},
  email: 'tim@example.com',
  phone: null,
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: null,
  lastSeenAt: null,
};

describe('AudienceMobileCard', () => {
  it('uses the same anonymous fallback as the desktop fan cell when the only identity is a gated email', () => {
    render(
      <AudienceMobileCard
        member={{
          ...baseMember,
          displayName: null,
          email: 'hidden@example.com',
          emailVisibleToArtist: false,
        }}
        mode='members'
        onTap={vi.fn()}
      />
    );

    expect(screen.getByText('Anonymous Fan')).toBeInTheDocument();
    expect(screen.queryByText('hidden@example.com')).not.toBeInTheDocument();
  });

  it('disables the message button when the only contact is a gated email', () => {
    render(
      <AudienceMobileCard
        member={{
          ...baseMember,
          displayName: null,
          email: 'hidden@example.com',
          emailVisibleToArtist: false,
          phone: null,
        }}
        mode='members'
        onTap={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: /message anonymous fan/i })
    ).toBeDisabled();
  });

  it('keeps the primary row tap target active when the message button is disabled', () => {
    const onTap = vi.fn();
    const member = {
      ...baseMember,
      email: null,
      phone: null,
    };

    render(<AudienceMobileCard member={member} mode='members' onTap={onTap} />);

    fireEvent.click(screen.getByLabelText(/view details for tim white/i));
    expect(onTap).toHaveBeenCalledWith(member);
  });
});
