import {
  type SummerBottleneckDependencies,
  type SummerBottleneckRecord,
  type SummerBottleneckStore,
  type SymphonyRepairTask,
} from './summer-bottleneck-loop';
import {
  listImmutableShadowRecords,
  persistImmutableShadowRecord,
  readImmutableShadowRecord,
} from './vercel-blob-shadow-store';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function boundedSigningKey(): string {
  const key = process.env.EVE_CORE_CHAT_AUTH_TOKEN?.trim();
  if (!key || key.length < 24) {
    throw new Error('Eve receipt signing authority is unavailable');
  }
  return key;
}

export function createVercelBlobBottleneckStore(): SummerBottleneckStore {
  return {
    create: persistImmutableShadowRecord,
    read: readImmutableShadowRecord,
    list: listImmutableShadowRecords,
  };
}

function taskPath(idempotencyKey: string): string {
  return `summer-bottleneck/symphony-outbox/${idempotencyKey}.json`;
}

function outcomePath(idempotencyKey: string): string {
  return `summer-bottleneck/symphony-terminal/${idempotencyKey}.json`;
}

export function createVercelBlobBottleneckDependencies(
  store: SummerBottleneckStore = createVercelBlobBottleneckStore()
): SummerBottleneckDependencies {
  return {
    store,
    now: () => new Date(),
    receiptSigningKey: boundedSigningKey(),
    async dispatchToSymphony(task: SymphonyRepairTask, { idempotencyKey }) {
      if (task.taskKey !== idempotencyKey) {
        throw new Error('Symphony task key does not match idempotency key');
      }
      const outbox = {
        schema: 'jovie.eve.symphony-repair-outbox/v1',
        destination: 'symphony',
        idempotencyKey,
        status: 'ready',
        task,
      } satisfies SummerBottleneckRecord;
      const result = await store.create(taskPath(idempotencyKey), outbox);
      if (result === 'exists') {
        const existing = await store.read(taskPath(idempotencyKey));
        if (!existing || canonical(existing) !== canonical(outbox)) {
          throw new Error('Symphony outbox conflict');
        }
      }
      return { handle: `symphony:${idempotencyKey}` };
    },
    async observeSymphonyOutcome({ handle, idempotencyKey }) {
      if (handle !== `symphony:${idempotencyKey}`) {
        throw new Error('Symphony handle is not source-bound');
      }
      const outcome = await store.read(outcomePath(idempotencyKey));
      if (!outcome) return { status: 'pending', detail: 'awaiting-symphony' };
      if (
        outcome.schema !== 'jovie.symphony-repair-outcome/v1' ||
        outcome.taskKey !== idempotencyKey ||
        !['succeeded', 'failed'].includes(String(outcome.status)) ||
        typeof outcome.detail !== 'string' ||
        outcome.detail.length === 0 ||
        outcome.detail.length > 240
      ) {
        throw new Error('Symphony outcome is malformed or cross-bound');
      }
      return {
        status: outcome.status as 'succeeded' | 'failed',
        detail: outcome.detail,
      };
    },
  };
}
