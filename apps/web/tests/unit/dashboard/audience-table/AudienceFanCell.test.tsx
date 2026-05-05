import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AudienceFanCell } from '@/components/features/dashboard/organisms/dashboard-audience-table/cells';
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

describe('AudienceFanCell', () => {
  it('renders display name and email when emailVisibleToArtist is true', () => {
    render(
      <AudienceFanCell member={{ ...baseMember, emailVisibleToArtist: true }} />
    );
    expect(screen.getByText('Tim White')).toBeInTheDocument();
    expect(screen.getByText('tim@example.com')).toBeInTheDocument();
  });

  it('hides email when emailVisibleToArtist is false (PII regression guard)', () => {
    render(
      <AudienceFanCell
        member={{
          ...baseMember,
          emailVisibleToArtist: false,
          phone: '+14155559282',
        }}
      />
    );
    expect(screen.getByText('Tim White')).toBeInTheDocument();
    expect(screen.queryByText('tim@example.com')).not.toBeInTheDocument();
  });

  it('renders Anonymous Fan when displayName, email, and phone are all empty', () => {
    render(
      <AudienceFanCell
        member={{
          ...baseMember,
          displayName: null,
          email: null,
          phone: null,
        }}
      />
    );
    expect(screen.getByText('Anonymous Fan')).toBeInTheDocument();
  });

  it('renders monogram for emoji-prefixed names without splitting graphemes', () => {
    render(
      <AudienceFanCell
        member={{ ...baseMember, displayName: '🎵 Tim White' }}
      />
    );
    // First grapheme should be the emoji or "T" — never the broken
    // surrogate-pair fragment that charAt(0) would produce.
    const monogram = screen.getByLabelText(/avatar$/i);
    const text = monogram.textContent ?? '';
    expect(text.length).toBeGreaterThan(0);
    expect(text.charCodeAt(0)).not.toBe(0xd83d); // not a stray high-surrogate
  });

  it('renders monogram for CJK names', () => {
    render(
      <AudienceFanCell member={{ ...baseMember, displayName: '田中太郎' }} />
    );
    const monogram = screen.getByLabelText(/avatar$/i);
    expect(monogram.textContent).toBe('田');
  });
});
