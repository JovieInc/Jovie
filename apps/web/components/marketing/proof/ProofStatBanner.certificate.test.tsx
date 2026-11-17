import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PROOF_STAT_COPY } from '@/data/proofStatCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HIDDEN_FIXTURE, resolvedFixture } from './fixtures/proof-fixtures';
import { ProofStatBanner } from './ProofStatBanner';

describe('ProofStatBanner certificate', () => {
  it('renders a publishable sentence with its methodology link', async () => {
    const { container } = render(
      <ProofStatBanner stat={resolvedFixture()} showMethodology />
    );

    const banner = screen.getByTestId('proof-stat-banner');
    expect(banner).toHaveAttribute('data-proof-state', 'publishable');
    expect(banner).toHaveAttribute('data-proof-stat', 'accounts_total');
    expect(
      screen.getByText('Trusted by 100k+ artists and teams')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: PROOF_STAT_COPY.methodologyLink })
    ).toHaveAttribute('href', '/proof/methodology#accounts_total');
    await expectNoA11yViolations(container);
  });

  it('omits the link without a methodology or when not asked', async () => {
    const { container, rerender } = render(
      <ProofStatBanner
        stat={resolvedFixture({ methodology: null })}
        showMethodology
      />
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);

    rerender(<ProofStatBanner stat={resolvedFixture()} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the fallback line for a stale stat only when asked', async () => {
    const { container, rerender } = render(
      <ProofStatBanner stat={HIDDEN_FIXTURE} whenUnavailable='fallback' />
    );

    expect(screen.getByTestId('proof-stat-banner')).toHaveAttribute(
      'data-proof-state',
      'stale'
    );
    expect(
      screen.getByText('Built for artists and the teams behind them')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    rerender(<ProofStatBanner stat={HIDDEN_FIXTURE} />);
    expect(container).toBeEmptyDOMElement();

    rerender(
      <ProofStatBanner
        stat={{ ...HIDDEN_FIXTURE, fallback: null }}
        whenUnavailable='fallback'
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing without a stat', () => {
    const { container } = render(
      <ProofStatBanner stat={null} whenUnavailable='fallback' />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an Arabic sentence right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProofStatBanner
          stat={resolvedFixture({ sentence: 'يثق بنا أكثر من 100 ألف فنان' })}
        />
      </div>
    );

    expect(screen.getByText('يثق بنا أكثر من 100 ألف فنان')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
