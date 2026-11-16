import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { computePmfMetrics } from '@/lib/admin/pmf-metrics-model';
import { PmfMetricsPanel } from './PmfMetricsPanel';

describe('PmfMetricsPanel', () => {
  it('shows activation and the very-disappointed share against the target', () => {
    render(
      <PmfMetricsPanel
        metrics={computePmfMetrics({
          admittedUsers: 40,
          activatedUsers: 10,
          surveyResponses: 8,
          veryDisappointed: 3,
        })}
      />
    );
    expect(screen.getByText('25.0%')).toBeInTheDocument();
    expect(
      screen.getByText('10 of 40 admitted users finished onboarding')
    ).toBeInTheDocument();
    expect(screen.getByText('37.5%')).toBeInTheDocument();
    expect(
      screen.getByText('3 of 8 answers. Target 40.0%, not met yet.')
    ).toBeInTheDocument();
  });

  it('says when the target is met', () => {
    render(
      <PmfMetricsPanel
        metrics={computePmfMetrics({
          admittedUsers: 10,
          activatedUsers: 5,
          surveyResponses: 5,
          veryDisappointed: 2,
        })}
      />
    );
    expect(
      screen.getByText('2 of 5 answers. Target 40.0%, met.')
    ).toBeInTheDocument();
  });

  it('shows no rate before the first answer', () => {
    render(
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
      screen.getByText('No answers yet. Target 40.0%.')
    ).toBeInTheDocument();
  });

  it('shows an honest error when the metric cannot be read', () => {
    render(<PmfMetricsPanel metrics={null} />);
    expect(
      screen.getByText(
        'The PMF metric could not be read. Check the PMF metrics query.'
      )
    ).toBeInTheDocument();
  });
});
