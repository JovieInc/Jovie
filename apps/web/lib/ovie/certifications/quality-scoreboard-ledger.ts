import {
  CERTIFICATION_PERSISTENCE_TTL_SECONDS,
  type CertificationRecordBackend,
  mutateCertificationRecord,
} from '@/lib/agent-os/certification-cas';
import {
  isQualityOutcomeReceipt,
  type QualityOutcomeReceipt,
} from './quality-scoreboard';

export const QUALITY_SCOREBOARD_LEDGER_CONTRACT =
  'jovie.quality-scoreboard-ledger/v1' as const;
export const QUALITY_SCOREBOARD_LEDGER_KEY =
  'jovie:certification:v1:quality-scoreboard' as const;
const QUALITY_SCOREBOARD_LEDGER_SCHEMA_VERSION = 1 as const;

export interface QualityScoreboardLedger {
  readonly schemaVersion: typeof QUALITY_SCOREBOARD_LEDGER_SCHEMA_VERSION;
  readonly contract: typeof QUALITY_SCOREBOARD_LEDGER_CONTRACT;
  readonly receipts: Readonly<Record<string, QualityOutcomeReceipt>>;
  readonly updatedAt: string;
}

export class QualityScoreboardPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QualityScoreboardPersistenceError';
  }
}

function emptyLedger(updatedAt: string): QualityScoreboardLedger {
  return {
    schemaVersion: QUALITY_SCOREBOARD_LEDGER_SCHEMA_VERSION,
    contract: QUALITY_SCOREBOARD_LEDGER_CONTRACT,
    receipts: {},
    updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseQualityScoreboardLedger(
  raw: unknown
): QualityScoreboardLedger {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new QualityScoreboardPersistenceError(
        'Quality scoreboard ledger is not valid JSON.'
      );
    }
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== QUALITY_SCOREBOARD_LEDGER_SCHEMA_VERSION ||
    value.contract !== QUALITY_SCOREBOARD_LEDGER_CONTRACT ||
    !isRecord(value.receipts) ||
    typeof value.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(value.updatedAt))
  ) {
    throw new QualityScoreboardPersistenceError(
      'Quality scoreboard ledger has an unexpected shape.'
    );
  }
  for (const [id, receipt] of Object.entries(value.receipts)) {
    if (!isQualityOutcomeReceipt(receipt) || receipt.id !== id) {
      throw new QualityScoreboardPersistenceError(
        `Quality scoreboard receipt ${id} is invalid.`
      );
    }
  }
  return value as unknown as QualityScoreboardLedger;
}

/** A missing ledger is disconnected evidence, never a measured zero. */
export async function readQualityScoreboardLedger(
  backend: CertificationRecordBackend
): Promise<QualityScoreboardLedger | null> {
  const raw = await backend.get(QUALITY_SCOREBOARD_LEDGER_KEY);
  return raw === null || raw === undefined
    ? null
    : parseQualityScoreboardLedger(raw);
}

export async function recordQualityOutcomeReceipt(input: {
  readonly backend: CertificationRecordBackend;
  readonly receipt: QualityOutcomeReceipt;
  readonly recordedAt?: string;
}): Promise<{ readonly status: 'recorded' | 'replayed' }> {
  if (!isQualityOutcomeReceipt(input.receipt)) {
    throw new QualityScoreboardPersistenceError(
      'Quality outcome receipt is invalid.'
    );
  }
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const key = QUALITY_SCOREBOARD_LEDGER_KEY;
  return mutateCertificationRecord<
    QualityScoreboardLedger,
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
    parse: parseQualityScoreboardLedger,
    validate: parseQualityScoreboardLedger,
    error: message => new QualityScoreboardPersistenceError(message),
    update: ledger => {
      const existing = ledger.receipts[input.receipt.id];
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(input.receipt)) {
          throw new QualityScoreboardPersistenceError(
            `Quality outcome receipt ${input.receipt.id} is immutable.`
          );
        }
        return { ledger, result: { status: 'replayed' } };
      }
      if (input.receipt.kind === 'founder_rescue') {
        const failure = ledger.receipts[input.receipt.linkedFailureReceiptId];
        if (
          !failure ||
          (failure.kind !== 'autonomous_resolution' &&
            failure.kind !== 'quality_escape') ||
          failure.failureClass !== input.receipt.failureClass ||
          failure.affectedSurface !== input.receipt.affectedSurface
        ) {
          throw new QualityScoreboardPersistenceError(
            `Founder rescue ${input.receipt.id} must bind its exact failure receipt.`
          );
        }
      }
      return {
        ledger: {
          ...ledger,
          receipts: { ...ledger.receipts, [input.receipt.id]: input.receipt },
          updatedAt: recordedAt,
        },
        result: { status: 'recorded' },
      };
    },
  });
}
