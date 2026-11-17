import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { AudienceMember } from '@/types';
import { AudienceMemberActivityFeed } from './AudienceMemberActivityFeed';

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

describe('AudienceMemberActivityFeed certificate', () => {
  it('lists actions newest first with source and verified meta', async () => {
    const { container } = render(
      <AudienceMemberActivityFeed
        member={{
          ...member,
          latestActions: [
            { label: 'follow' },
            ...member.latestActions.slice().reverse(),
          ],
        }}
      />
    );

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Instagram');
    expect(rows[0]).toHaveTextContent('Verified');
    expect(rows[1]).toHaveTextContent('Listen Now');
    expect(rows[0].querySelector('time')).toHaveAttribute(
      'datetime',
      '2026-08-31T18:20:00.000Z'
    );
    await expectNoA11yViolations(container);
  });

  it('caps the timeline at ten actions', () => {
    render(
      <AudienceMemberActivityFeed
        member={{
          ...member,
          latestActions: Array.from({ length: 14 }, (_, i) => ({
            label: 'profile_view',
            timestamp: `2026-08-${String(i + 10).padStart(2, '0')}T00:00:00.000Z`,
          })),
        }}
      />
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
  });

  it('explains an empty timeline', async () => {
    const { container } = render(
      <AudienceMemberActivityFeed member={{ ...member, latestActions: [] }} />
    );
    expect(
      screen.getByText(
        'Activity will appear here as this contact interacts with your profile.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps an unknown long label and an RTL timeline accessible', async () => {
    const label =
      'Opened the extended deluxe edition pre-save campaign landing page';
    const long = render(
      <AudienceMemberActivityFeed
        member={{ ...member, latestActions: [{ label }] }}
      />
    );
    expect(screen.getByRole('listitem').textContent?.length).toBeGreaterThan(0);
    await expectNoA11yViolations(long.container);
    long.unmount();

    const rtl = render(
      <div dir='rtl'>
        <AudienceMemberActivityFeed member={member} />
      </div>
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    await expectNoA11yViolations(rtl.container);
  });
});
