import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { AudienceMember } from '@/types';
import { AudienceTableStableProvider } from '../AudienceTableContext';
import { AudienceActionCell } from './AudienceActionCell';

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

function renderCell(target: AudienceMember, dir?: 'rtl') {
  const onSendNotification = vi.fn();
  const view = render(
    <TooltipProvider>
      <AudienceTableStableProvider
        value={{
          toggleSelect: vi.fn(),
          setOpenMenuRowId: vi.fn(),
          getContextMenuItems: () => [],
          onExportMember: vi.fn(),
          onBlockMember: vi.fn(),
          onViewProfile: vi.fn(),
          onSendNotification,
          getTouringCity: () => null,
          hiddenMetadataColumns: {
            location: false,
            source: false,
            engagement: false,
            lastSeen: false,
          },
        }}
      >
        <div dir={dir}>
          <AudienceActionCell member={target} />
        </div>
      </AudienceTableStableProvider>
    </TooltipProvider>
  );
  return { ...view, onSendNotification };
}

describe('AudienceActionCell certificate', () => {
  it('sends a notification to the clicked member', async () => {
    const user = userEvent.setup();
    const { container, onSendNotification } = renderCell(member);

    await user.click(screen.getByRole('button', { name: 'Message Sasha Fan' }));

    expect(onSendNotification).toHaveBeenCalledTimes(1);
    expect(onSendNotification).toHaveBeenCalledWith(member);
    await expectNoA11yViolations(container);
  });

  it('renders only a screen-reader note for an anonymous visitor', async () => {
    const { container } = renderCell({
      ...member,
      displayName: null,
      email: null,
    });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.getByText('No message action for anonymous visitors')
    ).toHaveClass('sr-only');
    await expectNoA11yViolations(container);
  });

  it('labels the action with a long name and in an RTL document', async () => {
    const longName =
      'Alexandria Montgomery-Fitzgerald of the Extremely Long Fan Club Name';
    const long = renderCell({ ...member, displayName: longName });
    expect(
      screen.getByRole('button', { name: `Message ${longName}` })
    ).toBeInTheDocument();
    await expectNoA11yViolations(long.container);
    long.unmount();

    const rtl = renderCell({ ...member, displayName: 'سارة المعجبة' }, 'rtl');
    expect(
      screen.getByRole('button', { name: 'Message سارة المعجبة' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });
});
