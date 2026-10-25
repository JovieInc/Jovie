import {
  CERTIFICATION_PERSISTENCE_TTL_SECONDS,
  type CertificationRecordBackend,
  mutateCertificationRecord,
} from '@/lib/agent-os/certification-cas';

/**
 * Authoritative store for the design-system component certificates
 * (scripts/component-certificate.mjs posts its report to
 * /api/internal/ovie/component-certificate-evidence). One CAS record: the
 * latest report (slimmed to what Ovie renders) plus a bounded history. A
 * missing record is disconnected evidence, never a measured zero.
 */

export const COMPONENT_CERTIFICATE_LEDGER_CONTRACT =
  'jovie.component-certificate-ledger/v1' as const;
export const COMPONENT_CERTIFICATE_LEDGER_KEY =
  'jovie:certification:v1:component-certificates' as const;
export const COMPONENT_CERTIFICATE_REPORT_SCHEMA =
  'jovie.component-certificate-report/v1' as const;
export const COMPONENT_CERTIFICATE_HISTORY_LIMIT = 200;
const SCHEMA_VERSION = 1 as const;

export const CRITERION_STATUSES = ['pass', 'fail', 'unknown', 'na'] as const;
export type CriterionStatus = (typeof CRITERION_STATUSES)[number];
export type CriterionCounts = Record<CriterionStatus, number>;

export interface ComponentCertificateEntry {
  readonly component: string;
  readonly certified: boolean;
  /** Golden-path journeys the component sits on; the ranking key. */
  readonly journeys: readonly string[];
  readonly criteria: readonly {
    readonly id: string;
    readonly status: CriterionStatus;
  }[];
  readonly missing: readonly {
    readonly criterion: string;
    readonly reason: string;
  }[];
}

export interface GuardSummary {
  readonly total: number;
  readonly guardsLanded: number;
  readonly guardCoverage: number | null;
  readonly weeks: Readonly<
    Record<
      string,
      { readonly human: number; readonly guard: number; readonly agent: number }
    >
  >;
}

export interface ComponentCertificateReport {
  readonly schema: typeof COMPONENT_CERTIFICATE_REPORT_SCHEMA;
  readonly generatedAt: string;
  readonly headSha: string;
  readonly totals: {
    readonly components: number;
    readonly certified: number;
    readonly byCriterion: Readonly<Record<string, CriterionCounts>>;
  };
  readonly certificates: readonly ComponentCertificateEntry[];
}

export interface ComponentCertificateRun {
  readonly generatedAt: string;
  readonly headSha: string;
  readonly components: number;
  readonly certified: number;
}

export interface ComponentCertificateLedger {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly contract: typeof COMPONENT_CERTIFICATE_LEDGER_CONTRACT;
  readonly latest: {
    readonly generatedAt: string;
    readonly headSha: string;
    readonly totals: ComponentCertificateReport['totals'];
    readonly certificates: readonly ComponentCertificateEntry[];
    readonly guards: GuardSummary | null;
  } | null;
  readonly history: readonly ComponentCertificateRun[];
  readonly updatedAt: string;
}

export class ComponentCertificatePersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComponentCertificatePersistenceError';
  }
}

export interface ComponentCertificateIngest {
  readonly report: ComponentCertificateReport;
  readonly guards: GuardSummary | null;
}

function emptyLedger(updatedAt: string): ComponentCertificateLedger {
  return {
    schemaVersion: SCHEMA_VERSION,
    contract: COMPONENT_CERTIFICATE_LEDGER_CONTRACT,
    latest: null,
    history: [],
    updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseComponentCertificateLedger(
  raw: unknown
): ComponentCertificateLedger {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new ComponentCertificatePersistenceError(
        'Component certificate ledger is not valid JSON.'
      );
    }
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    value.contract !== COMPONENT_CERTIFICATE_LEDGER_CONTRACT ||
    !Array.isArray(value.history) ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new ComponentCertificatePersistenceError(
      'Component certificate ledger has an unexpected shape.'
    );
  }
  return value as unknown as ComponentCertificateLedger;
}

