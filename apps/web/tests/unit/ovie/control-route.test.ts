import { beforeEach, describe, expect, it } from 'vitest';
import { respondToSummerControl } from '@/app/api/summer/control/route';
import { resetPromotedDumpAckRuntime } from '@/lib/ovie/promoted-workflows';
import { resetSummerTransportRuntime } from '@/lib/ovie/summer-transport';

describe('POST /api/summer/control', () => {
  beforeEach(() => {
    resetPromotedDumpAckRuntime();
    resetSummerTransportRuntime();
  });

  it('fails closed when unauthenticated', async () => {
    const response = respondToSummerControl({
      authenticated: false,
      isAdmin: false,
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false });
  });

  it('accepts an authenticated founder-scoped call', async () => {
    const response = respondToSummerControl({
      authenticated: true,
      isAdmin: true,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      surface: 'summer-jovie-control',
      promotedWorkflow: {
        owner: 'summer',
        promotionStatus: 'promoted',
        eveCannotMutate: true,
        codeRouting: {
          authority: 'summer',
          orchestrator: 'symphony',
          executionHost: 'gem',
        },
      },
    });
  });

  it('lets Summer disable the promoted workflow without dropping receipts', async () => {
    const founder = { authenticated: true, isAdmin: true };
    const executed = respondToSummerControl(founder, {
      action: 'execute',
      workId: 'work_ctrl_1',
      items: ['post this tweet'],
    });
    expect(executed.status).toBe(200);
    const executedBody = await executed.json();
    expect(executedBody.receipt.status).toBe('completed');

    const disabled = respondToSummerControl(founder, { action: 'disable' });
    expect(disabled.status).toBe(200);
    await expect(disabled.json()).resolves.toMatchObject({
      ok: true,
      promotedWorkflow: {
        enabled: false,
        owner: 'summer',
        eveCannotMutate: true,
      },
    });
  });

  it('disables Summer transport while keeping durable receipts', async () => {
    const founder = { authenticated: true, isAdmin: true };
    const disabled = respondToSummerControl(founder, {
      action: 'disable-transport',
    });
    expect(disabled.status).toBe(200);
    await expect(disabled.json()).resolves.toMatchObject({
      ok: true,
      summerTransportEnabled: false,
    });
  });
});
