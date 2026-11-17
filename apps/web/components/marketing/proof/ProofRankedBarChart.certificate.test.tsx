import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HIDDEN_FIXTURE, resolvedFixture } from './fixtures/proof-fixtures';
import { ProofRankedBarChart } from './ProofRankedBarChart';

const STAT = resolvedFixture({
  id: 'profile_lcp_rank',
  methodology: '/proof/methodology#profile_lcp_rank',
});

const ENTRIES = [
  { id: 'jovie', label: 'Jovie', value: 5400, self: true },
  { id: 'platform-b', label: 'Platform B', value: 12400 },
  { id: 'platform-c', label: 'Platform C', value: 8400 },
];

function rowLabels() {
  return within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map(row => row.firstElementChild?.textContent);
}

describe('ProofRankedBarChart certificate', () => {
  it('ranks lower-is-better rows best first and highlights Jovie', async () => {
    const { container } = render(
      <ProofRankedBarChart
        stat={STAT}
        title='Load speed'
        entries={ENTRIES}
        unit='ms'
        better='lower'
      />
    );

    expect(rowLabels()).toEqual(['Jovie', 'Platform C', 'Platform B']);
    expect(container.querySelector('[data-self="true"]')).toHaveTextContent(
      'Jovie5,400'
    );
    expect(screen.getByText(/Lower is better/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('ranks higher-is-better rows with a custom formatter', async () => {
    const { container } = render(
      <ProofRankedBarChart
        stat={{ ...STAT, methodology: null }}
        title='Agent score'
        entries={ENTRIES}
        unit='points'
        better='higher'
        formatValue={value => `${value / 100} pts`}
      />
    );

    expect(rowLabels()).toEqual(['Platform B', 'Platform C', 'Jovie']);
    expect(screen.getByText('124 pts')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders nothing when unapproved, empty or left with one valid row', () => {
    const props = { title: 'Load speed', unit: 'ms', better: 'lower' } as const;
    const { container, rerender } = render(
      <ProofRankedBarChart {...props} stat={HIDDEN_FIXTURE} entries={ENTRIES} />
    );
    expect(container).toBeEmptyDOMElement();

    rerender(<ProofRankedBarChart {...props} stat={STAT} entries={[]} />);
    expect(container).toBeEmptyDOMElement();

    rerender(
      <ProofRankedBarChart
        {...props}
        stat={STAT}
        entries={[ENTRIES[0], { id: 'nan', label: 'N', value: Number.NaN }]}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('drops invalid rows from a partial list', async () => {
    const { container } = render(
      <ProofRankedBarChart
        stat={STAT}
        title='Load speed'
        entries={[...ENTRIES, { id: 'neg', label: 'Negative', value: -1 }]}
        unit='ms'
        better='lower'
      />
    );

    expect(rowLabels()).toHaveLength(3);
    expect(screen.queryByText('Negative')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic labels right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProofRankedBarChart
          stat={STAT}
          title='سرعة التحميل'
          entries={[
            { id: 'jovie', label: 'جوفي', value: 5400, self: true },
            { id: 'b', label: 'منصة ب', value: 12400 },
          ]}
          unit='ms'
          better='lower'
        />
      </div>
    );

    expect(rowLabels()).toEqual(['جوفي', 'منصة ب']);
    await expectNoA11yViolations(container);
  });
});
