import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { AudienceMember } from '@/types';
import { AudienceAlertsCell } from './AudienceAlertsCell';

function member(
  channels: AudienceMember['activeAlertChannels'],
  hasActiveAlerts = true
): AudienceMember {
  return {
    id: 'member-1',
    hasActiveAlerts,
    activeAlertChannels: channels,
  } as unknown as AudienceMember;
}

describe('AudienceAlertsCell certificate', () => {
  it('names every active channel and stays axe-clean', async () => {
    const { container } = render(
      <AudienceAlertsCell member={member(['sms', 'email', 'push'])} />
    );

    expect(
      screen.getByRole('status', { name: 'Alerts on: SMS, Email, Web push' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Web push alerts active' })
    ).toHaveTextContent('W');
    await expectNoA11yViolations(container);
  });

  it('renders the empty state axe-clean', async () => {
    const { container } = render(
      <AudienceAlertsCell member={member([], false)} />
    );
    expect(screen.getByText('No alerts')).toHaveClass('sr-only');
    expect(screen.queryByRole('status')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('treats channels without the active flag as no alerts', () => {
    render(<AudienceAlertsCell member={member(['sms'], false)} />);
    expect(screen.getByText('No alerts')).toBeInTheDocument();
  });

  it('renders right-to-left axe-clean', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AudienceAlertsCell member={member(['email'])} />
      </div>
    );
    expect(
      screen.getByRole('img', { name: 'Email alerts active' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
