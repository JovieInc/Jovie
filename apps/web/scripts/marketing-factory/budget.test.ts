import {
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FACTORY_STAGES,
  type FactoryStage,
} from '../../data/marketing/factory/spine';
import {
  FACTORY_PAID_CANARY_POLICY,
  FactoryPaidBudgetConfigSchema,
  openFactoryPaidBudget,
} from './budget';
import { digestOf } from './receipts';

const MAXIMUM_ESTIMATED_USD = 6.1034496;
const DEFAULT_CONFIG = {
  id: 'homepage-canary-2026-10-02',
  maxEstimatedUsd: MAXIMUM_ESTIMATED_USD,
};
const DEFAULT_BINDING = {
  pageId: 'homepage-home',
  briefDigest: 'sha256:brief-home-v1',
};
const FIXED_NOW = () => new Date('2026-10-02T12:00:00.000Z');

let runsDir: string;

function openBudget(
  input: {
    config?: Partial<typeof DEFAULT_CONFIG>;
    binding?: Partial<typeof DEFAULT_BINDING>;
    requireExisting?: boolean;
    now?: () => Date;
  } = {}
) {
  return openFactoryPaidBudget({
    runsDir,
    config: { ...DEFAULT_CONFIG, ...input.config },
    binding: { ...DEFAULT_BINDING, ...input.binding },
    requireExisting: input.requireExisting,
    now: input.now ?? FIXED_NOW,
  });
}

function request(model: string) {
  return { model, system: 'test system', prompt: 'test prompt' };
}

