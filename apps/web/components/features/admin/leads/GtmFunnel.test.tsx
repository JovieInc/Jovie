import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getClampedPercent } from './percentages';

describe('getClampedPercent', () => {
  it('returns the rounded percentage for normal funnel ratios', () => {
    expect(getClampedPercent(50, 100)).toBe(50);
    expect(getClampedPercent(100, 100)).toBe(100);
  });

  it('returns zero when the numerator is empty or the denominator is invalid', () => {
    expect(getClampedPercent(0, 100)).toBe(0);
    expect(getClampedPercent(50, -100)).toBe(0);
    expect(getClampedPercent(1, 0)).toBe(0);
  });

  it('keeps impossible funnel rates inside the visible percentage range', () => {
    expect(getClampedPercent(125, 100)).toBe(100);
    expect(getClampedPercent(-5, 100)).toBe(0);
  });
});

describe('JOV-5466 token retire', () => {
  it('does not keep retired --linear-app-* tokens', () => {
    const source = readFileSync(resolve(__dirname, './GtmFunnel.tsx'), 'utf8');
    expect(source).not.toMatch(/--linear-app-/);
  });
});

vi.mock('@/lib/leads/reporting', () => ({
  getLeadFunnelReport: vi.fn(async () => ({
    summary: { contacted: 0, claimClicks: 0, signups: 0, paidConversions: 0 },
  })),
}));

describe('GtmFunnel drop-off rates', () => {
  it('computes disqualified and rejected percentages against total leads', async () => {
    const { render, screen } = await import('@testing-library/react');
    const { GtmFunnel } = await import('./GtmFunnel');

    render(
      await GtmFunnel({
        counts: {
          discovered: 145,
          qualified: 38,
          disqualified: 361,
          approved: 0,
          ingested: 6,
          rejected: 1,
        },
      })
    );

    expect(screen.getByText(/361 Disqualified \(66%\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 Rejected \(0%\)/)).toBeInTheDocument();
  });
});
