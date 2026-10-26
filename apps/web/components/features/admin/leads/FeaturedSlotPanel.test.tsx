import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FeaturedSlotPanel } from './FeaturedSlotPanel';

describe('FeaturedSlotPanel', () => {
  it('shows reason labels with counts and hides rates below the sample floor', () => {
    render(
      <FeaturedSlotPanel
        report={[
          {
            kind: 'release',
            reason: 'came_from_dsp_release',
            impressions: 200,
            taps: 30,
            tapRate: 0.15,
            underpowered: false,
          },
          {
            kind: 'show',
            reason: 'default_show',
            impressions: 12,
            taps: 6,
            tapRate: null,
            underpowered: true,
          },
        ]}
      />
    );
    expect(
      screen.getByText(
        'Shown your music because they came from a streaming service'
      )
    ).toBeTruthy();
    expect(screen.getByText('15.0%')).toBeTruthy();
    expect(screen.getByText('n/a')).toBeTruthy();
  });

  it('is honest when nothing was recorded or the read failed', () => {
    const { rerender } = render(<FeaturedSlotPanel report={[]} />);
    expect(
      screen.getByText('No featured impressions recorded yet.')
    ).toBeTruthy();
    rerender(<FeaturedSlotPanel report={null} />);
    expect(
      screen.getByText('The featured slot counters could not be read.')
    ).toBeTruthy();
  });
});
