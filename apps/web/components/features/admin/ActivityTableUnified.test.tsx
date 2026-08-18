import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ActivityTableSkeleton,
  ActivityTableUnified,
} from './ActivityTableUnified';

describe('ActivityTableUnified', () => {
  it('uses the canonical table empty state when no activity exists', () => {
    render(<ActivityTableUnified items={[]} />);

    expect(screen.getByTestId('admin-activity-empty-state')).toHaveTextContent(
      'No Recent Activity'
    );
    expect(
      screen.getByText('Activity from the last 7 days will appear here.')
    ).toBeInTheDocument();
  });

  it('renders activity data with its operational status', () => {
    render(
      <ActivityTableUnified
        items={[
          {
            id: 'activity-1',
            user: '@operator',
            action: 'Approved a playlist',
            timestamp: '2 minutes ago',
            status: 'success',
          },
        ]}
      />
    );

    expect(screen.getByText('@operator')).toBeInTheDocument();
    expect(screen.getByText('Approved a playlist')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('keeps loading semantics on the canonical table skeleton', () => {
    const { container } = render(<ActivityTableSkeleton rows={3} />);

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.getByText('Loading table data')).toBeInTheDocument();
    expect(
      container.querySelectorAll('tbody tr').length
    ).toBeGreaterThanOrEqual(3);
  });
});
