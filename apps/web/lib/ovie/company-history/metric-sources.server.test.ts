import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: { execute: vi.fn() } }));
vi.mock('@/lib/ai/gateway-spend', () => ({ readGatewaySpendReport: vi.fn() }));
vi.mock('@/lib/ovie/mcp/founder-work', () => ({
  createLiveFounderWorkReader: vi.fn(),
}));

const { db } = await import('@/lib/db');

import {
  aiSpendSource,
  ciFailedRunsSource,
  linearSource,
  signupsSource,
} from './metric-sources.server';

const NOW = new Date('2026-11-08T20:40:00Z');

describe('signupsSource', () => {
  it('zero-fills days the grouped query covered', async () => {
    vi.mocked(db.execute).mockResolvedValue({
      rows: [{ day: '2026-11-07', n: '3' }],
    } as never);
    await expect(
      signupsSource.read(['2026-11-08', '2026-11-07', '2026-11-06'], NOW)
    ).resolves.toEqual({
      status: 'ok',
      values: { '2026-11-08': 0, '2026-11-07': 3, '2026-11-06': 0 },
    });
    expect(db.execute).toHaveBeenCalledOnce();
  });
});

describe('aiSpendSource', () => {
  it('buckets hourly UTC rows into Pacific days in cents', async () => {
    const report = vi.fn().mockResolvedValue([
      // 2026-11-08 07:00Z is 11pm Nov 7 Pacific; 08:00Z is midnight Nov 8.
      { hour: '2026-11-08T07:00:00Z', totalCost: 1.234 },
      { hour: '2026-11-08 08:00:00', totalCost: 2.5 },
      { hour: '2026-11-08T19:00:00.000Z', totalCost: 0.01 },
    ]);
    const result = await aiSpendSource(report).read(
      ['2026-11-08', '2026-11-07'],
      NOW
    );
    expect(report).toHaveBeenCalledWith({
      startDate: '2026-11-07',
      endDate: '2026-11-09',
    });
    expect(result).toEqual({
      status: 'ok',
      values: { '2026-11-08': 251, '2026-11-07': 123 },
    });
  });

  it('fails closed on a row with no readable hour', async () => {
    const report = vi.fn().mockResolvedValue([{ totalCost: 1 }]);
    await expect(
      aiSpendSource(report).read(['2026-11-08'], NOW)
    ).resolves.toMatchObject({ status: 'unavailable' });
  });
});

describe('ciFailedRunsSource', () => {
  it('counts per Pacific day and leaves a capped day unknown', async () => {
    const countGithubWorkflowRuns = vi
      .fn()
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(1000);
    const result = await ciFailedRunsSource({ countGithubWorkflowRuns }).read(
      ['2026-11-08', '2026-11-07'],
      NOW
    );
    expect(countGithubWorkflowRuns).toHaveBeenNthCalledWith(1, {
      created: '2026-11-08T08:00:00Z..2026-11-09T07:59:59Z',
      status: 'failure',
    });
    expect(result).toEqual({ status: 'ok', values: { '2026-11-08': 12 } });
  });

  it('keeps what it counted when GitHub fails partway', async () => {
    const countGithubWorkflowRuns = vi
      .fn()
      .mockResolvedValueOnce(5)
      .mockRejectedValueOnce(new Error('GitHub API error (502)'));
    await expect(
      ciFailedRunsSource({ countGithubWorkflowRuns }).read(
        ['2026-11-08', '2026-11-07'],
        NOW
      )
    ).resolves.toEqual({ status: 'ok', values: { '2026-11-08': 5 } });
    countGithubWorkflowRuns.mockRejectedValueOnce(new Error('down'));
    await expect(
      ciFailedRunsSource({ countGithubWorkflowRuns }).read(['2026-11-08'], NOW)
    ).resolves.toEqual({ status: 'unavailable', reason: 'down' });
  });
});

describe('linearSource', () => {
  it('asks one aliased request and drops days Linear could not count', async () => {
    const countLinearIssuesInWindows = vi.fn().mockResolvedValue([7, null]);
    const result = await linearSource('linear_completed', {
      countLinearIssuesInWindows,
    }).read(['2026-11-08', '2026-11-07'], NOW);
    expect(countLinearIssuesInWindows).toHaveBeenCalledWith(
      'completedAt',
      [
        { gte: '2026-11-08T08:00:00.000Z', lt: '2026-11-09T08:00:00.000Z' },
        { gte: '2026-11-07T08:00:00.000Z', lt: '2026-11-08T08:00:00.000Z' },
      ],
      250
    );
    expect(result).toEqual({ status: 'ok', values: { '2026-11-08': 7 } });
  });
});
