import {
  CERTIFICATION_PERSISTENCE_TTL_SECONDS,
  type CertificationRecordBackend,
  mutateCertificationRecord,
} from '@/lib/agent-os/certification-cas';
import {
  type DogfoodReceipt,
  isDogfoodReceipt,
  validateDogfoodReceipt,
} from '@/lib/agent-os/dogfood-receipt';

/**
 * Authoritative store for `jovie.dogfood-receipt/v1` inputs that feed the
 * existing section-8 metrics projection (JOV-7200). Same CAS / ovie_operating_kv
 * pattern as the quality scoreboard — no new queue or controller.
 *
 * A missing ledger stays disconnected evidence (metrics report null / empty
 * inputs). A present ledger may bind subjects to a fixture deploy until a
 * production commitSha + deploymentId replaces it.
 */

export const DOGFOOD_RECEIPT_LEDGER_CONTRACT =
  'jovie.dogfood-receipt-ledger/v1' as const;
export const DOGFOOD_RECEIPT_LEDGER_KEY =
  'jovie:certification:v1:dogfood-receipts' as const;
const DOGFOOD_RECEIPT_LEDGER_SCHEMA_VERSION = 1 as const;

export const DOGFOOD_DEPLOY_BINDING_SOURCES = [
  'fixture',
  'production',
] as const;
export type DogfoodDeployBindingSource =
  (typeof DOGFOOD_DEPLOY_BINDING_SOURCES)[number];

export interface DogfoodSubjectDeployBinding {
  readonly commitSha: string;
  readonly deploymentId: string;
  /** fixture = honest seed that can graduate; production = live binding. */
  readonly source: DogfoodDeployBindingSource;
}

export interface DogfoodReceiptLedger {
  readonly schemaVersion: typeof DOGFOOD_RECEIPT_LEDGER_SCHEMA_VERSION;
  readonly contract: typeof DOGFOOD_RECEIPT_LEDGER_CONTRACT;
  readonly receipts: Readonly<Record<string, DogfoodReceipt>>;
  readonly subjectDeploys: Readonly<
    Record<string, DogfoodSubjectDeployBinding>
  >;
  readonly knownGoodDeploymentIds: readonly string[];
  readonly updatedAt: string;
}

export class DogfoodReceiptPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DogfoodReceiptPersistenceError';
  }
}

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function dogfoodReceiptKey(receipt: DogfoodReceipt): string {
  return [
    receipt.subjectId,
    receipt.missionId,
    receipt.completedAt,
    receipt.deploymentId,
    receipt.kind,
    receipt.driver,
    receipt.actor,
  ].join('|');
}

function emptyLedger(updatedAt: string): DogfoodReceiptLedger {
  return {
    schemaVersion: DOGFOOD_RECEIPT_LEDGER_SCHEMA_VERSION,
    contract: DOGFOOD_RECEIPT_LEDGER_CONTRACT,
    receipts: {},
    subjectDeploys: {},
    knownGoodDeploymentIds: [],
    updatedAt,
  };
}

function parseSubjectDeploy(
  value: unknown,
  subjectId: string
): DogfoodSubjectDeployBinding {
  if (
    !isRecord(value) ||
    typeof value.commitSha !== 'string' ||
    !COMMIT_SHA_PATTERN.test(value.commitSha) ||
    typeof value.deploymentId !== 'string' ||
    value.deploymentId.trim().length === 0 ||
    (value.source !== 'fixture' && value.source !== 'production')
  ) {
    throw new DogfoodReceiptPersistenceError(
      `Dogfood subject deploy binding for ${subjectId} is invalid.`
    );
  }
  return {
    commitSha: value.commitSha,
    deploymentId: value.deploymentId,
    source: value.source,
  };
}

export function parseDogfoodReceiptLedger(raw: unknown): DogfoodReceiptLedger {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new DogfoodReceiptPersistenceError(
        'Dogfood receipt ledger is not valid JSON.'
      );
    }
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== DOGFOOD_RECEIPT_LEDGER_SCHEMA_VERSION ||
    value.contract !== DOGFOOD_RECEIPT_LEDGER_CONTRACT ||
    !isRecord(value.receipts) ||
    !isRecord(value.subjectDeploys) ||
    !Array.isArray(value.knownGoodDeploymentIds) ||
    typeof value.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(value.updatedAt))
  ) {
    throw new DogfoodReceiptPersistenceError(
      'Dogfood receipt ledger has an unexpected shape.'
    );
  }

  const receipts: Record<string, DogfoodReceipt> = {};
  for (const [key, receipt] of Object.entries(value.receipts)) {
    if (!isDogfoodReceipt(receipt) || dogfoodReceiptKey(receipt) !== key) {
      throw new DogfoodReceiptPersistenceError(
        `Dogfood receipt ${key} is invalid or key-mismatched.`
      );
    }
    receipts[key] = receipt;
  }

  const subjectDeploys: Record<string, DogfoodSubjectDeployBinding> = {};
  for (const [subjectId, binding] of Object.entries(value.subjectDeploys)) {
    if (subjectId.trim().length === 0) {
      throw new DogfoodReceiptPersistenceError(
        'Dogfood subject deploy keys must be non-empty.'
      );
    }
    subjectDeploys[subjectId] = parseSubjectDeploy(binding, subjectId);
  }

  const knownGoodDeploymentIds: string[] = [];
  for (const id of value.knownGoodDeploymentIds) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new DogfoodReceiptPersistenceError(
        'knownGoodDeploymentIds must be non-empty strings.'
      );
    }
    knownGoodDeploymentIds.push(id);
  }

  return {
    schemaVersion: DOGFOOD_RECEIPT_LEDGER_SCHEMA_VERSION,
    contract: DOGFOOD_RECEIPT_LEDGER_CONTRACT,
    receipts,
    subjectDeploys,
    knownGoodDeploymentIds,
    updatedAt: value.updatedAt,
  };
}

