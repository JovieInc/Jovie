import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbInsert = vi.hoisted(() => vi.fn());
const mockDbExecute = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockDbInsert,
    execute: mockDbExecute,
  },
}));

import {
  getAgentTaskMetrics,
  recordWorkflowStepResult,
} from './agent-task-metrics';

describe('recordWorkflowStepResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a step result row with normalized values', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    mockDbInsert.mockReturnValue({ values });

    await recordWorkflowStepResult({
      runId: 'run-1',
      step: 'execute_approved_action',
      agent: 'execute_approved_action',
      status: 'success',
      costUsd: 0.001234,
      latencyMs: 812,
      linkedOpportunityId: 'opp-1',
    });

    expect(values).toHaveBeenCalledWith({
      runId: 'run-1',
      step: 'execute_approved_action',
      agent: 'execute_approved_action',
      status: 'success',
      tokensIn: null,
      tokensOut: null,
      costUsd: '0.001234',
      latencyMs: 812,
      linkedOpportunityId: 'opp-1',
    });
  });

  it('is fail-soft: a throwing insert never propagates', async () => {
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('relation does not exist')),
    });

    await expect(
      recordWorkflowStepResult({
        runId: 'run-1',
        step: 'step',
        agent: 'agent',
        status: 'failed',
      })
    ).resolves.toBeUndefined();
  });
});

describe('getAgentTaskMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps aggregate rows into per-agent metrics', async () => {
    mockDbExecute.mockResolvedValue({
      rows: [
        {
          agent: 'execute_approved_action',
          total_tasks: 10,
          success_count: 8,
          override_count: 1,
          retried_count: 1,
          total_cost_usd: '0.500000',
          opportunity_count: 5,
          median_ttr_ms: 900,
        },
      ],
    });

    const [row] = await getAgentTaskMetrics({
      since: new Date('2026-06-01T00:00:00Z'),
      until: new Date('2026-07-01T00:00:00Z'),
    });

    expect(row).toEqual({
      agent: 'execute_approved_action',
      totalTasks: 10,
      successRate: 0.8,
      humanOverrideRate: 0.1,
      retriedRate: 0.1,
      totalCostUsd: 0.5,
      costPerOpportunityUsd: 0.1,
      medianTimeToResolutionMs: 900,
    });
  });

  it('returns null cost-per-opportunity when no opportunities are linked', async () => {
    mockDbExecute.mockResolvedValue({
      rows: [
        {
          agent: 'a',
          total_tasks: 2,
          success_count: 2,
          override_count: 0,
          retried_count: 0,
          total_cost_usd: null,
          opportunity_count: 0,
          median_ttr_ms: null,
        },
      ],
    });

    const [row] = await getAgentTaskMetrics({
      since: new Date('2026-06-01T00:00:00Z'),
      until: new Date('2026-07-01T00:00:00Z'),
    });

    expect(row.costPerOpportunityUsd).toBeNull();
    expect(row.medianTimeToResolutionMs).toBeNull();
    expect(row.totalCostUsd).toBe(0);
  });
});
