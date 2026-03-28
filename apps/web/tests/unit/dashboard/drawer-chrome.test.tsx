import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AudienceMemberSidebar } from '@/features/dashboard/organisms/audience-member-sidebar/AudienceMemberSidebar';
import { DspPresenceSidebar } from '@/features/dashboard/organisms/dsp-presence/DspPresenceSidebar';
import type { AudienceMember } from '@/types';

vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<object>('@jovie/ui');
  return {
    ...actual,
    Button: ({ children, ...props }: ComponentProps<'button'>) => (
      <button type='button' {...props}>
        {children}
      </button>
    ),
  };
});

const audienceMember: AudienceMember = {
  id: 'aud-1',
  type: 'email',
  displayName: 'Alex Fan',
  locationLabel: 'Nashville, TN',
  geoCity: 'Nashville',
  geoCountry: 'US',
  visits: 12,
  engagementScore: 88,
  intentLevel: 'high',
  latestActions: [],
  referrerHistory: [],
  utmParams: {},
  email: 'alex@example.com',
  phone: null,
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: 'mobile',
  lastSeenAt: '2026-03-20T00:00:00.000Z',
};

describe('dashboard drawer chrome', () => {
  it('audience member drawer uses an entity card with a direct close button', () => {
    render(
      <AudienceMemberSidebar
        member={audienceMember}
        isOpen={true}
        onClose={() => undefined}
        contextMenuItems={[]}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Close details' })
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Audience member details')
    ).not.toBeInTheDocument();
  });

  it('presence drawer drops the decorative DSP profile label and keeps close affordance', () => {
    render(
      <DspPresenceSidebar
        item={{
          matchId: 'match-1',
          providerId: 'spotify',
          status: 'confirmed',
          confidenceScore: 0.94,
          matchingIsrcCount: 3,
          confirmedAt: '2026-03-20T00:00:00.000Z',
          externalArtistName: 'Tim White',
          externalArtistUrl: 'https://open.spotify.com/artist/4u',
          externalArtistImageUrl: null,
          confidenceBreakdown: null,
        }}
        onClose={() => undefined}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Close details' })
    ).toBeInTheDocument();
    expect(screen.queryByText('DSP profile')).not.toBeInTheDocument();
  });
});
