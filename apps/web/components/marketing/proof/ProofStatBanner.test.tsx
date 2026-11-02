import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HIDDEN_FIXTURE, resolvedFixture } from './fixtures/proof-fixtures';
import { ProofStatBanner } from './ProofStatBanner';

describe('ProofStatBanner', () => {
  it('renders the registry sentence and methodology link', () => {
    render(<ProofStatBanner stat={resolvedFixture()} showMethodology />);
    expect(
      screen.getByText('Trusted by 100k+ artists and teams')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Methodology' })).toHaveAttribute(
      'href',
      '/proof/methodology#accounts_total'
    );
  });

  it('hides a stale stat by default and never shows its number', () => {
    const { container } = render(<ProofStatBanner stat={HIDDEN_FIXTURE} />);
    expect(container).toBeEmptyDOMElement();
    expect(
      render(<ProofStatBanner stat={null} />).container
    ).toBeEmptyDOMElement();
  });

  it('shows the fallback copy when asked, with no number', () => {
    render(
      <ProofStatBanner stat={HIDDEN_FIXTURE} whenUnavailable='fallback' />
    );
    const banner = screen.getByTestId('proof-stat-banner');
    expect(banner).toHaveTextContent(
      'Built for artists and the teams behind them'
    );
    expect(banner).toHaveAttribute('data-proof-state', 'stale');
    expect(banner.textContent).not.toMatch(/\d/);
  });
});
