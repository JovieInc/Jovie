import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardAudienceDemo } from './DashboardAudienceDemo';

class MockIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}

describe('DashboardAudienceDemo', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the subscriber summary and audience table contract', () => {
    render(<DashboardAudienceDemo />);

    expect(screen.getByText('Total Subscribers')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('SMS')).toBeInTheDocument();
    expect(screen.getByText('Growth')).toBeInTheDocument();

    const table = screen.getByRole('table');
    for (const column of [
      'Visitor',
      'Intent',
      'Returning',
      'Source',
      'Last Action',
    ]) {
      expect(
        within(table).getByRole('columnheader', { name: column })
      ).toBeInTheDocument();
    }

    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
    expect(
      within(table).getAllByText(/High|Medium|Low/).length
    ).toBeGreaterThan(0);
  });
});
