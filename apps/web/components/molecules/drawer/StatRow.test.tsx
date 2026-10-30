import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { StatRow } from './StatRow';

const STATS = [
  { label: 'Total clicks', value: '1,204' },
  { label: 'Last click', value: '2h ago' },
  { label: 'Streams', state: 'not-measured' as const },
];

describe('StatRow', () => {
  it('renders the key-stats row as a 3-column grid of StatTiles', async () => {
    const { container } = render(<StatRow stats={STATS} />);
    const row = screen.getByTestId('entity-rail-stat-row');
    expect(row.className).toContain('grid-cols-3');
    const tiles = row.querySelectorAll('[data-slot="stat-tile"]');
    expect(tiles).toHaveLength(3);
    expect(row).toHaveTextContent('Total clicks');
    expect(row).toHaveTextContent('Last click');
    expect(row).toHaveTextContent('Not measured');
    await expectNoA11yViolations(container);
  });

  it('keeps exactly 3 slots when more stats are passed', () => {
    render(<StatRow stats={[...STATS, { label: 'Extra', value: 'no' }]} />);
    expect(
      screen
        .getByTestId('entity-rail-stat-row')
        .querySelectorAll('[data-slot="stat-tile"]')
    ).toHaveLength(3);
    expect(screen.queryByText('Extra')).not.toBeInTheDocument();
  });
});
