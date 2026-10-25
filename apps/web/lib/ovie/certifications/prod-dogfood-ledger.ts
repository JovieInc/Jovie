import {
  CERTIFICATION_PERSISTENCE_TTL_SECONDS,
  type CertificationRecordBackend,
  mutateCertificationRecord,
} from '@/lib/agent-os/certification-cas';
import {
  type DogfoodReceipt,
  validateDogfoodReceipt,
} from '@/lib/agent-os/dogfood-receipt';

/**
 * Authoritative store for the production dogfood agent's certification
 * roll-up (scripts/prod-dogfood.mjs posts it to
 * /api/internal/ovie/dogfood-evidence after each run). One CAS record: the
 * latest run per mission plus a bounded run history. A missing record is
 * disconnected evidence, never a measured zero.
 */

export const PROD_DOGFOOD_LEDGER_CONTRACT =
  'jovie.prod-dogfood-ledger/v1' as const;
export const PROD_DOGFOOD_LEDGER_KEY =
  'jovie:certification:v1:prod-dogfood' as const;
const SCHEMA_VERSION = 1 as const;
export const PROD_DOGFOOD_HISTORY_LIMIT = 200;

export const PROD_DOGFOOD_MISSION_STATUSES = [
  'certified',
  'failing',
  'uncertified:blocked',
  'uncertified:stale-sha',
] as const;
export type ProdDogfoodMissionStatus =
  (typeof PROD_DOGFOOD_MISSION_STATUSES)[number];

export interface ProdDogfoodMission {
  readonly missionId: string;
  readonly subjectId: string;
  readonly product: string;
  readonly title: string;
  readonly status: ProdDogfoodMissionStatus;
  readonly commitSha: string | null;
  readonly deploymentId: string | null;
  readonly completedAt: string | null;
  readonly blocker: string | null;
  readonly owner: string | null;
  readonly lastCertifiedSha: string | null;
}

export interface ProdDogfoodRun {
  readonly generatedAt: string;
  readonly servedSha: string;
  readonly certified: number;
  readonly total: number;
  readonly failing: number;
  readonly runUrl: string | null;
}

export interface ProdDogfoodLedger {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly contract: typeof PROD_DOGFOOD_LEDGER_CONTRACT;
  readonly latest: {
    readonly generatedAt: string;
    readonly servedSha: string;
    readonly missions: readonly ProdDogfoodMission[];
  } | null;
  readonly receipts: Readonly<Record<string, DogfoodReceipt>>;
  readonly history: readonly ProdDogfoodRun[];
  readonly updatedAt: string;
}

export class ProdDogfoodPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProdDogfoodPersistenceError';
  }
}

export interface ProdDogfoodIngest {
  readonly generatedAt: string;
  readonly servedSha: string;
  readonly runUrl?: string | null;
  readonly missions: readonly ProdDogfoodMission[];
  readonly receipts: readonly DogfoodReceipt[];
}

function emptyLedger(updatedAt: string): ProdDogfoodLedger {
  return {
    schemaVersion: SCHEMA_VERSION,
    contract: PROD_DOGFOOD_LEDGER_CONTRACT,
    latest: null,
    receipts: {},
    history: [],
    updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseProdDogfoodLedger(raw: unknown): ProdDogfoodLedger {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new ProdDogfoodPersistenceError(
        'Dogfood ledger is not valid JSON.'
      );
    }
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    value.contract !== PROD_DOGFOOD_LEDGER_CONTRACT ||
    !isRecord(value.receipts) ||
    !Array.isArray(value.history) ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new ProdDogfoodPersistenceError(
      'Dogfood ledger has an unexpected shape.'
    );
  }
  return value as unknown as ProdDogfoodLedger;
}

export async function readProdDogfoodLedger(
  backend: CertificationRecordBackend
): Promise<ProdDogfoodLedger | null> {
  const raw = await backend.get(PROD_DOGFOOD_LEDGER_KEY);
  return raw === null || raw === undefined ? null : parseProdDogfoodLedger(raw);
}

