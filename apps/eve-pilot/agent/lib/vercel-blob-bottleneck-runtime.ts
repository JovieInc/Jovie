import {
  createHash,
  createPublicKey,
  sign as nodeSign,
  verify as nodeVerify,
} from 'node:crypto';
import {
  type SummerBottleneckDependencies,
  type SummerBottleneckRecord,
  type SummerBottleneckStore,
  type SymphonyRepairTask,
  symphonyRepairTaskSchema,
} from './summer-bottleneck-loop';
import {
  listImmutableShadowRecords,
  persistImmutableShadowRecord,
  persistShadowCursor,
  readImmutableShadowRecord,
} from './vercel-blob-shadow-store';

const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u;

export function canonicalSummerBottleneckRecord(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalSummerBottleneckRecord).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, child]) =>
          `${JSON.stringify(key)}:${canonicalSummerBottleneckRecord(child)}`
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function signRecord(
  domain: string,
  record: SummerBottleneckRecord,
  privateKey: string,
  keyId: string
): SummerBottleneckRecord {
  const { signature: _signature, signatureKeyId: _keyId, ...body } = record;
  const unsigned = { ...body, signatureKeyId: keyId };
  const signature = nodeSign(
    null,
    Buffer.from(`${domain}\0${canonicalSummerBottleneckRecord(unsigned)}`),
    privateKey
  ).toString('base64url');
  return { ...unsigned, signature: `ed25519=${signature}` };
}

function verifyRecord(
  domain: string,
  record: SummerBottleneckRecord,
  keys: ReadonlyMap<string, string>
): boolean {
  const keyId = record.signatureKeyId;
  const actual = record.signature;
  if (
    typeof keyId !== 'string' ||
    typeof actual !== 'string' ||
    !/^ed25519=[A-Za-z0-9_-]{80,100}$/u.test(actual)
  ) {
    return false;
  }
  const publicKey = keys.get(keyId);
  if (!publicKey) return false;
  const { signature: _signature, ...unsigned } = record;
  return nodeVerify(
    null,
    Buffer.from(`${domain}\0${canonicalSummerBottleneckRecord(unsigned)}`),
    publicKey,
    Buffer.from(actual.slice('ed25519='.length), 'base64url')
  );
}

export type SummerBottleneckRuntimeSecurity = {
  readonly eveOutboxSigningPrivateKey: string;
  readonly eveOutboxSigningKeyId: string;
  readonly eveOutboxVerificationKeys: ReadonlyMap<string, string>;
  readonly receiptSigningKey: string;
  readonly receiptSigningKeyId: string;
  readonly producerVerificationKeys: ReadonlyMap<string, string>;
  readonly symphonyOutcomeVerificationKeys: ReadonlyMap<string, string>;
};

export const SUMMER_BOTTLENECK_SECURITY_ENV = {
  eveOutboxSigningKeyId: 'SUMMER_BOTTLENECK_EVE_OUTBOX_SIGNING_KEY_ID',
  eveOutboxSigningPrivateKey:
    'SUMMER_BOTTLENECK_EVE_OUTBOX_SIGNING_PRIVATE_KEY',
  eveOutboxVerificationKeys:
    'SUMMER_BOTTLENECK_EVE_OUTBOX_VERIFICATION_KEYS_JSON',
  producerVerificationKeys: 'SUMMER_BOTTLENECK_PRODUCER_VERIFICATION_KEYS_JSON',
  receiptSigningKey: 'SUMMER_BOTTLENECK_RECEIPT_SIGNING_KEY',
  receiptSigningKeyId: 'SUMMER_BOTTLENECK_RECEIPT_SIGNING_KEY_ID',
  symphonyOutcomeVerificationKeys:
    'SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_VERIFICATION_KEYS_JSON',
} as const;

function verificationKeys(value: string): ReadonlyMap<string, string> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('verification keys must be a JSON object');
  }
  const entries = Object.entries(parsed);
  if (
    entries.length === 0 ||
    entries.some(
      ([keyId, key]) =>
        !KEY_ID.test(keyId) || typeof key !== 'string' || key.trim() === ''
    )
  ) {
    throw new Error('verification keys are invalid');
  }
  return new Map(entries as [string, string][]);
}

