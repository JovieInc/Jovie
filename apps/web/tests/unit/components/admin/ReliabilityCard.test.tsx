import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReliabilityCard } from '@/components/admin/ReliabilityCard';

describe('ReliabilityCard', () => {
  it('shows Healthy status when there are no incidents and minimal errors', () => {
    render(
      <ReliabilityCard
        summary={{
          errorRatePercent: 0.2,
          p95LatencyMs: 120,
          incidents24h: 0,
          lastIncidentAt: null,
        }}
      />
    );

    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('shows Needs attention for moderate reliability degradation', () => {
    render(
      <ReliabilityCard
        summary={{
          errorRatePercent: 1.2,
          p95LatencyMs: 180,
          incidents24h: 1,
          lastIncidentAt: null,
        }}
      />
    );

    expect(screen.getByText('Needs attention')).toBeInTheDocument();
  });

  it('shows Critical for severe reliability degradation', () => {
    render(
      <ReliabilityCard
        summary={{
          errorRatePercent: 5,
          p95LatencyMs: 240,
          incidents24h: 5,
          lastIncidentAt: null,
        }}
      />
    );

    expect(screen.getByText('Critical')).toBeInTheDocument();
  });
});
