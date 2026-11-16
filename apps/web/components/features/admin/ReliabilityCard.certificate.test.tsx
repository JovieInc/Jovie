import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AdminReliabilitySummary } from '@/lib/admin/reliability';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReliabilityCard } from './ReliabilityCard';

const summary: AdminReliabilitySummary = {
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

describe('ReliabilityCard certificate', () => {
  it('keeps the healthy card axe-clean', async () => {
    const { container } = render(<ReliabilityCard summary={summary} />);

    expect(screen.getByText('0.40%')).toBeInTheDocument();
    expect(screen.getByText('320ms')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.queryByText(/Last incident on/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('reads Critical with unavailable deploys and Redis', async () => {
    const { container } = render(
      <ReliabilityCard
        summary={{
          ...summary,
          redisAvailable: false,
          deploymentAvailability: 'error',
          deploymentState: null,
          incidents24h: 2,
          lastIncidentAt: new Date('2026-11-13T09:00:00.000Z'),
        }}
      />
    );

    expect(screen.getByText('Critical')).toHaveClass('text-error-text');
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
    expect(screen.getByText(/Last incident on 2026-11-13\./)).toHaveTextContent(
      'Review logs and alerts before shipping new changes.'
    );
    await expectNoA11yViolations(container);
  });

  it('reads Needs Attention for an in-progress deploy and unknown latency', async () => {
    const { container } = render(
      <ReliabilityCard
        summary={{
          ...summary,
          p95LatencyMs: null,
          deploymentState: 'in_progress',
        }}
      />
    );

    expect(screen.getByText('Needs Attention')).toHaveClass(
      'text-warning-text'
    );
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps large counts axe-clean inside an RTL document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ReliabilityCard
          summary={{
            ...summary,
            p95LatencyMs: 123_456,
            unresolvedSentryIssues24h: 98_765,
            deploymentAvailability: 'not_configured',
          }}
        />
      </div>
    );

    expect(screen.getByText('123456ms')).toBeInTheDocument();
    expect(screen.getByText((98_765).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText('Not configured')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
