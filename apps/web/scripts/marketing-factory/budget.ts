/** Factory-owned paid-call reservations. No credentials or model calls here. */
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { GatewayRequestPolicy } from '@jovie/copy';
import { z } from 'zod';
import {
  FACTORY_STAGES,
  type FactoryStage,
} from '../../data/marketing/factory/spine';
import { digestOf } from './receipts';

/**
 * Uncached Z.AI rates verified 2026-10-02. These are estimated reservations,
 * not an invoice guarantee. Reserve the entire documented 1M context with a
 * binary-unit margin, rather than pretending bytes/4 bounds input tokens.
 * Sources: https://docs.z.ai/guides/overview/pricing
 * https://vercel.com/ai-gateway/models/glm-5.3
 * https://vercel.com/ai-gateway/models/glm-5.3-flash
 */
export const FACTORY_PAID_CANARY_POLICY = {
  version: 'jovie.factory-paid-canary/v1',
  verifiedOn: '2026-10-02',
  validUntil: '2026-10-03T00:00:00.000Z',
  provider: 'zai',
  maxStageAttempts: 1,
  maxPromptBytes: 32_768,
  models: {
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
  },
} as const;

type PaidModel = keyof typeof FACTORY_PAID_CANARY_POLICY.models;
const modelSchema = z.enum(['zai/glm-5.3', 'zai/glm-5.3-flash']);
const maximumNanoUsd = Object.values(FACTORY_PAID_CANARY_POLICY.models).reduce(
  (sum, model) =>
    sum +
    model.maxCalls *
      (model.inputReserve * model.inputNanoUsd +
        model.maxTokens * model.outputNanoUsd),
  0
);
export const FactoryPaidBudgetConfigSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/u),
    maxEstimatedUsd: z
      .number()
      .positive()
      .max(maximumNanoUsd / 1e9),
  })
  .strict();
export type FactoryPaidBudgetConfig = z.infer<
  typeof FactoryPaidBudgetConfigSchema
>;

const bindingSchema = z
  .object({
    pageId: z.string().min(1),
    briefDigest: z.string().min(1),
  })
  .strict();
const ledgerSchema = z
  .object({
    schema: z.literal('jovie.factory-paid-ledger/v1'),
    config: FactoryPaidBudgetConfigSchema,
    binding: bindingSchema,
    policyDigest: z.string().min(1),
    stages: z.array(z.enum(FACTORY_STAGES)),
    reservations: z.array(
      z
        .object({
          model: modelSchema,
          estimatedNanoUsd: z.number().int().positive(),
        })
        .strict()
    ),
  })
  .strict();
type Ledger = z.infer<typeof ledgerSchema>;

function reservation(model: PaidModel): number {
  const price = FACTORY_PAID_CANARY_POLICY.models[model];
  if (
    ![
      price.inputReserve,
      price.maxTokens,
      price.inputNanoUsd,
      price.outputNanoUsd,
    ].every(value => Number.isSafeInteger(value) && value > 0)
  ) {
    throw new Error('paid budget: unknown or invalid model price');
  }
  return (
    price.inputReserve * price.inputNanoUsd +
    price.maxTokens * price.outputNanoUsd
  );
}

function validateTotals(ledger: Ledger): void {
  const total = ledger.reservations.reduce((sum, entry) => {
    if (entry.estimatedNanoUsd !== reservation(entry.model)) {
      throw new Error('paid budget: corrupt reservation');
    }
    return sum + entry.estimatedNanoUsd;
  }, 0);
  if (total > Math.floor(ledger.config.maxEstimatedUsd * 1e9)) {
    throw new Error('paid budget: aggregate estimated spend ceiling exceeded');
  }
  for (const model of modelSchema.options) {
    if (
      ledger.reservations.filter(entry => entry.model === model).length >
      FACTORY_PAID_CANARY_POLICY.models[model].maxCalls
    ) {
      throw new Error(`paid budget: call ceiling exceeded for ${model}`);
    }
  }
  if (new Set(ledger.stages).size !== ledger.stages.length) {
    throw new Error('paid budget: cumulative stage attempt ceiling exceeded');
  }
}

