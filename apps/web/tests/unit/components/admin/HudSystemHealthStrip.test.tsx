import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HudSystemHealthStrip } from '@/components/features/admin/hud/HudSystemHealthStrip';
import type { HudMetrics } from '@/types/hud';

function metrics(gbrain?: HudMetrics['gbrain']): HudMetrics {
  return {
    testing: {
      quarantine: { isValid: true, withinRetryBudget: true, activeCount: 0 },
    },
    aiOps: { counts: { running: 0 } },
    deployments: { availability: 'not_configured', current: null },
    ...(gbrain ? { gbrain } : {}),
  } as unknown as HudMetrics;
}

const checkedAtIso = '2026-09-27T18:00:00.000Z';

describe('HudSystemHealthStrip gbrain pill', () => {
  it('uses the page plane for standalone system health', () => {
    render(<HudSystemHealthStrip metrics={metrics()} presentation='page' />);
    expect(
      screen.getByRole('region', { name: 'System Health' }).className
    ).not.toContain('bg-surface');
  });

  it('shows No Signal when gbrain is not configured', () => {
    render(<HudSystemHealthStrip metrics={metrics()} />);
    expect(screen.getByText('No Signal')).toBeInTheDocument();
  });

  it('shows OK with the version when gbrain is healthy', () => {
    render(
      <HudSystemHealthStrip
        metrics={metrics({ status: 'ok', version: '0.46.28.0', checkedAtIso })}
      />
    );
    expect(screen.getByText('OK · v0.46.28.0')).toBeInTheDocument();
  });

  it('shows Down when gbrain does not answer', () => {
    render(
      <HudSystemHealthStrip
        metrics={metrics({ status: 'down', version: null, checkedAtIso })}
      />
    );
    expect(screen.getByText('Down')).toBeInTheDocument();
  });
});
