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

function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function exactKeys(value: unknown, keys: readonly string[]): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === [...keys].sort().join('\0')
  );
}

const SOURCE_EVALUATION_KEYS = `
  schema taskKey taskSelectionDigest sourceVersion snapshotDigest targetDigest
  identifier issueId repository pr baseHead finalHead targetObserved observedIssueId
  observedIssueRevision observedPrNumber observedPrHead observedRepository
  prMergeStateStatus mergeable workerAttested selectedEvidence taskResolved reason digest
`
  .trim()
  .split(/\s+/u);
const VERIFICATION_KEYS =
  'schema claimRecorded acceptanceRecorded runStarted runTerminal resultPersisted leaseHeld workspaceBound headObserved headChanged taskAccepted'.split(
    ' '
  );
const SOURCE_EVALUATION_REASONS = new Set(
  'target-observation-unavailable target-identity-mismatch head-unchanged task-check-unresolved task-check-evidence-unavailable task-check-passed'.split(
    ' '
  )
);
const EXECUTION_KEYS = `
  runId provider model authPoolIdentity leaseIdentity evidenceDigest assignmentDigest
  providerGrantDigest acceptanceDigest runDigest taskAcceptanceDigest baseHead
  finalHead outputDigest sourceEvaluation verification
`
  .trim()
  .split(/\s+/u);
const DIGEST_KEYS =
  'authPoolIdentity leaseIdentity evidenceDigest assignmentDigest providerGrantDigest acceptanceDigest runDigest taskAcceptanceDigest outputDigest'.split(
    ' '
  );
const OUTBOX_V3_KEYS = `
  schema destination idempotencyKey status task signatureKeyId signature
`
  .trim()
  .split(/\s+/u);
const OUTCOME_V3_KEYS = `
  schema taskKey decisionFingerprint status detail completedAt source
  existingRepair execution signatureKeyId signature
`
  .trim()
  .split(/\s+/u);
const VERIFIED_EXECUTION_STEPS =
  'claimRecorded acceptanceRecorded runStarted runTerminal resultPersisted leaseHeld workspaceBound headObserved'.split(
    ' '
  );

function sourceEvaluationDigest(evaluation: SummerBottleneckRecord): string {
  const { digest: _digest, ...unsigned } = evaluation;
  return digest({
    schema: 'symphony-existing-repair-source-evaluation/v1',
    ...unsigned,
  });
}

function taskAcceptanceDigest(
  task: SymphonyRepairTask & { schema: 'jovie-symphony-repair-task/v3' }
): string {
  return digest({
    schema: 'symphony-existing-repair-task-acceptance/v1',
    taskKey: task.taskKey,
    assignmentDigest: task.existingRepair.assignmentDigest,
    existingRepair: task.existingRepair,
  });
}

function taskSelectionDigest(
  task: SymphonyRepairTask & { schema: 'jovie-symphony-repair-task/v3' }
): string {
  return digest({
    taskKey: task.taskKey,
    action: task.action,
    selected: task.selected,
    source: task.source,
  });
}

function selectedEvidenceShapeValid(value: unknown): boolean {
  if (value === null) return true;
  if (
    !exactKeys(value, ['id', 'handle', 'check', 'result', 'source']) ||
    typeof value !== 'object'
  )
    return false;
  const evidence = value as Record<string, unknown>;
  return (
    typeof evidence.id === 'string' &&
    typeof evidence.handle === 'string' &&
    typeof evidence.check === 'string' &&
    evidence.result === 'SUCCESS' &&
    evidence.source === 'github-status-check-rollup'
  );
}

function selectedEvidenceValid(
  value: unknown,
  task: SymphonyRepairTask & { schema: 'jovie-symphony-repair-task/v3' }
): boolean {
  if (!selectedEvidenceShapeValid(value) || value === null) return false;
  const evidence = value as Record<string, unknown>;
  return (
    evidence.id === task.selected.id &&
    evidence.handle === task.selected.handle &&
    (evidence.check === task.selected.id ||
      evidence.check === task.selected.handle)
  );
}

