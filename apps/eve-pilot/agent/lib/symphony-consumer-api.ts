import { createHash, verify as nodeVerify } from 'node:crypto';
import { z } from 'zod';
import type {
  SummerBottleneckRecord,
  SummerBottleneckStore,
  SymphonyRepairTask,
} from './summer-bottleneck-loop';
import { symphonyRepairTaskSchema } from './summer-bottleneck-loop';
import {
  canonicalSummerBottleneckRecord,
  createVercelBlobBottleneckStore,
  type SummerBottleneckRuntimeSecurity,
  summerBottleneckSecurityFromEnvironment,
} from './vercel-blob-bottleneck-runtime';

const REQUEST_DOMAIN = 'jovie.symphony-consumer-request/v1';
const OUTBOX_DOMAIN = 'jovie.eve.symphony-repair-outbox/v1';
const OUTCOME_DOMAIN = 'jovie.symphony-repair-outcome/v1';
const OUTBOX_PREFIX = 'summer-bottleneck/symphony-outbox/';
const CLAIM_PREFIX = 'summer-bottleneck/symphony-claims/';
const TERMINAL_PREFIX = 'summer-bottleneck/symphony-terminal/';
const MAX_CLOCK_SKEW_MS = 60_000;
const MAX_SCAN = 100;
const DIGEST = /^[0-9a-f]{64}$/u;
const SIGNATURE = /^ed25519=[A-Za-z0-9_-]{80,100}$/u;

const outcomeSchema = z
  .object({
    schema: z.literal('jovie.symphony-repair-outcome/v1'),
    taskKey: z.string().regex(DIGEST),
    status: z.enum(['succeeded', 'failed']),
    detail: z.string().min(1).max(240),
    completedAt: z.string().datetime({ offset: true }),
    source: z
      .object({
        action: z.enum([
          'reconcile-release-certification-starvation',
          'remediate-selected-ci-audit-class',
        ]),
        sourceVersion: z.string().regex(/^[0-9a-f]{40}$/u),
        snapshotDigest: z.string().regex(DIGEST),
      })
      .strict(),
    signatureKeyId: z.string().min(3).max(64),
    signature: z.string().regex(SIGNATURE),
  })
  .strict();

