import 'server-only';

import {
  type CertificationRecordBackend,
  CERTIFICATION_CAS_ATTEMPTS as MAX_COMPARE_AND_SET_ATTEMPTS,
  mutateCertificationRecord,
  CERTIFICATION_PERSISTENCE_TTL_SECONDS as PERSISTENCE_TTL_SECONDS,
} from './certification-cas';

/**
 * Persistence for the JOV-6944 Design CI judge matrix. One key, one ledger,
 * same CAS mechanics as `MarketingCertificationStore` — reuses
 * `jovie.certification/v1`'s generic persistence primitive
 * (`mutateCertificationRecord`/`CertificationRecordBackend`), not a
 * parallel store.
 *
 * Deliberately does not wrap cells in the marketing-shaped
 * `CertificationReviewPacket`/`evaluateCertificationAdmission` ceremony:
 * that layer encodes founder review-readiness admission (taste tiers,
 * canonical references, required variants) for a specific business
 * process this router does not need yet. A judge-routing cell is a
 * simpler fact — which judge, what state, what evidence — so it is
 * persisted directly. If/when a `human`-routed cell needs to enter
 * founder review, that composes with JOV-6927's promotion court rather
 * than living inside this store.
 */

export const DESIGN_CI_JUDGE_CONTRACT = 'jovie.certification/v1' as const;
export const DESIGN_CI_JUDGE_STORE_KEY =
  'jovie:certification:v1:design-ci-judge-matrix' as const;
export const DESIGN_CI_JUDGE_LEDGER_SCHEMA_VERSION = 1 as const;

export type DesignCiJudgeRoute =
  | 'deterministic'
  | 'jev'
  | 'visual'
  | 'human'
  | 'insufficient';

export type DesignCiJudgeCellState = 'pass' | 'fail' | 'insufficient';

export interface DesignCiJudgeCellInput {
  readonly cellId: string;
  readonly rowId: string;
  readonly unitId: string;
  readonly route: DesignCiJudgeRoute;
  readonly state: DesignCiJudgeCellState;
  readonly evidence: readonly string[];
  readonly artifactHash: string;
  readonly rubricFingerprint: string;
  /** Compared against the stored value to skip an unchanged cell. */
  readonly inputFingerprint: string;
}

export interface DesignCiJudgeCellRecord extends DesignCiJudgeCellInput {
  readonly firstRecordedAt: string;
  readonly updatedAt: string;
}

interface DesignCiJudgeLedger {
  readonly schemaVersion: typeof DESIGN_CI_JUDGE_LEDGER_SCHEMA_VERSION;
  readonly contract: typeof DESIGN_CI_JUDGE_CONTRACT;
  readonly cells: Readonly<Record<string, DesignCiJudgeCellRecord>>;
}

export interface UpsertDesignCiJudgeCellsResult {
  readonly written: readonly string[];
  readonly skippedUnchanged: readonly string[];
}

export class DesignCiJudgeCertificationPersistenceError extends Error {}

