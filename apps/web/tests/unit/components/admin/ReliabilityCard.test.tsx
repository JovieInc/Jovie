import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReliabilityCard } from '@/features/admin/ReliabilityCard';

describe('ReliabilityCard', () => {
  it('shows Healthy status when there are no incidents and minimal errors', () => {
    render(
      <ReliabilityCard
        summary={{
          errorRatePercent: 0.2,
          p95LatencyMs: 120,
          incidents24h: 0,
          lastIncidentAt: null,
          unresolvedSentryIssues24h: 0,
          redisAvailable: true,
          deploymentAvailability: 'available',
          deploymentState: 'success',
        }}
      />
    );

    expect(screen.getAllByText('Healthy')).toHaveLength(2);
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('shows Needs attention for moderate reliability degradation', () => {
    render(
      <ReliabilityCard
        summary={{
          errorRatePercent: 1.2,
          p95LatencyMs: 180,
          incidents24h: 1,
          lastIncidentAt: null,
          unresolvedSentryIssues24h: 2,
          redisAvailable: true,
          deploymentAvailability: 'available',
          deploymentState: 'in_progress',
        }}
      />
    );

    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('shows Critical for severe reliability degradation', () => {
    render(
      <ReliabilityCard
        summary={{
          errorRatePercent: 5,
          p95LatencyMs: 240,
          incidents24h: 5,
          lastIncidentAt: null,
          unresolvedSentryIssues24h: 4,
          redisAvailable: false,
          deploymentAvailability: 'error',
          deploymentState: null,
        }}
      />
    );

    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
  });
});
