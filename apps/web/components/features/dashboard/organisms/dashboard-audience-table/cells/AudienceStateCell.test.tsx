import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { AudienceMember } from '@/types';
import { AUDIENCE_STATE_TONES } from '../row-contract';
import { AudienceStateCell } from './AudienceStateCell';
import { NowMsProvider } from './NowMsContext';

const member: AudienceMember = {
  id: 'aud-1',
  type: 'email',
  displayName: 'Sasha Fan',
  locationLabel: '',
  geoCity: null,
  geoCountry: null,
  visits: 12,
  engagementScore: 85,
  intentLevel: 'high',
  latestActions: [
    { label: 'Visited profile', timestamp: new Date().toISOString() },
  ],
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
  lastSeenAt: new Date().toISOString(),
};

function renderCell(
  target: AudienceMember,
  mode: 'members' | 'subscribers' = 'members',
  dir?: 'rtl'
) {
  return render(
    <NowMsProvider>
      <div dir={dir}>
        <AudienceStateCell member={target} mode={mode} />
      </div>
    </NowMsProvider>
  );
}

describe('AudienceStateCell certificate', () => {
  it('labels every mode with a screen-reader prefix', async () => {
    const { container } = renderCell(member, 'subscribers');
    expect(screen.getByText('Subscriber')).toBeInTheDocument();
    expect(screen.getByText('State:')).toHaveClass('sr-only');
    await expectNoA11yViolations(container);
  });

  it('marks a fan unseen for 90 days as dormant', async () => {
    const { container } = renderCell({
      ...member,
      latestActions: [],
      lastSeenAt: new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString(),
    });
    expect(await screen.findByText('Dormant')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders one known label for a fan with no activity', async () => {
    const { container } = renderCell({
      ...member,
      visits: 0,
      engagementScore: 0,
      intentLevel: 'low',
      latestActions: [],
      lastSeenAt: null,
    });
    const badge = container.querySelector('span.inline-flex');
    expect(badge?.textContent).toMatch(
      /^State: (High|Rising|Dormant|Subscriber)$/
    );
    await expectNoA11yViolations(container);
  });

  it('renders the rising placeholder before the client clock mounts', () => {
    render(<AudienceStateCell member={member} mode='members' />);
    expect(screen.getByText('Rising')).toBeInTheDocument();
  });

  it('renders inside an RTL document', async () => {
    const { container } = renderCell(member, 'subscribers', 'rtl');
    expect(screen.getByText('Subscriber')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('maps states to ion, ultra and neutral dots, never mint or orange', () => {
    expect(AUDIENCE_STATE_TONES.high).toBe('info');
    expect(AUDIENCE_STATE_TONES.rising).toBe('ultra');
    expect(AUDIENCE_STATE_TONES.dormant).toBe('neutral');
    expect(Object.values(AUDIENCE_STATE_TONES)).not.toContain('positive');
    expect(Object.values(AUDIENCE_STATE_TONES)).not.toContain('attention');
  });
});
