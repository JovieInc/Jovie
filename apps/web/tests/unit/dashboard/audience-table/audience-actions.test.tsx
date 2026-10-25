import { describe, expect, it, vi } from 'vitest';
import { buildAudienceActions } from '@/components/features/dashboard/organisms/dashboard-audience-table/audience-actions';
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

const callbacks = {
  onViewDetails: vi.fn(),
  onCopyEmail: vi.fn(),
  onCopyPhone: vi.fn(),
  onSendNotification: vi.fn(),
  onExportVCard: vi.fn(),
  onBlock: vi.fn(),
};

describe('buildAudienceActions', () => {
  it('disables email-only actions when the email is gated from the artist', () => {
    const items = buildAudienceActions(
      {
        ...baseMember,
        email: 'hidden@example.com',
        emailVisibleToArtist: false,
        phone: null,
      },
      callbacks
    );

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'copy-email', disabled: true }),
      ])
    );
    expect(items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'send-notification' }),
      ])
    );
  });

  it('omits send notification for anonymous fans', () => {
    const items = buildAudienceActions(
      {
        ...baseMember,
        displayName: null,
        email: null,
        phone: null,
        spotifyConnected: false,
      },
      callbacks
    );

    expect(items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'send-notification' }),
      ])
    );
  });

  it('hides phone, export and notification when the person has not shared with the artist', () => {
    const items = buildAudienceActions(
      {
        ...baseMember,
        email: 'hidden@example.com',
        emailVisibleToArtist: false,
        phone: '+14155550123',
      },
      callbacks
    );

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'copy-email', disabled: true }),
        expect.objectContaining({ id: 'copy-phone', disabled: true }),
        expect.objectContaining({ id: 'export-contact', disabled: true }),
      ])
    );
    expect(items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'send-notification' }),
      ])
    );
  });
});
