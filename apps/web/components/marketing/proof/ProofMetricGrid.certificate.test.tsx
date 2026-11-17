import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PROOF_STAT_COPY } from '@/data/proofStatCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HIDDEN_FIXTURE, resolvedFixture } from './fixtures/proof-fixtures';
import { ProofMetricCard, ProofMetricGrid } from './ProofMetricGrid';

describe('ProofMetricGrid certificate', () => {
  it('renders publishable cards with value, date and method link', async () => {
    const { container } = render(
      <ProofMetricGrid
        stats={[
          { stat: resolvedFixture(), label: 'Accounts' },
          {
            stat: resolvedFixture({ id: 'profile_ttfb_ms', value: '70 ms' }),
          },
        ]}
      />
    );

    expect(screen.getAllByTestId('proof-metric-card')).toHaveLength(2);
    expect(screen.getByText('100k+')).toBeInTheDocument();
    expect(screen.getAllByText('Measured Oct 29, 2026')).toHaveLength(2);
    expect(
      screen.getAllByRole('link', { name: PROOF_STAT_COPY.methodologyLink })[0]
    ).toHaveAttribute('href', '/proof/methodology#accounts_total');
    await expectNoA11yViolations(container);
  });

  it('renders nothing for an empty or all-hidden list', () => {
    const { container, rerender } = render(<ProofMetricGrid stats={[]} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<ProofMetricGrid stats={[{ stat: HIDDEN_FIXTURE }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the publishable card in a partial list', async () => {
    const { container } = render(
      <ProofMetricGrid
        stats={[
          { stat: resolvedFixture({ measuredAt: null, methodology: null }) },
          { stat: HIDDEN_FIXTURE },
          { stat: null },
        ]}
      />
    );

    expect(screen.getAllByTestId('proof-metric-card')).toHaveLength(1);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Measured/)).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('drops an unparseable measured date and keeps a long label', async () => {
    const label = 'Accounts created by artists, managers and labels this year';
    const { container } = render(
      <dl>
        <ProofMetricCard
          stat={resolvedFixture({ measuredAt: 'not-a-date' })}
          label={label}
        />
      </dl>
    );

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText(/^Measured/)).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic labels right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProofMetricGrid
          stats={[{ stat: resolvedFixture(), label: 'الحسابات' }]}
        />
      </div>
    );

    expect(screen.getByText('الحسابات')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