export function validateProdDogfoodIngest(input: ProdDogfoodIngest): string[] {
  const errors: string[] = [];
  for (const receipt of input.receipts) {
    for (const message of validateDogfoodReceipt(receipt)) {
      errors.push(`${receipt.missionId}: ${message}`);
    }
  }
  const ids = new Set(input.receipts.map(r => r.missionId));
  for (const mission of input.missions) {
    if (mission.status === 'certified') {
      if (!ids.has(mission.missionId)) {
        errors.push(`${mission.missionId}: certified without a receipt`);
      }
      const receipt = input.receipts.find(
        r => r.missionId === mission.missionId
      );
      if (
        receipt &&
        (receipt.outcome !== 'passed' || receipt.commitSha !== input.servedSha)
      ) {
        errors.push(
          `${mission.missionId}: certified requires a passed receipt bound to the served sha`
        );
      }
    }
  }
  return errors;
}

/** Records one run. A run older than the stored one is replayed, not applied. */
export async function recordProdDogfoodRun(input: {
  readonly backend: CertificationRecordBackend;
  readonly ingest: ProdDogfoodIngest;
  readonly recordedAt?: string;
}): Promise<{ readonly status: 'recorded' | 'stale' }> {
  const errors = validateProdDogfoodIngest(input.ingest);
  if (errors.length > 0) {
    throw new ProdDogfoodPersistenceError(errors.slice(0, 5).join('; '));
  }
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const { ingest } = input;
  const failing = ingest.missions.filter(m => m.status === 'failing').length;
  const certified = ingest.missions.filter(
    m => m.status === 'certified'
  ).length;
  return mutateCertificationRecord<
    ProdDogfoodLedger,
    { readonly status: 'recorded' | 'stale' }
  >({
    backend: input.backend,
    key: PROD_DOGFOOD_LEDGER_KEY,
    initialize: () =>
      input.backend.setIfAbsent(
        PROD_DOGFOOD_LEDGER_KEY,
        JSON.stringify(emptyLedger(recordedAt)),
        CERTIFICATION_PERSISTENCE_TTL_SECONDS
      ),
    parse: parseProdDogfoodLedger,
    validate: parseProdDogfoodLedger,
    error: message => new ProdDogfoodPersistenceError(message),
    update: ledger => {
      if (
        ledger.latest &&
        Date.parse(ingest.generatedAt) <= Date.parse(ledger.latest.generatedAt)
      ) {
        return { ledger, result: { status: 'stale' } };
      }
      const receipts = { ...ledger.receipts };
      for (const receipt of ingest.receipts)
        receipts[receipt.missionId] = receipt;
      // lastCertifiedSha survives a failing run: carry it from the prior roll-up.
      const prior = new Map(
        (ledger.latest?.missions ?? []).map(m => [
          m.missionId,
          m.lastCertifiedSha,
        ])
      );
      const missions = ingest.missions.map(m => ({
        ...m,
        lastCertifiedSha:
          m.status === 'certified'
            ? m.commitSha
            : (m.lastCertifiedSha ?? prior.get(m.missionId) ?? null),
      }));
      const run: ProdDogfoodRun = {
        generatedAt: ingest.generatedAt,
        servedSha: ingest.servedSha,
        certified,
        total: ingest.missions.length,
        failing,
        runUrl: ingest.runUrl ?? null,
      };
      return {
        ledger: {
          ...ledger,
          latest: {
            generatedAt: ingest.generatedAt,
            servedSha: ingest.servedSha,
            missions,
          },
          receipts,
          history: [...ledger.history, run].slice(-PROD_DOGFOOD_HISTORY_LIMIT),
          updatedAt: recordedAt,
        },
        result: { status: 'recorded' },
      };
    },
  });
}