const JUDGE_ROUTES = new Set<DesignCiJudgeRoute>([
  'deterministic',
  'jev',
  'visual',
  'human',
  'insufficient',
]);
const CELL_STATES = new Set<DesignCiJudgeCellState>([
  'pass',
  'fail',
  'insufficient',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isCellRecord(value: unknown): value is DesignCiJudgeCellRecord {
  return (
    isRecord(value) &&
    typeof value.cellId === 'string' &&
    typeof value.rowId === 'string' &&
    typeof value.unitId === 'string' &&
    typeof value.route === 'string' &&
    JUDGE_ROUTES.has(value.route as DesignCiJudgeRoute) &&
    typeof value.state === 'string' &&
    CELL_STATES.has(value.state as DesignCiJudgeCellState) &&
    isStringArray(value.evidence) &&
    typeof value.artifactHash === 'string' &&
    typeof value.rubricFingerprint === 'string' &&
    typeof value.inputFingerprint === 'string' &&
    typeof value.firstRecordedAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

function initialLedger(): DesignCiJudgeLedger {
  return {
    schemaVersion: DESIGN_CI_JUDGE_LEDGER_SCHEMA_VERSION,
    contract: DESIGN_CI_JUDGE_CONTRACT,
    cells: {},
  };
}

function parseLedger(raw: unknown): DesignCiJudgeLedger {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (
    !isRecord(value) ||
    value.schemaVersion !== DESIGN_CI_JUDGE_LEDGER_SCHEMA_VERSION ||
    value.contract !== DESIGN_CI_JUDGE_CONTRACT ||
    !isRecord(value.cells) ||
    !Object.values(value.cells).every(isCellRecord)
  ) {
    throw new DesignCiJudgeCertificationPersistenceError(
      'Design CI judge ledger is malformed or has an unexpected schema version.'
    );
  }
  return value as unknown as DesignCiJudgeLedger;
}

function serializeLedger(ledger: DesignCiJudgeLedger): string {
  return JSON.stringify(ledger);
}

export class DesignCiJudgeCertificationStore {
  constructor(private readonly backend: CertificationRecordBackend) {}

  private async ensureLedger(): Promise<DesignCiJudgeLedger> {
    for (
      let attempt = 0;
      attempt < MAX_COMPARE_AND_SET_ATTEMPTS;
      attempt += 1
    ) {
      const raw = await this.backend.get(DESIGN_CI_JUDGE_STORE_KEY);
      if (raw !== null && raw !== undefined) return parseLedger(raw);
      const ledger = initialLedger();
      const inserted = await this.backend.setIfAbsent(
        DESIGN_CI_JUDGE_STORE_KEY,
        serializeLedger(ledger),
        PERSISTENCE_TTL_SECONDS
      );
      if (inserted) return ledger;
    }
    throw new DesignCiJudgeCertificationPersistenceError(
      'Design CI judge ledger initialization lost compare-and-set repeatedly.'
    );
  }

  /**
   * Upserts a batch of cells. A cell whose `inputFingerprint` matches the
   * already-persisted record is left untouched and reported as
   * `skippedUnchanged` — the store owns this decision, not the caller, so
   * "skip unless changed" holds even when multiple producers race.
   */
  async upsertCells(
    inputs: readonly DesignCiJudgeCellInput[],
    evaluatedAt = new Date().toISOString()
  ): Promise<UpsertDesignCiJudgeCellsResult> {
    return mutateCertificationRecord({
      backend: this.backend,
      key: DESIGN_CI_JUDGE_STORE_KEY,
      initialize: () => this.ensureLedger(),
      parse: parseLedger,
      validate: () => {
        /* parseLedger already threw on anything malformed. */
      },
      update: ledger => {
        const written: string[] = [];
        const skippedUnchanged: string[] = [];
        const nextCells = { ...ledger.cells };
        for (const input of inputs) {
          const existing = nextCells[input.cellId];
          if (
            existing &&
            existing.inputFingerprint === input.inputFingerprint
          ) {
            skippedUnchanged.push(input.cellId);
            continue;
          }
          nextCells[input.cellId] = {
            ...input,
            firstRecordedAt: existing?.firstRecordedAt ?? evaluatedAt,
            updatedAt: evaluatedAt,
          };
          written.push(input.cellId);
        }
        if (written.length === 0) {
          return { ledger, result: { written, skippedUnchanged } };
        }
        return {
          ledger: { ...ledger, cells: nextCells },
          result: { written, skippedUnchanged },
        };
      },
      error: message => new DesignCiJudgeCertificationPersistenceError(message),
    });
  }

  async readCell(cellId: string): Promise<DesignCiJudgeCellRecord | null> {
    const raw = await this.backend.get(DESIGN_CI_JUDGE_STORE_KEY);
    if (raw === null || raw === undefined) return null;
    return parseLedger(raw).cells[cellId] ?? null;
  }

  async readAllCells(): Promise<readonly DesignCiJudgeCellRecord[]> {
    const raw = await this.backend.get(DESIGN_CI_JUDGE_STORE_KEY);
    if (raw === null || raw === undefined) return [];
    return Object.values(parseLedger(raw).cells);
  }
}
