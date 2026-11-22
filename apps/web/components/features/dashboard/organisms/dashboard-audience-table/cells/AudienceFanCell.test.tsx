import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { AudienceMember } from '@/types';
import { AudienceFanCell } from './AudienceFanCell';

const member: AudienceMember = {
  id: 'aud-1',
  type: 'email',
  displayName: 'Sasha Fan',
  locationLabel: '',
  geoCity: null,
  geoCountry: null,
  visits: 1,
  engagementScore: 50,
  intentLevel: 'high',
  latestActions: [],
  referrerHistory: [],
  utmParams: {},
  email: 'sasha.fan@example.com',
  emailVisibleToArtist: true,
  phone: null,
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: null,
  lastSeenAt: null,
};

describe('AudienceFanCell certificate', () => {
  it('shows the name and visible email of an identified fan', async () => {
    const { container } = render(<AudienceFanCell member={member} />);

    expect(screen.getByText('Sasha Fan')).toBeInTheDocument();
    expect(screen.getByText('sasha.fan@example.com')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('labels an anonymous visitor without a secondary fact', async () => {
    const { container } = render(
      <AudienceFanCell member={{ ...member, displayName: null, email: null }} />
    );

    expect(screen.getByText('Anonymous visitor')).toBeInTheDocument();
    expect(screen.queryByText('sasha.fan@example.com')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps a long identity and an RTL name readable', async () => {
    const longName =
      'Alexandria Montgomery-Fitzgerald of the Extremely Long Fan Club Name';
    const long = render(
      <AudienceFanCell member={{ ...member, displayName: longName }} />
    );
    expect(screen.getByText(longName)).toBeInTheDocument();
    await expectNoA11yViolations(long.container);
    long.unmount();

    const rtl = render(
      <div dir='rtl'>
        <AudienceFanCell member={{ ...member, displayName: 'سارة المعجبة' }} />
      </div>
    );
    expect(screen.getByText('سارة المعجبة')).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });

  it('falls back to the location descriptor when there is no contact chip', () => {
    render(
      <AudienceFanCell
        member={{ ...member, email: null, geoCity: 'Los Angeles' }}
      />
    );
    expect(screen.getByText('Los Angeles')).toBeInTheDocument();
  });

  it('prefers the contact chip over the descriptor', () => {
    render(<AudienceFanCell member={{ ...member, geoCity: 'Los Angeles' }} />);
    expect(screen.getByText('sasha.fan@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Los Angeles')).not.toBeInTheDocument();
  });

  it('gives an anonymous visitor a descriptor but no contact chip', () => {
    render(
      <AudienceFanCell
        member={{
          ...member,
          displayName: null,
          email: null,
          geoCity: 'Berlin',
          geoCountry: 'DE',
        }}
      />
    );
    expect(screen.getByText('Anonymous visitor')).toBeInTheDocument();
    expect(screen.getByText('Berlin, DE')).toBeInTheDocument();
  });
});