export type SymphonyConsumerApiRuntime = {
  readonly now: () => Date;
  readonly security: SummerBottleneckRuntimeSecurity;
  readonly store: SummerBottleneckStore;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function verifyRecord(
  domain: string,
  record: SummerBottleneckRecord,
  keys: ReadonlyMap<string, string>
): boolean {
  const keyId = record.signatureKeyId;
  const signature = record.signature;
  if (
    typeof keyId !== 'string' ||
    typeof signature !== 'string' ||
    !SIGNATURE.test(signature)
  ) {
    return false;
  }
  const key = keys.get(keyId);
  if (!key) return false;
  const { signature: _signature, ...unsigned } = record;
  return nodeVerify(
    null,
    Buffer.from(`${domain}\0${canonicalSummerBottleneckRecord(unsigned)}`),
    key,
    Buffer.from(signature.slice('ed25519='.length), 'base64url')
  );
}

function taskKeyFromPath(pathname: string): string | null {
  if (!pathname.startsWith(OUTBOX_PREFIX) || !pathname.endsWith('.json')) {
    return null;
  }
  const key = pathname.slice(OUTBOX_PREFIX.length, -'.json'.length);
  return DIGEST.test(key) ? key : null;
}

function verifiedOutboxTask(
  runtime: SymphonyConsumerApiRuntime,
  taskKey: string,
  outbox: SummerBottleneckRecord | null
): SymphonyRepairTask | null {
  if (
    !outbox ||
    outbox.schema !== OUTBOX_DOMAIN ||
    outbox.destination !== 'symphony' ||
    outbox.idempotencyKey !== taskKey ||
    outbox.status !== 'ready' ||
    !verifyRecord(
      OUTBOX_DOMAIN,
      outbox,
      runtime.security.eveOutboxVerificationKeys
    )
  ) {
    return null;
  }
  const task = symphonyRepairTaskSchema.safeParse(outbox.task);
  return task.success && task.data.taskKey === taskKey ? task.data : null;
}

function requestSigningPayload(
  request: Request,
  timestamp: string,
  body: string
) {
  const url = new URL(request.url);
  return {
    bodySha256: sha256(body),
    method: request.method.toUpperCase(),
    pathname: url.pathname,
    timestamp,
  };
}

export function verifySymphonyConsumerRequest(
  request: Request,
  body: string,
  runtime: SymphonyConsumerApiRuntime
): string | null {
  const keyId = request.headers.get('x-symphony-key-id');
  const timestamp = request.headers.get('x-symphony-timestamp');
  const signature = request.headers.get('x-symphony-signature');
  if (!keyId || !timestamp || !signature || !SIGNATURE.test(signature)) {
    return null;
  }
  const at = Date.parse(timestamp);
  const now = runtime.now().getTime();
  if (!Number.isFinite(at) || Math.abs(now - at) > MAX_CLOCK_SKEW_MS) {
    return null;
  }
  const key = runtime.security.symphonyOutcomeVerificationKeys.get(keyId);
  if (!key) return null;
  const payload = requestSigningPayload(request, timestamp, body);
  const ok = nodeVerify(
    null,
    Buffer.from(
      `${REQUEST_DOMAIN}\0${canonicalSummerBottleneckRecord(payload)}`
    ),
    key,
    Buffer.from(signature.slice('ed25519='.length), 'base64url')
  );
  return ok ? keyId : null;
}

export function createSymphonyConsumerApiRuntime(
  store: SummerBottleneckStore = createVercelBlobBottleneckStore(),
  security = summerBottleneckSecurityFromEnvironment()
): SymphonyConsumerApiRuntime {
  if (!security) throw new Error('Symphony consumer security is unavailable');
  return { now: () => new Date(), security, store };
}

async function existingClaim(
  runtime: SymphonyConsumerApiRuntime,
  claimantKeyId: string
): Promise<string | null> {
  const page = await runtime.store.list(CLAIM_PREFIX, { limit: MAX_SCAN });
  if (page.hasMore) throw new Error('Symphony claim scan limit exceeded');
  const claims = page.entries
    .map(entry => entry.record)
    .filter(record => record.claimantKeyId === claimantKeyId)
    .sort((left, right) =>
      String(left.taskKey).localeCompare(String(right.taskKey))
    );
  for (const claim of claims) {
    const taskKey = claim.taskKey;
    if (
      claim.schema !== 'jovie.eve.symphony-repair-claim/v1' ||
      typeof taskKey !== 'string' ||
      !DIGEST.test(taskKey)
    ) {
      continue;
    }
    const terminal = await runtime.store.read(
      `${TERMINAL_PREFIX}${taskKey}.json`
    );
    if (terminal !== null) continue;
    const outbox = await runtime.store.read(`${OUTBOX_PREFIX}${taskKey}.json`);
    if (verifiedOutboxTask(runtime, taskKey, outbox)) return taskKey;
  }
  return null;
}

export async function claimNextSymphonyTask(
  runtime: SymphonyConsumerApiRuntime,
  claimantKeyId: string
): Promise<SummerBottleneckRecord | null> {
  const recovered = await existingClaim(runtime, claimantKeyId);
  if (recovered) {
    return runtime.store.read(`${OUTBOX_PREFIX}${recovered}.json`);
  }
  const page = await runtime.store.list(OUTBOX_PREFIX, { limit: MAX_SCAN });
  if (page.hasMore) throw new Error('Symphony outbox scan limit exceeded');
  const entries = [...page.entries].sort((left, right) =>
    left.pathname.localeCompare(right.pathname)
  );
  for (const entry of entries) {
    const taskKey = taskKeyFromPath(entry.pathname);
    const outbox = entry.record;
    if (!taskKey || !verifiedOutboxTask(runtime, taskKey, outbox)) {
      continue;
    }
    const terminal = await runtime.store.read(
      `${TERMINAL_PREFIX}${taskKey}.json`
    );
    if (terminal) continue;
    const claimPath = `${CLAIM_PREFIX}${taskKey}.json`;
    const claim = {
      schema: 'jovie.eve.symphony-repair-claim/v1',
      taskKey,
      claimantKeyId,
      claimedAt: runtime.now().toISOString(),
    };
    const created = await runtime.store.create(claimPath, claim);
    if (created === 'created') return outbox;
    const existing = await runtime.store.read(claimPath);
    if (existing?.claimantKeyId === claimantKeyId) return outbox;
  }
  return null;
}

export async function persistSymphonyTerminal(
  runtime: SymphonyConsumerApiRuntime,
  claimantKeyId: string,
  input: unknown
): Promise<'created' | 'exists'> {
  const parsed = outcomeSchema.parse(input);
  if (
    parsed.signatureKeyId !== claimantKeyId ||
    !verifyRecord(
      OUTCOME_DOMAIN,
      parsed as SummerBottleneckRecord,
      runtime.security.symphonyOutcomeVerificationKeys
    )
  ) {
    throw new Error('unauthenticated Symphony terminal');
  }
  const claim = await runtime.store.read(
    `${CLAIM_PREFIX}${parsed.taskKey}.json`
  );
  const outbox = await runtime.store.read(
    `${OUTBOX_PREFIX}${parsed.taskKey}.json`
  );
  const task = verifiedOutboxTask(runtime, parsed.taskKey, outbox);
  if (
    claim?.claimantKeyId !== claimantKeyId ||
    !task ||
    Date.parse(parsed.completedAt) < Date.parse(task.createdAt) ||
    Date.parse(parsed.completedAt) >
      runtime.now().getTime() + MAX_CLOCK_SKEW_MS ||
    parsed.source.action !== task.action ||
    parsed.source.sourceVersion !== task.source.sourceVersion ||
    parsed.source.snapshotDigest !== task.source.snapshotDigest
  ) {
    throw new Error('cross-bound Symphony terminal');
  }
  const path = `${TERMINAL_PREFIX}${parsed.taskKey}.json`;
  const result = await runtime.store.create(path, parsed);
  if (result === 'created') return result;
  const existing = await runtime.store.read(path);
  if (
    existing &&
    canonicalSummerBottleneckRecord(existing) ===
      canonicalSummerBottleneckRecord(parsed)
  ) {
    return 'exists';
  }
  throw new Error('conflicting Symphony terminal');
}