export async function readComponentCertificateLedger(
  backend: CertificationRecordBackend
): Promise<ComponentCertificateLedger | null> {
  const raw = await backend.get(COMPONENT_CERTIFICATE_LEDGER_KEY);
  return raw === null || raw === undefined
    ? null
    : parseComponentCertificateLedger(raw);
}

/** The report must agree with its own certificates: totals are recomputed, never trusted. */
export function validateComponentCertificateReport(
  report: ComponentCertificateReport
): string[] {
  const errors: string[] = [];
  const { certificates, totals } = report;
  if (totals.components !== certificates.length) {
    errors.push(
      `totals.components ${totals.components} != ${certificates.length} certificates`
    );
  }
  const certified = certificates.filter(c => c.certified).length;
  if (totals.certified !== certified) {
    errors.push(`totals.certified ${totals.certified} != ${certified}`);
  }
  const counts: Record<string, CriterionCounts> = {};
  for (const cert of certificates) {
    const allPass = cert.criteria.every(
      c => c.status === 'pass' || c.status === 'na'
    );
    if (cert.certified !== allPass) {
      errors.push(`${cert.component}: certified disagrees with its criteria`);
    }
    if (cert.certified && cert.missing.length > 0) {
      errors.push(`${cert.component}: certified but lists missing criteria`);
    }
    if (!cert.certified && cert.missing.length === 0) {
      errors.push(`${cert.component}: uncertified without a missing criterion`);
    }
    for (const c of cert.criteria) {
      counts[c.id] ??= { pass: 0, fail: 0, unknown: 0, na: 0 };
      counts[c.id][c.status] += 1;
    }
  }
  for (const [id, expected] of Object.entries(counts)) {
    const got = totals.byCriterion[id];
    const same =
      got !== undefined &&
      CRITERION_STATUSES.every(status => got[status] === expected[status]);
    if (!same)
      errors.push(`totals.byCriterion.${id} disagrees with certificates`);
  }
  return errors;
}

/**
 * Records one report. A report not newer than the stored one is replayed, not
 * applied, so an out-of-order CI job can never regress the ledger; two
 * different head SHAs claiming the same instant are a conflict.
 */
export async function recordComponentCertificateReport(input: {
  readonly backend: CertificationRecordBackend;
  readonly ingest: ComponentCertificateIngest;
  readonly recordedAt?: string;
}): Promise<{ readonly status: 'recorded' | 'stale' }> {
  const { report, guards } = input.ingest;
  const errors = validateComponentCertificateReport(report);
  if (errors.length > 0) {
    throw new ComponentCertificatePersistenceError(
      errors.slice(0, 5).join('; ')
    );
  }
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  return mutateCertificationRecord<
    ComponentCertificateLedger,
    { readonly status: 'recorded' | 'stale' }
  >({
    backend: input.backend,
    key: COMPONENT_CERTIFICATE_LEDGER_KEY,
    initialize: () =>
      input.backend.setIfAbsent(
        COMPONENT_CERTIFICATE_LEDGER_KEY,
        JSON.stringify(emptyLedger(recordedAt)),
        CERTIFICATION_PERSISTENCE_TTL_SECONDS
      ),
    parse: parseComponentCertificateLedger,
    validate: parseComponentCertificateLedger,
    error: message => new ComponentCertificatePersistenceError(message),
    update: ledger => {
      const latest = ledger.latest;
      if (latest) {
        const incoming = Date.parse(report.generatedAt);
        const stored = Date.parse(latest.generatedAt);
        if (incoming === stored && report.headSha !== latest.headSha) {
          throw new ComponentCertificatePersistenceError(
            'A different head SHA already holds this generation time.'
          );
        }
        if (incoming <= stored) return { ledger, result: { status: 'stale' } };
      }
      const run: ComponentCertificateRun = {
        generatedAt: report.generatedAt,
        headSha: report.headSha,
        components: report.totals.components,
        certified: report.totals.certified,
      };
      return {
        ledger: {
          ...ledger,
          latest: {
            generatedAt: report.generatedAt,
            headSha: report.headSha,
            totals: report.totals,
            certificates: report.certificates,
            guards,
          },
          history: [...ledger.history, run].slice(
            -COMPONENT_CERTIFICATE_HISTORY_LIMIT
          ),
          updatedAt: recordedAt,
        },
        result: { status: 'recorded' },
      };
    },
  });
}