export function summerBottleneckSecurityFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env
): SummerBottleneckRuntimeSecurity | undefined {
  const read = (name: string) => environment[name]?.trim();
  const eveOutboxSigningPrivateKey = read(
    SUMMER_BOTTLENECK_SECURITY_ENV.eveOutboxSigningPrivateKey
  );
  const eveOutboxSigningKeyId = read(
    SUMMER_BOTTLENECK_SECURITY_ENV.eveOutboxSigningKeyId
  );
  const eveOutboxVerificationKeys = read(
    SUMMER_BOTTLENECK_SECURITY_ENV.eveOutboxVerificationKeys
  );
  const producerVerificationKeys = read(
    SUMMER_BOTTLENECK_SECURITY_ENV.producerVerificationKeys
  );
  const receiptSigningKey = read(
    SUMMER_BOTTLENECK_SECURITY_ENV.receiptSigningKey
  );
  const receiptSigningKeyId = read(
    SUMMER_BOTTLENECK_SECURITY_ENV.receiptSigningKeyId
  );
  const symphonyOutcomeVerificationKeys = read(
    SUMMER_BOTTLENECK_SECURITY_ENV.symphonyOutcomeVerificationKeys
  );
  if (
    !eveOutboxSigningPrivateKey ||
    !eveOutboxSigningKeyId ||
    !eveOutboxVerificationKeys ||
    !producerVerificationKeys ||
    !receiptSigningKey ||
    !receiptSigningKeyId ||
    !symphonyOutcomeVerificationKeys
  ) {
    return undefined;
  }
  try {
    return {
      eveOutboxSigningPrivateKey,
      eveOutboxSigningKeyId,
      eveOutboxVerificationKeys: verificationKeys(eveOutboxVerificationKeys),
      producerVerificationKeys: verificationKeys(producerVerificationKeys),
      receiptSigningKey,
      receiptSigningKeyId,
      symphonyOutcomeVerificationKeys: verificationKeys(
        symphonyOutcomeVerificationKeys
      ),
    };
  } catch {
    return undefined;
  }
}

function assertDedicatedSecurity(
  security: SummerBottleneckRuntimeSecurity | undefined
): asserts security is SummerBottleneckRuntimeSecurity {
  if (!security) {
    throw new Error(
      'dedicated Summer and Symphony signing authority is unavailable'
    );
  }
  const symphonyKeys = security.symphonyOutcomeVerificationKeys;
  const ids = security
    ? [
        security.receiptSigningKeyId,
        security.eveOutboxSigningKeyId,
        ...symphonyKeys.keys(),
        ...security.eveOutboxVerificationKeys.keys(),
      ]
    : [];
  let distinctAuthorities = false;
  try {
    const fingerprint = (key: string) =>
      createHash('sha256')
        .update(
          createPublicKey(key).export({ format: 'der', type: 'spki' }) as Buffer
        )
        .digest('hex');
    const producer = new Set(
      [...security.producerVerificationKeys.values()].map(fingerprint)
    );
    const outbox = new Set(
      [...security.eveOutboxVerificationKeys.values()].map(fingerprint)
    );
    const symphony = new Set([...symphonyKeys.values()].map(fingerprint));
    const privateFingerprint = fingerprint(security.eveOutboxSigningPrivateKey);
    distinctAuthorities =
      outbox.has(privateFingerprint) &&
      [...producer].every(
        value => !outbox.has(value) && !symphony.has(value)
      ) &&
      [...outbox].every(value => !symphony.has(value));
  } catch {
    distinctAuthorities = false;
  }
  if (
    symphonyKeys.size === 0 ||
    security.producerVerificationKeys.size === 0 ||
    security.eveOutboxVerificationKeys.size === 0 ||
    security.receiptSigningKey.length < 32 ||
    ids.some(keyId => !KEY_ID.test(keyId)) ||
    !distinctAuthorities
  ) {
    throw new Error(
      'dedicated Summer and Symphony signing authority is unavailable'
    );
  }
}

export function createVercelBlobBottleneckStore(): SummerBottleneckStore {
  return {
    create: persistImmutableShadowRecord,
    read: readImmutableShadowRecord,
    list: listImmutableShadowRecords,
    write: persistShadowCursor,
  };
}

function taskPath(idempotencyKey: string): string {
  return `summer-bottleneck/symphony-outbox/${idempotencyKey}.json`;
}

function outcomePath(idempotencyKey: string): string {
  return `summer-bottleneck/symphony-terminal/${idempotencyKey}.json`;
}