/** Same budget ID survives fresh runs and resumes; no timeout refunds or resets. */
export function openFactoryPaidBudget(options: {
  runsDir: string;
  config: FactoryPaidBudgetConfig;
  binding: z.infer<typeof bindingSchema>;
  requireExisting?: boolean;
  now?: () => Date;
}) {
  const config = FactoryPaidBudgetConfigSchema.parse(options.config);
  const binding = bindingSchema.parse(options.binding);
  const policyDigest = digestOf(FACTORY_PAID_CANARY_POLICY);
  const ledgerPath = join(
    options.runsDir,
    '.paid-budgets',
    `${config.id}.json`
  );
  let blockedReason: string | null = null;
  const fresh = (): Ledger => ({
    schema: 'jovie.factory-paid-ledger/v1',
    config,
    binding,
    policyDigest,
    stages: [],
    reservations: [],
  });

  function transaction(update?: (ledger: Ledger) => void): Ledger {
    let lock: number | undefined;
    const lockPath = `${ledgerPath}.lock`;
    try {
      const now = (options.now ?? (() => new Date()))().getTime();
      if (
        !Number.isFinite(now) ||
        now < Date.parse(FACTORY_PAID_CANARY_POLICY.verifiedOn) ||
        now >= Date.parse(FACTORY_PAID_CANARY_POLICY.validUntil)
      ) {
        throw new Error('paid budget: pricing snapshot expired or unverified');
      }
      mkdirSync(dirname(ledgerPath), { recursive: true });
      // A crash leaves the lock in place: fail closed, never reclaim automatically.
      lock = openSync(lockPath, 'wx', 0o600);
      const exists = existsSync(ledgerPath);
      if (!exists && (options.requireExisting || initialized)) {
        throw new Error('paid budget: existing ledger is missing');
      }
      const ledger = exists
        ? ledgerSchema.parse(JSON.parse(readFileSync(ledgerPath, 'utf8')))
        : fresh();
      if (
        digestOf(ledger.config) !== digestOf(config) ||
        digestOf(ledger.binding) !== digestOf(binding) ||
        ledger.policyDigest !== policyDigest
      ) {
        throw new Error('paid budget: policy or run binding mismatch');
      }
      validateTotals(ledger);
      const bindingPath = join(
        dirname(ledgerPath),
        `binding-${digestOf(binding).slice(7)}.json`
      );
      if (existsSync(bindingPath)) {
        const owner = JSON.parse(readFileSync(bindingPath, 'utf8')) as unknown;
        if (digestOf(owner) !== digestOf({ id: config.id })) {
          throw new Error(
            'paid budget: this canary already belongs to a different budget id'
          );
        }
      } else {
        if (exists)
          throw new Error('paid budget: existing canary binding is missing');
        const bindingFile = openSync(bindingPath, 'wx', 0o600);
        try {
          writeFileSync(bindingFile, JSON.stringify({ id: config.id }));
          fsyncSync(bindingFile);
        } finally {
          closeSync(bindingFile);
        }
      }
      update?.(ledger);
      validateTotals(ledger);
      if (update || !exists) {
        const temporary = `${ledgerPath}.pending`;
        const fd = openSync(temporary, 'w', 0o600);
        try {
          writeFileSync(fd, `${JSON.stringify(ledger, null, 2)}\n`);
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
        renameSync(temporary, ledgerPath);
        const directory = openSync(dirname(ledgerPath), 'r');
        try {
          fsyncSync(directory);
        } finally {
          closeSync(directory);
        }
      }
      return ledger;
    } catch (error) {
      blockedReason = `paid budget blocked: ${error instanceof Error ? error.message : String(error)}`;
      throw new Error(blockedReason, { cause: error });
    } finally {
      if (lock !== undefined) {
        closeSync(lock);
        unlinkSync(lockPath);
      }
    }
  }

  let initialized = false;
  transaction();
  initialized = true;
  const policy: GatewayRequestPolicy = {
    allowed: model => modelSchema.safeParse(model).success,
    async authorize(request) {
      try {
        const model = modelSchema.parse(request.model);
        // This bounds payload size only; cost reserves the full context above.
        if (
          Buffer.byteLength(request.system, 'utf8') +
            Buffer.byteLength(request.prompt, 'utf8') >
          FACTORY_PAID_CANARY_POLICY.maxPromptBytes
        ) {
          throw new Error('paid budget: prompt byte ceiling exceeded');
        }
        transaction(ledger => {
          ledger.reservations.push({
            model,
            estimatedNanoUsd: reservation(model),
          });
        });
        return {
          maxTokens: FACTORY_PAID_CANARY_POLICY.models[model].maxTokens,
          provider: FACTORY_PAID_CANARY_POLICY.provider,
        };
      } catch (error) {
        blockedReason = `paid budget blocked: ${error instanceof Error ? error.message : String(error)}`;
        throw new Error(blockedReason, { cause: error });
      }
    },
  };
  return {
    reference: { id: config.id, policyDigest, ledgerPath },
    policy,
    get blockedReason() {
      return blockedReason;
    },
    beginStage(stage: FactoryStage) {
      transaction(ledger => {
        ledger.stages.push(stage);
      });
    },
    snapshot() {
      return transaction();
    },
  };
}
