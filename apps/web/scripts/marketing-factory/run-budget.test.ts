import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JudgeTransport } from '@jovie/copy';
import { routedTransport } from '@jovie/copy/transport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FactoryStage } from '../../data/marketing/factory/spine';
import { loadFactoryBrief } from './brief';
import { readJson } from './receipts';
import { runFactory } from './run';
import type { StageRunner } from './stage-kit';
import { FACTORY_STAGE_RUNNERS } from './stages';

vi.mock('@jovie/copy/transport', () => ({ routedTransport: vi.fn() }));

let runsDir: string;
const dispatched = vi.fn();
const budgetConfig = { id: 'homepage-test', maxEstimatedUsd: 6.1034496 };
const brief = loadFactoryBrief('solutions', 'founders');
const request = { model: 'zai/glm-5.3', system: 'Judge', prompt: 'Test' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
  vi.stubEnv('AI_GATEWAY_API_KEY', 'test-only-no-network');
  runsDir = mkdtempSync(join(tmpdir(), 'factory-run-budget-'));
  dispatched.mockClear();
  vi.mocked(routedTransport).mockImplementation((key, policy) => {
    const send: JudgeTransport = async input => {
      if (!key || !policy) throw new Error('paid transport disabled');
      await policy.authorize(input);
      dispatched(input);
      return '{}';
    };
    send.available = model => Boolean(key && policy?.allowed(model));
    return send;
  });
});
afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const run = (runner: StageRunner, paid = true, fromStage?: FactoryStage) =>
  runFactory({
    family: brief.family,
    slug: brief.slug,
    brief,
    runsDir,
    allowPartial: true,
    paidBudget: paid ? budgetConfig : undefined,
    fromStage,
    runners: { truth: runner },
  });

describe('factory paid allowance wiring', () => {
  it('does not enable Gateway from credentials alone', async () => {
    await run(FACTORY_STAGE_RUNNERS.truth!, false);
    expect(routedTransport).toHaveBeenLastCalledWith(undefined, undefined);
    expect(dispatched).not.toHaveBeenCalled();
  });

  it('guards generation and judges before dispatch, and a fresh run cannot reset them', async () => {
    const runner: StageRunner = async ctx => {
      await ctx.providers.generate({
        ...request,
        stage: 'outcomes',
        attempt: 1,
        feedback: [],
      });
      await ctx.providers.transport!(request);
      return FACTORY_STAGE_RUNNERS.truth!(ctx);
    };
    const first = await run(runner);
    expect(first.status).toBe('incomplete');
    expect(dispatched).toHaveBeenCalledTimes(2);
    const ledgerPath = first.paidBudget!.ledgerPath;
    expect(
      readJson<{ reservations: unknown[] }>(ledgerPath).reservations
    ).toHaveLength(2);
    const restarted = await run(runner, true, 'truth');
    expect(restarted.status).toBe('budget-blocked');
    expect(restarted.reason).toContain('stage attempt ceiling');
    expect(dispatched).toHaveBeenCalledTimes(2);
    expect(
      readJson<{ reservations: unknown[] }>(ledgerPath).reservations
    ).toHaveLength(2);
  });

  it('stops terminally when a judge catches a refused reservation', async () => {
    const runner: StageRunner = async ctx => {
      for (let index = 0; index < 6; index++) {
        try {
          await ctx.providers.transport!({
            ...request,
            model: index === 4 ? 'zai/glm-5.3-flash' : request.model,
          });
        } catch {
          /* The real judge panel converts transport errors to failed verdicts. */
        }
      }
      return FACTORY_STAGE_RUNNERS.truth!(ctx);
    };
    const result = await run(runner);
    expect(result).toMatchObject({
      status: 'budget-blocked',
      stoppedAt: 'truth',
      chain: [],
    });
    expect(result.attempts).toHaveLength(1);
    expect(dispatched).toHaveBeenCalledTimes(5);
  });

  it('does not retry a failed paid stage or refund a failed request', async () => {
    dispatched.mockImplementationOnce(() => {
      throw new Error('timeout, outcome unknown');
    });
    const runner: StageRunner = async ctx => {
      await ctx.providers.transport!(request);
      return FACTORY_STAGE_RUNNERS.truth!(ctx);
    };
    const result = await run(runner);
    expect(result.status).toBe('failed');
    expect(result.attempts).toHaveLength(1);
    expect(dispatched).toHaveBeenCalledTimes(1);
    expect(
      readJson<{ reservations: unknown[] }>(result.paidBudget!.ledgerPath)
        .reservations
    ).toHaveLength(1);
  });

  it('rejects custom providers on a paid canary rather than bypassing the guard', async () => {
    const { dryProviders } = await import('./providers');
    await expect(
      runFactory({
        family: brief.family,
        slug: brief.slug,
        brief,
        runsDir,
        paidBudget: budgetConfig,
        providers: dryProviders(brief),
      })
    ).rejects.toThrow('standard live factory providers');
    expect(dispatched).not.toHaveBeenCalled();
  });

  it('refuses resume without the original budget or its ledger', async () => {
    const result = await run(FACTORY_STAGE_RUNNERS.truth!);
    await expect(
      run(FACTORY_STAGE_RUNNERS.truth!, false, 'persuasion')
    ).rejects.toThrow('paid budget binding changed');
    rmSync(result.paidBudget!.ledgerPath);
    await expect(
      run(FACTORY_STAGE_RUNNERS.truth!, true, 'persuasion')
    ).rejects.toThrow('existing ledger is missing');
    expect(dispatched).not.toHaveBeenCalled();
  });
});
