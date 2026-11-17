import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { computePmfMetrics } from '@/lib/admin/pmf-metrics-model';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PmfMetricsPanel } from './PmfMetricsPanel';

describe('PmfMetricsPanel certificate', () => {
  it('renders both metric rows under the heading, axe-clean', async () => {
    const { container } = render(
      <PmfMetricsPanel
        metrics={computePmfMetrics({
          admittedUsers: 48,
          activatedUsers: 30,
          surveyResponses: 20,
          veryDisappointed: 9,
        })}
      />
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Product Market Fit' })
    ).toBeInTheDocument();
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Activation Rate');
    expect(rows[0]).toHaveTextContent('62.5%');
    expect(rows[1]).toHaveTextContent('Very Disappointed');
    expect(rows[1]).toHaveTextContent('9 of 20 answers. Target 40.0%, met.');
    await expectNoA11yViolations(container);
  });

  it('is axe-clean with no admitted users and no answers', async () => {
    const { container } = render(
      <PmfMetricsPanel
        metrics={computePmfMetrics({
          admittedUsers: 0,
          activatedUsers: 0,
          surveyResponses: 0,
          veryDisappointed: 0,
        })}
      />
    );

    expect(screen.getAllByText('No base')).toHaveLength(2);
    expect(
      screen.getByText('0 of 0 admitted users finished onboarding')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('is axe-clean when the metric is unavailable', async () => {
    const { container } = render(<PmfMetricsPanel metrics={null} />);

    expect(
      screen.getByText(
        'The PMF metric could not be read. Check the PMF metrics query.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
