import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { AudienceMember } from '@/types';
import { AudienceMemberDetails } from './AudienceMemberDetails';

const member: AudienceMember = {
  id: 'aud-1',
  type: 'email',
  displayName: 'Avery Stone',
  locationLabel: 'Brooklyn, NY',
  geoCity: 'Brooklyn',
  geoCountry: 'US',
  visits: 8,
  engagementScore: 82,
  intentLevel: 'high',
  latestActions: [
    {
      label: 'profile_view',
      sourceLabel: 'Instagram',
      confidence: 'verified',
      timestamp: '2026-08-31T18:20:00.000Z',
    },
    {
      label: 'link_click',
      sourceLabel: 'Listen Now',
      timestamp: '2026-08-31T17:05:00.000Z',
    },
  ],
  referrerHistory: [],
  utmParams: {},
  email: 'avery@example.com',
  phone: null,
  emailVisibleToArtist: true,
  spotifyConnected: true,
  purchaseCount: 1,
  tipAmountTotalCents: 500,
  tipCount: 1,
  tags: ['superfan'],
  deviceType: 'mobile',
  lastSeenAt: '2026-08-31T18:20:00.000Z',
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AudienceMemberDetails certificate', () => {
  it('shows decoded location, device, UTM and copies the email', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AudienceMemberDetails
        member={{
          ...member,
          locationLabel: 'S%C3%A3o%20Paulo',
          utmParams: { source: 'instagram', campaign: 'tour' },
        }}
      />
    );

    expect(screen.getByText('São Paulo')).toBeInTheDocument();
    expect(screen.getByText('instagram')).toBeInTheDocument();
    expect(screen.getByText('tour')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: /avery@example.com/ }));
    expect(await navigator.clipboard.readText()).toBe('avery@example.com');
    expect(await screen.findByLabelText('Copied')).toBeInTheDocument();
  });

  it('falls back to the raw label for a malformed encoded location', async () => {
    const { container } = render(
      <AudienceMemberDetails member={{ ...member, locationLabel: 'S%E3o' }} />
    );
    expect(screen.getByText('S%E3o')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows Unknown and em dashes for an empty visitor', async () => {
    const { container } = render(
      <AudienceMemberDetails
        member={{
          ...member,
          locationLabel: '',
          deviceType: null,
          email: null,
          phone: null,
        }}
      />
    );
    expect(screen.getAllByText('Unknown')).toHaveLength(2);
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole('button', { name: 'Copy Visits: 8' })
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Copy (Email|Phone)|Unknown|—/ })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long values and an RTL rail accessible', async () => {
    const email =
      'avery.stone.official.superfan.mailing.list@international-music-collective.example.com';
    const long = render(
      <AudienceMemberDetails
        member={{ ...member, email, phone: '+15551234567' }}
      />
    );
    expect(screen.getByText(email)).toBeInTheDocument();
    await expectNoA11yViolations(long.container);
    long.unmount();

    const rtl = render(
      <div dir='rtl'>
        <AudienceMemberDetails
          member={{ ...member, locationLabel: 'القاهرة، مصر' }}
        />
      </div>
    );
    expect(screen.getByText('القاهرة، مصر')).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });
});
