import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProofRankedBarChart } from './ProofRankedBarChart';
import { HIDDEN_FIXTURE, resolvedFixture } from './proof-fixtures';

describe('ProofRankedBarChart', () => {
  const entries = [
    { id: 'b', label: 'Platform B', value: 12_400 },
    { id: 'jovie', label: 'Jovie', value: 5400, self: true },
    { id: 'c', label: 'Platform C', value: 8400 },
  ];

  it('ranks best first and highlights Jovie', () => {
    render(
      <ProofRankedBarChart
        stat={resolvedFixture({ id: 'profile_lcp_rank' })}
        title='LCP'
        entries={entries}
        unit='ms'
        better='lower'
      />
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows.map(row => row.textContent)).toEqual([
      'Jovie5,400',
      'Platform C8,400',
      'Platform B12,400',
    ]);
    expect(rows[0]).toHaveAttribute('data-self', 'true');
    expect(screen.getByText(/Lower is better/)).toBeInTheDocument();
  });

  it('keeps the honest order when Jovie loses', () => {
    render(
      <ProofRankedBarChart
        stat={resolvedFixture()}
        title='Score'
        entries={[
          { id: 'jovie', label: 'Jovie', value: 60, self: true },
          { id: 'c', label: 'Platform C', value: 80 },
        ]}
        unit='points'
        better='higher'
      />
    );
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Platform C');
  });

  it('renders nothing unless the gating stat is publishable or with fewer than two rows', () => {
    const unapproved = { ...HIDDEN_FIXTURE, state: 'unapproved' as const };
    expect(
      render(
        <ProofRankedBarChart
          stat={unapproved}
          title='x'
          entries={entries}
          unit='ms'
          better='lower'
        />
      ).container
    ).toBeEmptyDOMElement();
    expect(
      render(
        <ProofRankedBarChart
          stat={resolvedFixture()}
          title='x'
          entries={[
            entries[0]!,
            { id: 'bad', label: 'Bad', value: Number.NaN },
          ]}
          unit='ms'
          better='lower'
        />
      ).container
    ).toBeEmptyDOMElement();
  });
});
