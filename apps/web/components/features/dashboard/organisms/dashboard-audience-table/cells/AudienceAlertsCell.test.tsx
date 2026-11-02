import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AudienceMember } from '@/types';
import { AudienceAlertsCell } from './AudienceAlertsCell';

function memberWithAlerts(): AudienceMember {
  return {
    id: 'member-1',
    hasActiveAlerts: true,
    activeAlertChannels: ['sms', 'email'],
  } as unknown as AudienceMember;
}

describe('AudienceAlertsCell', () => {
  it('renders the alert state with success tokens, never a raw color', () => {
    render(<AudienceAlertsCell member={memberWithAlerts()} />);

    for (const chip of screen.getAllByRole('img')) {
      expect(chip.className).not.toMatch(/emerald|amber|orange|cyan/);
    }
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText('E')).toBeInTheDocument();
  });

  it('stays visually silent when alerts are inactive', () => {
    render(
      <AudienceAlertsCell
        member={
          { id: 'm-2', hasActiveAlerts: false } as unknown as AudienceMember
        }
      />
    );

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('No alerts')).toHaveClass('sr-only');
  });
});