async function authorizeAtStage(
  budget: ReturnType<typeof openBudget>,
  stage: FactoryStage,
  model: string
) {
  budget.beginStage(stage);
  return budget.policy.authorize(request(model));
}

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'factory-paid-budget-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('factory paid-call budget', () => {
  it('pins the one-day model policy and maximum reservation ceiling', () => {
    expect(FACTORY_PAID_CANARY_POLICY.validUntil).toBe(
      '2026-10-03T00:00:00.000Z'
    );
    expect(FACTORY_PAID_CANARY_POLICY.maxStageAttempts).toBe(1);
    expect(FACTORY_PAID_CANARY_POLICY.models).toEqual({
      'zai/glm-5.3': {
        maxCalls: 4,
        inputReserve: 1_048_576,
        maxTokens: 4096,
        inputNanoUsd: 1400,
        outputNanoUsd: 4400,
      },
      'zai/glm-5.3-flash': {
        maxCalls: 1,
        inputReserve: 1_048_576,
        maxTokens: 4096,
        inputNanoUsd: 150,
        outputNanoUsd: 500,
      },
    });
    expect(
      FactoryPaidBudgetConfigSchema.safeParse({
        ...DEFAULT_CONFIG,
        maxEstimatedUsd: 1,
      }).success
    ).toBe(true);
    expect(
      FactoryPaidBudgetConfigSchema.safeParse({
        ...DEFAULT_CONFIG,
        maxEstimatedUsd: MAXIMUM_ESTIMATED_USD + 0.0000001,
      }).success
    ).toBe(false);
  });

  it('authorizes only the pinned models and reserves their full documented cost', async () => {
    const budget = openBudget();
    expect(budget.policy.allowed('zai/glm-5.3')).toBe(true);
    expect(budget.policy.allowed('zai/glm-5.3-flash')).toBe(true);
    expect(budget.policy.allowed('openai/gpt-6')).toBe(false);

    await expect(
      budget.policy.authorize(request('openai/gpt-6'))
    ).rejects.toThrow(/paid budget blocked/i);
    expect(budget.blockedReason).toMatch(/paid budget blocked/i);
    expect(budget.snapshot().reservations).toEqual([]);

    const freshBudget = openBudget();
    const authorization = await authorizeAtStage(
      freshBudget,
      'outcomes',
      'zai/glm-5.3'
    );
    expect(authorization).toEqual({ maxTokens: 4096, provider: 'zai' });
    expect(freshBudget.snapshot().reservations).toEqual([
      { model: 'zai/glm-5.3', estimatedNanoUsd: 1_486_028_800 },
    ]);
  });

  it('enforces the cumulative per-model call cap', async () => {
    const budget = openBudget({ config: { id: 'flash-call-cap' } });
    const stages = FACTORY_STAGES.filter(stage => stage !== 'truth').slice(
      0,
      2
    );

    await authorizeAtStage(budget, stages[0]!, 'zai/glm-5.3-flash');
    await expect(
      authorizeAtStage(budget, stages[1]!, 'zai/glm-5.3-flash')
    ).rejects.toThrow(/call ceiling/i);

    expect(budget.snapshot().reservations).toEqual([
      { model: 'zai/glm-5.3-flash', estimatedNanoUsd: 159_334_400 },
    ]);
    expect(budget.blockedReason).toMatch(/call ceiling/i);
  });

  it('enforces a lower configured aggregate estimate ceiling', async () => {
    const budget = openBudget({
      config: { id: 'lower-aggregate-cap', maxEstimatedUsd: 1.5 },
    });
    await authorizeAtStage(budget, 'outcomes', 'zai/glm-5.3');

    await expect(
      authorizeAtStage(budget, 'narrative', 'zai/glm-5.3')
    ).rejects.toThrow(/aggregate estimated spend ceiling/i);
    expect(budget.snapshot().reservations).toEqual([
      { model: 'zai/glm-5.3', estimatedNanoUsd: 1_486_028_800 },
    ]);
  });

  it('blocks an oversized multibyte prompt before reserving a paid call', async () => {
    const budget = openBudget({ config: { id: 'prompt-byte-cap' } });
    const prompt = 'é'.repeat(
      FACTORY_PAID_CANARY_POLICY.maxPromptBytes / 2 + 1
    );
    expect(prompt.length).toBeLessThan(
      FACTORY_PAID_CANARY_POLICY.maxPromptBytes
    );
    expect(Buffer.byteLength(prompt, 'utf8')).toBeGreaterThan(
      FACTORY_PAID_CANARY_POLICY.maxPromptBytes
    );

    await expect(
      budget.policy.authorize({
        model: 'zai/glm-5.3',
        system: '',
        prompt,
      })
    ).rejects.toThrow(/prompt byte ceiling/i);
    expect(budget.snapshot().reservations).toEqual([]);
  });

  it('allows exactly the published aggregate maximum when all calls are reserved', async () => {
    const budget = openBudget({ config: { id: 'aggregate-maximum' } });
    const stages = FACTORY_STAGES.slice(0, 5);
    const models = [
      'zai/glm-5.3',
      'zai/glm-5.3',
      'zai/glm-5.3',
      'zai/glm-5.3',
      'zai/glm-5.3-flash',
    ];

    for (const [index, model] of models.entries()) {
      await authorizeAtStage(budget, stages[index]!, model);
    }

    const snapshot = budget.snapshot();
    expect(snapshot.reservations).toHaveLength(5);
    expect(
      snapshot.reservations.reduce(
        (total, reservation) => total + reservation.estimatedNanoUsd,
        0
      )
    ).toBe(6_103_449_600);
    expect(snapshot.config.maxEstimatedUsd).toBe(MAXIMUM_ESTIMATED_USD);
  });

  it('retains reservations after reopening the budget following a timeout', async () => {
    const first = openBudget({ config: { id: 'timeout-reopen' } });
    await authorizeAtStage(first, 'outcomes', 'zai/glm-5.3');

    const reopened = openBudget({
      config: { id: 'timeout-reopen' },
      requireExisting: true,
    });
    const snapshot = reopened.snapshot();
    expect(snapshot.reservations).toEqual([
      { model: 'zai/glm-5.3', estimatedNanoUsd: 1_486_028_800 },
    ]);
    expect(snapshot.stages).toEqual(['outcomes']);
    expect(snapshot.binding).toEqual(DEFAULT_BINDING);
    expect(snapshot.policyDigest).toBe(reopened.reference.policyDigest);
  });

  it('blocks a repeated stage attempt after reopening the same budget', () => {
    const first = openBudget({ config: { id: 'one-stage-attempt' } });
    first.beginStage('narrative');
    const reopened = openBudget({
      config: { id: 'one-stage-attempt' },
      requireExisting: true,
    });

    expect(() => reopened.beginStage('narrative')).toThrow(
      /stage attempt ceiling/i
    );
    expect(reopened.blockedReason).toMatch(/stage attempt ceiling/i);
    expect(reopened.snapshot().stages).toEqual(['narrative']);
  });

  it('requires an existing ledger when resuming', () => {
    expect(() => openBudget({ requireExisting: true })).toThrow(
      /ledger is missing/i
    );
  });

  it('fails closed on corrupt ledgers and mismatched budget or run binding', () => {
    const corrupt = openBudget({ config: { id: 'corrupt-ledger' } });
    writeFileSync(corrupt.reference.ledgerPath, '{truncated', 'utf8');
    expect(() =>
      openBudget({
        config: { id: 'corrupt-ledger' },
        requireExisting: true,
      })
    ).toThrow(/paid budget blocked/i);

    openBudget({
      config: { id: 'config-binding' },
      binding: { briefDigest: 'second-brief' },
    });
    expect(() =>
      openBudget({
        config: {
          id: 'config-binding',
          maxEstimatedUsd: MAXIMUM_ESTIMATED_USD - 0.1,
        },
        binding: { briefDigest: 'second-brief' },
        requireExisting: true,
      })
    ).toThrow(/mismatch/i);
    expect(() =>
      openBudget({
        config: { id: 'config-binding' },
        binding: { pageId: 'solutions-founders' },
        requireExisting: true,
      })
    ).toThrow(/mismatch/i);
  });

  it('fails closed when a persisted reservation amount was altered', async () => {
    const budget = openBudget({ config: { id: 'corrupt-reservation' } });
    await budget.policy.authorize(request('zai/glm-5.3'));
    const ledger = JSON.parse(
      readFileSync(budget.reference.ledgerPath, 'utf8')
    ) as { reservations: { estimatedNanoUsd: number }[] };
    ledger.reservations[0]!.estimatedNanoUsd += 1;
    writeFileSync(
      budget.reference.ledgerPath,
      `${JSON.stringify(ledger, null, 2)}\n`,
      'utf8'
    );

    expect(() =>
      openBudget({
        config: { id: 'corrupt-reservation' },
        requireExisting: true,
      })
    ).toThrow(/corrupt reservation/i);
  });

  it('fails closed when the persistent canary binding index is missing', () => {
    const budget = openBudget({ config: { id: 'missing-binding-index' } });
    const bindingPath = join(
      dirname(budget.reference.ledgerPath),
      `binding-${digestOf(DEFAULT_BINDING).slice(7)}.json`
    );
    unlinkSync(bindingPath);

    expect(() =>
      openBudget({
        config: { id: 'missing-binding-index' },
        requireExisting: true,
      })
    ).toThrow(/existing canary binding is missing/i);
  });

  it('does not renew the same canary by changing its budget id', async () => {
    const budget = openBudget();
    await budget.policy.authorize(request('zai/glm-5.3-flash'));
    expect(() => openBudget({ config: { id: 'new-id-same-canary' } })).toThrow(
      /already belongs to a different budget id/
    );
    expect(openBudget().snapshot().reservations).toHaveLength(1);
  });

  it('fails closed when a stale lock file is present', () => {
    const first = openBudget({ config: { id: 'locked-ledger' } });
    writeFileSync(`${first.reference.ledgerPath}.lock`, 'held', 'utf8');

    expect(() =>
      openBudget({ config: { id: 'locked-ledger' }, requireExisting: true })
    ).toThrow(/paid budget blocked/i);
  });

  it('refuses reservations when the pinned pricing snapshot has expired', () => {
    expect(() =>
      openBudget({
        config: { id: 'expired-price' },
        now: () => new Date('2026-10-03T00:00:00.000Z'),
      })
    ).toThrow(/pricing snapshot expired/i);
  });
});
