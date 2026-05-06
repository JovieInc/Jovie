import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AudienceTableStableProvider } from '@/components/features/dashboard/organisms/dashboard-audience-table/AudienceTableContext';
import { AudienceActionCell } from '@/components/features/dashboard/organisms/dashboard-audience-table/cells';
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

describe('AudienceActionCell', () => {
  it('calls onSendNotification when clicked and reachable', () => {
    const onSendNotification = vi.fn();
    const ctx = makeStableContext({ onSendNotification });
    render(
      <AudienceTableStableProvider value={ctx}>
        <AudienceActionCell member={baseMember} />
      </AudienceTableStableProvider>
    );
    fireEvent.click(screen.getByRole('button'));
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
      </form>
    );
    fireEvent.click(screen.getByRole('button', { name: /message/i }));
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('disables the button when no contact channel is available', () => {
    const ctx = makeStableContext();
    render(
      <AudienceTableStableProvider value={ctx}>
        <AudienceActionCell
          member={{ ...baseMember, email: null, phone: null }}
        />
      </AudienceTableStableProvider>
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('disables the button when the only contact is a gated email', () => {
    // Greptile-flagged: emailVisibleToArtist=false must not let Message
    // fire with a hidden email present.
    const ctx = makeStableContext();
    render(
      <AudienceTableStableProvider value={ctx}>
        <AudienceActionCell
          member={{
            ...baseMember,
            email: 'hidden@example.com',
            emailVisibleToArtist: false,
            phone: null,
          }}
        />
      </AudienceTableStableProvider>
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