export function signSymphonyRepairOutcome(
  record: SummerBottleneckRecord,
  privateKey: string,
  keyId: string
): SummerBottleneckRecord {
  return signRecord(
    'jovie.symphony-repair-outcome/v1',
    record,
    privateKey,
    keyId
  );
}

export function createVercelBlobBottleneckDependencies(
  store: SummerBottleneckStore = createVercelBlobBottleneckStore(),
  security:
    | SummerBottleneckRuntimeSecurity
    | undefined = summerBottleneckSecurityFromEnvironment()
): SummerBottleneckDependencies {
  assertDedicatedSecurity(security);
  return {
    store,
    now: () => new Date(),
    receiptSigningKey: security.receiptSigningKey,
    receiptSigningKeyId: security.receiptSigningKeyId,
    producerVerificationKeys: security.producerVerificationKeys,
    async dispatchToSymphony(task: SymphonyRepairTask, { idempotencyKey }) {
      const parsedTask = symphonyRepairTaskSchema.safeParse(task);
      if (!parsedTask.success) {
        throw new Error('Symphony repair task is outside the bounded contract');
      }
      if (parsedTask.data.taskKey !== idempotencyKey) {
        throw new Error('Symphony task key does not match idempotency key');
      }
      const outbox = signRecord(
        'jovie.eve.symphony-repair-outbox/v1',
        {
          schema: 'jovie.eve.symphony-repair-outbox/v1',
          destination: 'symphony',
          idempotencyKey,
          status: 'ready',
          task: parsedTask.data,
        },
        security.eveOutboxSigningPrivateKey,
        security.eveOutboxSigningKeyId
      );
      const result = await store.create(taskPath(idempotencyKey), outbox);
      if (result === 'exists') {
        const existing = await store.read(taskPath(idempotencyKey));
        if (
          !existing ||
          canonicalSummerBottleneckRecord(existing) !==
            canonicalSummerBottleneckRecord(outbox)
        ) {
          throw new Error('Symphony outbox conflict');
        }
      }
      return { handle: `symphony:${idempotencyKey}` };
    },
    async observeSymphonyOutcome({ handle, idempotencyKey }) {
      if (handle !== `symphony:${idempotencyKey}`) {
        throw new Error('Symphony handle is not source-bound');
      }
      const outbox = await store.read(taskPath(idempotencyKey));
      if (
        !outbox ||
        outbox.schema !== 'jovie.eve.symphony-repair-outbox/v1' ||
        outbox.destination !== 'symphony' ||
        outbox.idempotencyKey !== idempotencyKey ||
        outbox.status !== 'ready' ||
        !verifyRecord(
          'jovie.eve.symphony-repair-outbox/v1',
          outbox,
          security.eveOutboxVerificationKeys
        )
      ) {
        throw new Error('Symphony outbox is unavailable or unauthenticated');
      }
      const boundTask = outbox.task as SymphonyRepairTask | undefined;
      const outcome = await store.read(outcomePath(idempotencyKey));
      if (!outcome) return { status: 'pending', detail: 'awaiting-symphony' };
      const source = outcome.source as
        | {
            action?: unknown;
            snapshotDigest?: unknown;
            sourceVersion?: unknown;
          }
        | undefined;
      if (
        !boundTask ||
        boundTask.taskKey !== idempotencyKey ||
        outcome.schema !== 'jovie.symphony-repair-outcome/v1' ||
        outcome.taskKey !== idempotencyKey ||
        !['succeeded', 'failed'].includes(String(outcome.status)) ||
        typeof outcome.detail !== 'string' ||
        outcome.detail.length === 0 ||
        outcome.detail.length > 240 ||
        typeof outcome.completedAt !== 'string' ||
        !Number.isFinite(Date.parse(outcome.completedAt)) ||
        Date.parse(outcome.completedAt) < Date.parse(boundTask.createdAt) ||
        source?.sourceVersion !== boundTask.source.sourceVersion ||
        source.snapshotDigest !== boundTask.source.snapshotDigest ||
        source.action !== boundTask.action ||
        !verifyRecord(
          'jovie.symphony-repair-outcome/v1',
          outcome,
          security.symphonyOutcomeVerificationKeys
        )
      ) {
        throw new Error(
          'Symphony outcome is malformed, unauthenticated, or cross-bound'
        );
      }
      return {
        status: outcome.status as 'succeeded' | 'failed',
        detail: outcome.detail,
      };
    },
  };
}
