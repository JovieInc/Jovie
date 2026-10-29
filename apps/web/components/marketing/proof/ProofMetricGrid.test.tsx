import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProofMetricCard, ProofMetricGrid } from './ProofMetricGrid';
import { HIDDEN_FIXTURE, resolvedFixture } from './proof-fixtures';

describe('ProofMetricGrid', () => {
  it('drops unpublishable stats and keeps the rest', () => {
    render(
      <ProofMetricGrid
        stats={[
          { stat: resolvedFixture(), label: 'Accounts' },
          { stat: HIDDEN_FIXTURE, label: 'Stale Stat' },
          { stat: undefined },
        ]}
      />
    );
    const cards = screen.getAllByTestId('proof-metric-card');
    expect(cards).toHaveLength(1);
    expect(within(cards[0]!).getByText('100k+')).toBeInTheDocument();
    expect(
      within(cards[0]!).getByText('Measured Oct 29, 2026')
    ).toBeInTheDocument();
    expect(screen.queryByText('Stale Stat')).not.toBeInTheDocument();
  });

  it('renders nothing when no stat is publishable', () => {
    const { container } = render(
      <ProofMetricGrid stats={[{ stat: HIDDEN_FIXTURE }]} />
    );
    expect(container).toBeEmptyDOMElement();
    expect(
      render(<ProofMetricCard stat={HIDDEN_FIXTURE} />).container
    ).toBeEmptyDOMElement();
  });

  it('omits the date line for a bad timestamp but keeps the method link', () => {
    render(
      <dl>
        <ProofMetricCard stat={resolvedFixture({ measuredAt: 'nope' })} />
      </dl>
    );
    expect(screen.queryByText(/Measured/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Methodology' })
    ).toBeInTheDocument();
  });
});
