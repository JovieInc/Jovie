import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AudienceAlertsCell } from '@/components/features/dashboard/organisms/dashboard-audience-table/cells';
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

describe('AudienceAlertsCell', () => {
  it('hides the bell when no active alerts exist', () => {
    render(
      <AudienceAlertsCell
        member={{
          ...baseMember,
          hasActiveAlerts: false,
          activeAlertChannels: [],
        }}
      />
    );
    // The "No alerts" copy is sr-only — there should be no aria-label "Alerts on" wrapper.
    expect(screen.queryByLabelText(/Alerts on:/i)).not.toBeInTheDocument();
    expect(screen.getByText('No alerts')).toBeInTheDocument();
  });

  it('hides the bell when contact values exist but no confirmed alerts', () => {
    // Phone/email presence must NOT imply SMS/email alerts.
    render(
      <AudienceAlertsCell
        member={{
          ...baseMember,
          phone: '+15551234567',
          email: 'tim@example.com',
          hasActiveAlerts: false,
          activeAlertChannels: [],
        }}
      />
    );
    expect(screen.queryByLabelText(/Alerts on:/i)).not.toBeInTheDocument();
  });

  it('renders bell + chips for each active channel', () => {
    render(
      <AudienceAlertsCell
        member={{
          ...baseMember,
          hasActiveAlerts: true,
          activeAlertChannels: ['sms', 'email'],
        }}
      />
    );
    expect(screen.getByLabelText(/Alerts on: SMS, Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/SMS alerts active/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email alerts active/i)).toBeInTheDocument();
  });

  it('renders W chip for web push alerts', () => {
    render(
      <AudienceAlertsCell
        member={{
          ...baseMember,
          hasActiveAlerts: true,
          activeAlertChannels: ['push'],
        }}
      />
    );
    expect(
      screen.getByLabelText(/Web push alerts active/i)
    ).toBeInTheDocument();
  });
});
