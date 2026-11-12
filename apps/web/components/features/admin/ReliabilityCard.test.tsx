import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AdminReliabilitySummary } from '@/lib/admin/reliability';
import { ReliabilityCard } from './ReliabilityCard';

const healthySummary: AdminReliabilitySummary = {
  errorRatePercent: 0.4,
  reliabilityScorePercent: 99.6,
  p95LatencyMs: 320,
  incidents24h: 0,
  lastIncidentAt: null,
  unresolvedSentryIssues24h: 0,
  redisAvailable: true,
  deploymentAvailability: 'available',
  deploymentState: 'success',
};

describe('ReliabilityCard', () => {
  it('renders healthy status copy with the AA-safe success text token', () => {
    render(<ReliabilityCard summary={healthySummary} />);

    const label = screen.getByText('Healthy');
    // Raw mint (#3ffa8b) as text fails 4.5:1 on light surfaces; status copy
    // uses the derived AA-safe -text token.
    expect(label).toHaveClass('text-success-text');
    expect(label).not.toHaveClass('text-success');
  });

  it('renders critical status copy with the AA-safe error text token', () => {
    render(
      <ReliabilityCard
        summary={{ ...healthySummary, incidents24h: 5, redisAvailable: false }}
      />
    );

    const label = screen.getByText('Critical');
    expect(label).toHaveClass('text-error-text');
    expect(label).not.toHaveClass('text-error');
  });
});
