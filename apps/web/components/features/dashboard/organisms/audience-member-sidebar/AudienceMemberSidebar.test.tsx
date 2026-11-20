import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { AudienceMember } from '@/types';
import { AudienceMemberSidebar } from './AudienceMemberSidebar';

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

function renderSidebar(target: AudienceMember | null, dir?: 'rtl') {
  const onClose = vi.fn();
  const view = render(
    <TooltipProvider>
      <div dir={dir}>
        <AudienceMemberSidebar member={target} isOpen onClose={onClose} />
      </div>
    </TooltipProvider>
  );
  return { ...view, onClose };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AudienceMemberSidebar certificate', () => {
  it('switches between the details, activity and sources tabs', async () => {
    const user = userEvent.setup();
    const { container } = renderSidebar(member);

    expect(screen.getByTestId('audience-details-card')).toBeInTheDocument();
    expect(screen.getByTestId('audience-member-header-card')).toHaveTextContent(
      'Avery Stone'
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(screen.getByTestId('audience-activity-card')).toBeInTheDocument();
    expect(screen.queryByTestId('audience-details-card')).toBeNull();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('tab', { name: 'Sources' }));
    expect(screen.getByTestId('audience-sources-card')).toBeInTheDocument();
  });

  it('shows location and visits once in the details and once in the fallback header', () => {
    renderSidebar({ ...member, email: null, phone: null });
    expect(screen.getByTestId('entity-header-details-row')).toHaveTextContent(
      'Brooklyn, NY · 8 visits'
    );
    expect(screen.getByTestId('audience-details-card')).toHaveTextContent(
      'Brooklyn, NY'
    );
    expect(screen.queryByTestId('entity-header-meta-slot')).toBeNull();
  });

  it('closes from the header action', async () => {
    const user = userEvent.setup();
    const { onClose } = renderSidebar(member);
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('prompts for a selection when no member is chosen', async () => {
    const { container } = renderSidebar(null);
    expect(
      screen.getByText('Select a row in the table to view contact details.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('falls back to the email as the title and renders in RTL', async () => {
    const fallback = renderSidebar({ ...member, displayName: null });
    expect(screen.getByTestId('audience-member-header-card')).toHaveTextContent(
      'avery@example.com'
    );
    await expectNoA11yViolations(fallback.container);
    fallback.unmount();

    const rtl = renderSidebar(
      { ...member, displayName: 'سارة المعجبة' },
      'rtl'
    );
    expect(screen.getByText('سارة المعجبة')).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });
});
