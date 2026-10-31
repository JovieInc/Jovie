import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OvieInFlightBlockers } from './OvieInFlightBlockers';

const prs = Array.from({ length: 7 }, (_, i) => ({
  id: `linear:JOV-${i}`,
  label: `#${100 + i} Task ${i}`,
  url: `https://github.com/JovieInc/Jovie/pull/${100 + i}`,
}));

describe('OvieInFlightBlockers', () => {
  it('lists reasons with counts and reveals the PRs behind one', () => {
    render(
      <OvieInFlightBlockers
        moreHref='/app/ov/shipping'
        summary={{
          total: 9,
          stuck: 7,
          moving: 2,
          groups: [{ reason: 'Source Validation', count: 7, prs }],
          movingPrs: [prs[0]!],
        }}
      />
    );
    expect(screen.getByTestId('ovie-in-flight-blockers')).toHaveTextContent(
      '7 stuck, 2 moving.'
    );
    const group = screen.getByTestId('ovie-blocker-group');
    expect(group).toHaveTextContent('Source Validation');
    expect(group).toHaveTextContent('7 PRs');
    // The biggest reason starts open.
    expect(group).toHaveAttribute('open');
    expect(
      within(group).getByRole('link', { name: '#100 Task 0' })
    ).toHaveAttribute('href', 'https://github.com/JovieInc/Jovie/pull/100');
    expect(
      within(group).getByRole('link', { name: '+4 more on Shipping' })
    ).toHaveAttribute('href', '/app/ov/shipping');
  });

  it('lists moving work last so the rows add up to the total', () => {
    render(
      <OvieInFlightBlockers
        moreHref='/app/ov/shipping'
        summary={{
          total: 3,
          stuck: 0,
          moving: 3,
          groups: [],
          movingPrs: prs.slice(0, 3),
        }}
      />
    );
    expect(screen.getByTestId('ovie-moving-group')).toHaveTextContent(
      'Moving Normally3 PRs'
    );
  });

  it('says nothing is stuck instead of an empty list', () => {
    render(
      <OvieInFlightBlockers
        moreHref='/app/ov/shipping'
        summary={{
          total: 3,
          stuck: 0,
          moving: 3,
          groups: [],
          movingPrs: prs.slice(0, 3),
        }}
      />
    );
    expect(screen.getByText('Nothing is stuck.')).toBeInTheDocument();
  });
});
