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
});
