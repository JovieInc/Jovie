import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AudienceTableStableProvider } from '@/components/features/dashboard/organisms/dashboard-audience-table/AudienceTableContext';
import { AudienceActionCell } from '@/components/features/dashboard/organisms/dashboard-audience-table/cells/AudienceActionCell';
import type { AudienceMember } from '@/types';

const baseMember: AudienceMember = {
  id: '1',
  type: 'email',
  displayName: 'Tim',
  locationLabel: '',
  geoCity: null,
  geoCountry: null,
  visits: 1,
  engagementScore: 50,
  intentLevel: 'high',
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

function makeStableContext(
  overrides: Partial<{ onSendNotification: ReturnType<typeof vi.fn> }> = {}
) {
  return {
    toggleSelect: vi.fn(),
    setOpenMenuRowId: vi.fn(),
    getContextMenuItems: () => [],
    onExportMember: vi.fn(),
    onBlockMember: vi.fn(),
    onViewProfile: vi.fn(),
    onSendNotification: overrides.onSendNotification ?? vi.fn(),
    getTouringCity: () => null,
    hiddenMetadataColumns: {
      location: false,
      source: false,
      engagement: false,
      lastSeen: false,
    },
  };
}

// The action is a canonical TableIconButton with a tooltip, as in the app shell.
const withTooltips = { wrapper: TooltipProvider };

describe('AudienceActionCell', () => {
  it('calls onSendNotification when clicked and reachable', () => {
    const onSendNotification = vi.fn();
    const ctx = makeStableContext({ onSendNotification });
    render(
      <AudienceTableStableProvider value={ctx}>
        <AudienceActionCell member={baseMember} />
      </AudienceTableStableProvider>,
      withTooltips
    );
    const button = screen.getByRole('button', { name: 'Message Tim' });
    // A 24px icon action that fits the 32px dense row.
    expect(button.className).toContain('h-6');
    fireEvent.click(button);
    expect(onSendNotification).toHaveBeenCalledWith(baseMember);
  });

  it('stops propagation so the row click handler does not fire', () => {
    const ctx = makeStableContext();
    const rowClick = vi.fn();
    // Use a <form> as the bubbling-event harness — semantic, valid HTML, and
    // it can legally contain the cell's nested <button>.
    render(
      <form onClick={rowClick} onKeyDown={rowClick}>
        <AudienceTableStableProvider value={ctx}>
          <AudienceActionCell member={baseMember} />
        </AudienceTableStableProvider>
      </form>,
      withTooltips
    );
    fireEvent.click(screen.getByRole('button', { name: /message/i }));
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('hides the message button when no contact channel is available', () => {
    const ctx = makeStableContext();
    render(
      <AudienceTableStableProvider value={ctx}>
        <AudienceActionCell
          member={{ ...baseMember, email: null, phone: null }}
        />
      </AudienceTableStableProvider>,
      withTooltips
    );
    expect(screen.queryByRole('button', { name: /message/i })).toBeNull();
  });

  it('hides the message button for anonymous fans', () => {
    const ctx = makeStableContext();
    render(
      <AudienceTableStableProvider value={ctx}>
        <AudienceActionCell
          member={{
            ...baseMember,
            displayName: null,
            email: 'hidden@example.com',
            emailVisibleToArtist: false,
            phone: null,
          }}
        />
      </AudienceTableStableProvider>,
      withTooltips
    );
    expect(screen.queryByRole('button', { name: /message/i })).toBeNull();
  });
});
