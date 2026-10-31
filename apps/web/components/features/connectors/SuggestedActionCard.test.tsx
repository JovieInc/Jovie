import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SuggestedActionCard } from './SuggestedActionCard';

const FULL_ACTION = {
  id: 'suggestion-full',
  title: 'Late Set at Public Records',
  startsAt: '2026-08-22T20:00:00.000Z',
  endsAt: '2026-08-22T22:00:00.000Z',
  venueName: 'Public Records',
  city: 'Brooklyn',
  region: 'NY',
  country: 'US',
  confidence: 0.96,
  rationale: 'The confirmation includes a venue and set time.',
  sourceRef: {
    messageId: 'message-1',
    subject: 'Booking confirmed for August 22',
  },
  status: 'pending',
} as const;

describe('SuggestedActionCard', () => {
  it('renders the observed location, date and email subject', () => {
    render(<SuggestedActionCard {...FULL_ACTION} />);

    expect(screen.getByText('Public Records, Brooklyn, NY, US')).toBeTruthy();
    expect(screen.getByText('Booking confirmed for August 22')).toBeTruthy();
    expect(screen.queryByText('Location not listed')).not.toBeInTheDocument();
    expect(screen.queryByText('Subject not listed')).not.toBeInTheDocument();
  });

  it('uses honest absence labels instead of dead-end copy for missing fields', () => {
    render(
      <SuggestedActionCard
        {...FULL_ACTION}
        id='suggestion-sparse'
        startsAt=''
        venueName={null}
        city={null}
        region={null}
        country={null}
        sourceRef={{ messageId: 'message-2', subject: '   ' }}
      />
    );

    expect(screen.getByText('Location not listed')).toBeInTheDocument();
    expect(screen.getByText('Subject not listed')).toBeInTheDocument();
    expect(screen.getByText('Date not listed')).toBeInTheDocument();
    // The retired dead-end wording must not render (JOV-INV-046).
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
  });
});