function validateExecutionOutcomeV3(
  outcome: SummerBottleneckRecord,
  task: SymphonyRepairTask & { schema: 'jovie-symphony-repair-task/v3' },
  keys: ReadonlyMap<string, string>
): void {
  const source = outcome.source as SummerBottleneckRecord;
  const target = outcome.existingRepair as SummerBottleneckRecord;
  const execution = outcome.execution as SummerBottleneckRecord;
  const evaluation = execution?.sourceEvaluation as SummerBottleneckRecord;
  const verification = execution?.verification as SummerBottleneckRecord;
  const evalRecord = evaluation as Record<string, unknown>;
  const execRecord = execution as Record<string, unknown>;
  const verifyRecordValue = verification as Record<string, unknown>;
  const selectedEvidence = evalRecord?.selectedEvidence;
  const targetObserved = evalRecord?.targetObserved === true;
  const sourceTaskResolved =
    targetObserved &&
    evalRecord.finalHead !== evalRecord.baseHead &&
    evalRecord.prMergeStateStatus === 'CLEAN' &&
    evalRecord.mergeable === 'MERGEABLE' &&
    selectedEvidenceValid(selectedEvidence, task);
  const sourceObservationMatches =
    !targetObserved ||
    (evalRecord.observedIssueId === target.issueId &&
      evalRecord.observedIssueRevision === target.issueRevision &&
      evalRecord.observedPrNumber === target.pr &&
      evalRecord.observedPrHead === execRecord.finalHead &&
      evalRecord.observedRepository === target.repository);
  const validStrings = 'runId provider model'
    .split(' ')
    .every(
      key =>
        typeof execRecord?.[key] === 'string' &&
        execRecord[key].length > 0 &&
        execRecord[key].length <= (key === 'provider' ? 64 : 128)
    );
  const validDigests = DIGEST_KEYS.every(
    key =>
      typeof execRecord?.[key] === 'string' &&
      /^[a-f0-9]{64}$/u.test(execRecord[key] as string)
  );
  const sourceEvaluationValid =
    exactKeys(evaluation, SOURCE_EVALUATION_KEYS) &&
    evalRecord.schema === 'symphony-existing-repair-source-evaluation/v1' &&
    evalRecord.taskKey === task.taskKey &&
    evalRecord.taskSelectionDigest === taskSelectionDigest(task) &&
    evalRecord.sourceVersion === source.sourceVersion &&
    evalRecord.snapshotDigest === source.snapshotDigest &&
    evalRecord.targetDigest === digest(target) &&
    evalRecord.identifier === target.identifier &&
    evalRecord.issueId === target.issueId &&
    evalRecord.repository === target.repository &&
    evalRecord.pr === target.pr &&
    evalRecord.baseHead === execRecord.baseHead &&
    evalRecord.finalHead === execRecord.finalHead &&
    typeof evalRecord.targetObserved === 'boolean' &&
    typeof evalRecord.workerAttested === 'boolean' &&
    selectedEvidenceShapeValid(selectedEvidence) &&
    typeof evalRecord.taskResolved === 'boolean' &&
    SOURCE_EVALUATION_REASONS.has(String(evalRecord.reason)) &&
    evalRecord.digest === sourceEvaluationDigest(evaluation) &&
    sourceObservationMatches &&
    (!evalRecord.taskResolved || evalRecord.reason === 'task-check-passed') &&
    evalRecord.taskResolved === sourceTaskResolved;
  const verificationValid =
    exactKeys(verification, VERIFICATION_KEYS) &&
    verifyRecordValue.schema === 'symphony-existing-repair-evidence/v1' &&
    VERIFIED_EXECUTION_STEPS.every(key => verifyRecordValue[key] === true) &&
    typeof verifyRecordValue.headChanged === 'boolean' &&
    typeof verifyRecordValue.taskAccepted === 'boolean' &&
    verifyRecordValue.headChanged ===
      (execRecord.baseHead !== execRecord.finalHead) &&
    verifyRecordValue.taskAccepted ===
      (evalRecord.workerAttested === true && evalRecord.taskResolved === true);
  if (
    !exactKeys(execution, EXECUTION_KEYS) ||
    !validStrings ||
    execRecord.provider === 'codex' ||
    !validDigests ||
    execRecord.assignmentDigest !== target.assignmentDigest ||
    execRecord.baseHead !== target.head ||
    !/^[a-f0-9]{40}$/u.test(String(execRecord.baseHead)) ||
    !/^[a-f0-9]{40}$/u.test(String(execRecord.finalHead)) ||
    execRecord.taskAcceptanceDigest !== taskAcceptanceDigest(task) ||
    !sourceEvaluationValid ||
    !verificationValid ||
    (outcome.status === 'succeeded' &&
      (verifyRecordValue.headChanged !== true ||
        verifyRecordValue.taskAccepted !== true))
  ) {
    throw new Error(
      'Symphony outcome execution evidence is invalid or cross-bound'
    );
  }
  const { evidenceDigest: _evidenceDigest, ...unsignedExecution } = execution;
  if (
    digest({
      schema: 'symphony-existing-repair-evidence/v1',
      ...unsignedExecution,
    }) !== execRecord.evidenceDigest
  ) {
    throw new Error('Symphony outcome execution evidence digest is invalid');
  }
  if (!verifyRecord('jovie.symphony-repair-outcome/v3', outcome, keys)) {
    throw new Error('Symphony outcome signature is invalid');
  }
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
    Buffer.from(`${domain}\0${canonical(unsigned)}`),
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
    Buffer.from(`${domain}\0${canonical(unsigned)}`),
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
  const domain =
    record.schema === 'jovie.symphony-repair-outcome/v3'
      ? 'jovie.symphony-repair-outcome/v3'
      : 'jovie.symphony-repair-outcome/v1';
  return signRecord(domain, record, privateKey, keyId);
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
      if (parsedTask.data.schema !== 'jovie-symphony-repair-task/v3') {
        throw new Error('historical v1 tasks remain held');
      }
      const outboxSchema = 'jovie.eve.symphony-repair-outbox/v3';
      const outbox = signRecord(
        outboxSchema,
        {
          schema: outboxSchema,
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
      const outbox = await store.read(taskPath(idempotencyKey));
      if (
        outbox?.schema === 'jovie.eve.symphony-repair-outbox/v1' &&
        outbox.destination === 'symphony' &&
        outbox.idempotencyKey === idempotencyKey &&
        outbox.status === 'ready' &&
        verifyRecord(
          'jovie.eve.symphony-repair-outbox/v1',
          outbox,
          security.eveOutboxVerificationKeys
        )
      ) {
        return { status: 'pending', detail: 'historical-v1-outbox-held' };
      }
      if (
        !outbox ||
        !exactKeys(outbox, OUTBOX_V3_KEYS) ||
        outbox.schema !== 'jovie.eve.symphony-repair-outbox/v3' ||
        outbox.destination !== 'symphony' ||
        outbox.idempotencyKey !== idempotencyKey ||
        outbox.status !== 'ready' ||
        !verifyRecord(
          'jovie.eve.symphony-repair-outbox/v3',
          outbox,
          security.eveOutboxVerificationKeys
        )
      ) {
        throw new Error('Symphony outbox is unavailable or unauthenticated');
      }
      const boundTask = outbox.task as SymphonyRepairTask | undefined;
      if (
        !boundTask ||
        boundTask.schema !== 'jovie-symphony-repair-task/v3' ||
        !symphonyRepairTaskSchema.safeParse(boundTask).success
      ) {
        throw new Error('Symphony outbox task is malformed or not v3');
      }
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
        boundTask.taskKey !== idempotencyKey ||
        !exactKeys(outcome, OUTCOME_V3_KEYS) ||
        outcome.schema !== 'jovie.symphony-repair-outcome/v3' ||
        outcome.taskKey !== idempotencyKey ||
        outcome.decisionFingerprint !== boundTask.decisionFingerprint ||
        !['succeeded', 'failed'].includes(String(outcome.status)) ||
        typeof outcome.detail !== 'string' ||
        outcome.detail.length === 0 ||
        outcome.detail.length > 240 ||
        typeof outcome.completedAt !== 'string' ||
        !Number.isFinite(Date.parse(outcome.completedAt)) ||
        Date.parse(outcome.completedAt) < Date.parse(boundTask.createdAt) ||
        typeof outcome.signatureKeyId !== 'string' ||
        !KEY_ID.test(outcome.signatureKeyId) ||
        typeof outcome.signature !== 'string' ||
        !/^ed25519=[A-Za-z0-9_-]{86}$/u.test(outcome.signature) ||
        canonical(source) !==
          canonical({ ...boundTask.source, action: boundTask.action }) ||
        canonical(outcome.existingRepair) !==
          canonical(boundTask.existingRepair)
      ) {
        throw new Error(
          'Symphony outcome is malformed, unauthenticated, or cross-bound'
        );
      }
      validateExecutionOutcomeV3(
        outcome,
        boundTask as SymphonyRepairTask & {
          schema: 'jovie-symphony-repair-task/v3';
        },
        security.symphonyOutcomeVerificationKeys
      );
      return {
        status: outcome.status as 'succeeded' | 'failed',
        detail: outcome.detail,
        terminalOutcome: outcome,
      };
    },
  };
}
