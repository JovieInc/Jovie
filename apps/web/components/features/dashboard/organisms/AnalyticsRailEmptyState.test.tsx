import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnalyticsRailEmptyState } from './AnalyticsRailEmptyState';

describe('AnalyticsRailEmptyState', () => {
  it('names the range and offers one way to get the first visit', () => {
    render(<AnalyticsRailEmptyState range='30d' />);

    const empty = screen.getByTestId('analytics-rail-empty-state');
    expect(empty).toHaveAttribute('data-content-state', 'empty');
    expect(
      screen.getByRole('heading', { name: 'No Profile Visits Yet' })
    ).toBeInTheDocument();
    expect(empty).toHaveTextContent(
      'No one has opened your profile in the last 30 days.'
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('Share Your Profile');
    expect(links[0]).toHaveAttribute('href', '/app/chat?panel=profile');
  });
});
