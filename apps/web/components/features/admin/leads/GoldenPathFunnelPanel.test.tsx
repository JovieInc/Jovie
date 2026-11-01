import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildGoldenPathReport } from '@/lib/acquisition/artist-offer-funnel';
import { GoldenPathFunnelPanel } from './GoldenPathFunnelPanel';

describe('GoldenPathFunnelPanel', () => {
  it('says a small cohort is not a result', () => {
    render(
      <GoldenPathFunnelPanel
        report={buildGoldenPathReport({ totalVisits: 5, timelines: [] })}
      />
    );
    expect(screen.getAllByText(/needed to read a rate/).length).toBe(2);
    expect(
      screen.getByText(/Not measured yet: identity-resolved/)
    ).toBeTruthy();
  });

  it('shows an honest failure state when the report is unavailable', () => {
    render(<GoldenPathFunnelPanel report={null} />);
    expect(screen.getByText(/could not be read/)).toBeTruthy();
  });

  it('raises an alert for a stage with upstream traffic and no events', () => {
    const report = {
      ...buildGoldenPathReport({ totalVisits: 5, timelines: [] }),
      stalledStages: ['sign-in' as const],
    };
    render(<GoldenPathFunnelPanel report={report} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Signed in');
  });

  it('says a rate has no base instead of printing n/a', () => {
    render(
      <GoldenPathFunnelPanel
        report={buildGoldenPathReport({ totalVisits: 0, timelines: [] })}
      />
    );
    expect(screen.getAllByText('No base').length).toBeGreaterThan(0);
    expect(screen.queryByText('n/a')).toBeNull();
  });
});