/** A missing ledger is disconnected evidence, never a measured zero. */
export async function readDogfoodReceiptLedger(
  backend: CertificationRecordBackend
): Promise<DogfoodReceiptLedger | null> {
  const raw = await backend.get(DOGFOOD_RECEIPT_LEDGER_KEY);
  return raw === null || raw === undefined
    ? null
    : parseDogfoodReceiptLedger(raw);
}

export async function recordDogfoodReceipt(input: {
  readonly backend: CertificationRecordBackend;
  readonly receipt: DogfoodReceipt;
  readonly recordedAt?: string;
}): Promise<{ readonly status: 'recorded' | 'replayed' }> {
  const errors = validateDogfoodReceipt(input.receipt);
  if (errors.length > 0) {
    throw new DogfoodReceiptPersistenceError(
      `Dogfood receipt is invalid: ${errors.join('; ')}`
    );
  }
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const key = DOGFOOD_RECEIPT_LEDGER_KEY;
  const receiptKey = dogfoodReceiptKey(input.receipt);
  return mutateCertificationRecord<
    DogfoodReceiptLedger,
    { readonly status: 'recorded' | 'replayed' }
  >({
    backend: input.backend,
    key,
    initialize: () =>
      input.backend.setIfAbsent(
        key,
        JSON.stringify(emptyLedger(recordedAt)),
        CERTIFICATION_PERSISTENCE_TTL_SECONDS
      ),
    parse: parseDogfoodReceiptLedger,
    validate: parseDogfoodReceiptLedger,
    error: message => new DogfoodReceiptPersistenceError(message),
    update: ledger => {
      const existing = ledger.receipts[receiptKey];
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(input.receipt)) {
          throw new DogfoodReceiptPersistenceError(
            `Dogfood receipt ${receiptKey} is immutable.`
          );
        }
        return { ledger, result: { status: 'replayed' } };
      }
      return {
        ledger: {
          ...ledger,
          receipts: { ...ledger.receipts, [receiptKey]: input.receipt },
          updatedAt: recordedAt,
        },
        result: { status: 'recorded' },
      };
    },
  });
}

export async function bindDogfoodSubjectDeploy(input: {
  readonly backend: CertificationRecordBackend;
  readonly subjectId: string;
  readonly binding: DogfoodSubjectDeployBinding;
  readonly recordedAt?: string;
}): Promise<{ readonly status: 'recorded' | 'replayed' }> {
  if (input.subjectId.trim().length === 0) {
    throw new DogfoodReceiptPersistenceError('subjectId must be non-empty.');
  }
  parseSubjectDeploy(input.binding, input.subjectId);
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const key = DOGFOOD_RECEIPT_LEDGER_KEY;
  return mutateCertificationRecord<
    DogfoodReceiptLedger,
    { readonly status: 'recorded' | 'replayed' }
  >({
    backend: input.backend,
    key,
    initialize: () =>
      input.backend.setIfAbsent(
        key,
        JSON.stringify(emptyLedger(recordedAt)),
        CERTIFICATION_PERSISTENCE_TTL_SECONDS
      ),
    parse: parseDogfoodReceiptLedger,
    validate: parseDogfoodReceiptLedger,
    error: message => new DogfoodReceiptPersistenceError(message),
    update: ledger => {
      const existing = ledger.subjectDeploys[input.subjectId];
      if (
        existing &&
        existing.commitSha === input.binding.commitSha &&
        existing.deploymentId === input.binding.deploymentId &&
        existing.source === input.binding.source
      ) {
        return { ledger, result: { status: 'replayed' } };
      }
      const knownGood = new Set(ledger.knownGoodDeploymentIds);
      knownGood.add(input.binding.deploymentId);
      return {
        ledger: {
          ...ledger,
          subjectDeploys: {
            ...ledger.subjectDeploys,
            [input.subjectId]: input.binding,
          },
          knownGoodDeploymentIds: [...knownGood].sort(),
          updatedAt: recordedAt,
        },
        result: { status: 'recorded' },
      };
    },
  });
}

export function dogfoodFeedStatus(ledger: DogfoodReceiptLedger | null): {
  readonly status: 'disconnected' | 'fixture' | 'production';
  readonly receiptCount: number;
  readonly subjectsWithDeploy: number;
  readonly knownGoodDeploymentCount: number;
} {
  if (!ledger) {
    return {
      status: 'disconnected',
      receiptCount: 0,
      subjectsWithDeploy: 0,
      knownGoodDeploymentCount: 0,
    };
  }
  const sources = Object.values(ledger.subjectDeploys).map(
    binding => binding.source
  );
  let status: 'disconnected' | 'fixture' | 'production' = 'disconnected';
  if (sources.includes('production')) {
    status = 'production';
  } else if (sources.length > 0 || Object.keys(ledger.receipts).length > 0) {
    status = 'fixture';
  }
  return {
    status,
    receiptCount: Object.keys(ledger.receipts).length,
    subjectsWithDeploy: Object.keys(ledger.subjectDeploys).length,
    knownGoodDeploymentCount: ledger.knownGoodDeploymentIds.length,
  };
}
