import type { CertificationReviewPacket } from '@/lib/agent-os/certification';
import { JOVIE_CERTIFICATION_CONTRACT } from '@/lib/agent-os/certification';
import {
  CERTIFICATION_PERSISTENCE_TTL_SECONDS,
  type CertificationRecordBackend,
  mutateCertificationRecord,
} from '@/lib/agent-os/certification-cas';
import type { CertificationPacketFile } from './packet-files.server';
import type { OvieCertificationDomainId } from './types';

/**
 * Production golden-path certification ledger (JOV-9625).
 *
 * After every production promotion the post-deploy probes run the golden path
 * against https://jov.ie and post one SHA-bound receipt per surface. This
 * ledger keeps the latest receipt per surface and projects each into a
 * certification packet (runtime_dogfood tier) so the existing Ovie inventory
 * (`/api/ovie/certifications`, `/app/admin/certifications`) shows per-surface
 * production state. A missing ledger is disconnected evidence, never a zero.
 */

export const PROD_GOLDEN_PATH_RECEIPT_SCHEMA =
  'jovie.prod-golden-path-receipt/v1' as const;
export const PROD_GOLDEN_PATH_LEDGER_CONTRACT =
  'jovie.prod-golden-path-ledger/v1' as const;
export const PROD_GOLDEN_PATH_LEDGER_KEY =
  'jovie:certification:v1:prod-golden-path' as const;
const SCHEMA_VERSION = 1 as const;
const HISTORY_LIMIT = 20;

/** Launch order. Each surface maps to the inventory domain that shows it. */
export const PROD_GOLDEN_PATH_SURFACES = {
  landing: { title: 'Landing', domain: 'flows' },
  'signup-signin': { title: 'Signup and sign-in', domain: 'flows' },
  claim: { title: 'Claim a handle', domain: 'flows' },
  onboarding: { title: 'Onboarding to first value', domain: 'flows' },
  chat: { title: 'In-app chat first reply', domain: 'flows' },
  'public-profile': { title: 'Public profile', domain: 'public_profiles' },
  smartlink: { title: 'Release smartlinks', domain: 'smart_links' },
  checkout: { title: 'Checkout entry', domain: 'flows' },
} as const satisfies Record<
  string,
  { title: string; domain: OvieCertificationDomainId }
>;

export type ProdGoldenPathSurfaceId = keyof typeof PROD_GOLDEN_PATH_SURFACES;
export const PROD_GOLDEN_PATH_SURFACE_IDS = Object.keys(
  PROD_GOLDEN_PATH_SURFACES
) as ProdGoldenPathSurfaceId[];

export const PROD_GOLDEN_PATH_STATUSES = [
  'passed',
  'failed',
  'blocked',
] as const;
export type ProdGoldenPathStatus = (typeof PROD_GOLDEN_PATH_STATUSES)[number];

export interface ProdGoldenPathCheck {
  readonly id: string;
  readonly status: ProdGoldenPathStatus | 'skipped';
  readonly startedAt: string;
  readonly endedAt: string;
  readonly summary: string;
}

export interface ProdGoldenPathObservation {
  readonly contractId: string;
  readonly dimension: string;
  readonly value: number;
  readonly unit: string;
  readonly sampleSize: number;
}

export interface ProdGoldenPathReceipt {
  readonly schema: typeof PROD_GOLDEN_PATH_RECEIPT_SCHEMA;
  readonly surface: ProdGoldenPathSurfaceId;
  readonly status: ProdGoldenPathStatus;
  /** Exact deployed commit, from /api/health/build-info. */
  readonly sha: string;
  readonly deploymentId: string | null;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly runUrl: string | null;
  readonly screenIds: readonly string[];
  readonly identity: 'anonymous' | 'creator-ready' | 'new-user';
  readonly checks: readonly ProdGoldenPathCheck[];
  /** Why the surface could not be exercised. Required when blocked. */
  readonly blocker: string | null;
  readonly issueUrl: string | null;
  readonly observations: readonly ProdGoldenPathObservation[];
}

export interface ProdGoldenPathSurfaceRecord {
  readonly latest: ProdGoldenPathReceipt;
  readonly lastPassedSha: string | null;
  readonly history: readonly {
    readonly sha: string;
    readonly status: ProdGoldenPathStatus;
    readonly endedAt: string;
  }[];
}

export interface ProdGoldenPathLedger {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly contract: typeof PROD_GOLDEN_PATH_LEDGER_CONTRACT;
  readonly surfaces: Readonly<Record<string, ProdGoldenPathSurfaceRecord>>;
  readonly updatedAt: string;
}

export class ProdGoldenPathPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProdGoldenPathPersistenceError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

const SHA_RE = /^[0-9a-f]{40}$/u;

function isCheck(value: unknown): value is ProdGoldenPathCheck {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    (value.status === 'skipped' ||
      (PROD_GOLDEN_PATH_STATUSES as readonly unknown[]).includes(
        value.status
      )) &&
    isIso(value.startedAt) &&
    isIso(value.endedAt) &&
    typeof value.summary === 'string'
  );
}

export function isProdGoldenPathReceipt(
  value: unknown
): value is ProdGoldenPathReceipt {
  if (!isRecord(value)) return false;
  if (value.schema !== PROD_GOLDEN_PATH_RECEIPT_SCHEMA) return false;
  if (
    typeof value.surface !== 'string' ||
    !(value.surface in PROD_GOLDEN_PATH_SURFACES)
  ) {
    return false;
  }
  if (
    !(PROD_GOLDEN_PATH_STATUSES as readonly unknown[]).includes(value.status)
  ) {
    return false;
  }
  if (typeof value.sha !== 'string' || !SHA_RE.test(value.sha)) return false;
  if (!isIso(value.startedAt) || !isIso(value.endedAt)) return false;
  if (Date.parse(value.endedAt) < Date.parse(value.startedAt)) return false;
  if (!Array.isArray(value.checks) || !value.checks.every(isCheck)) {
    return false;
  }
  if (!Array.isArray(value.screenIds)) return false;
  // A passed surface cannot hide a failed or blocked check.
  if (
    value.status === 'passed' &&
    value.checks.some(c => c.status === 'failed' || c.status === 'blocked')
  ) {
    return false;
  }
  if (value.status === 'passed' && value.checks.length === 0) return false;
  if (
    value.status === 'blocked' &&
    (typeof value.blocker !== 'string' || value.blocker.length === 0)
  ) {
    return false;
  }
  return true;
}

function emptyLedger(updatedAt: string): ProdGoldenPathLedger {
  return {
    schemaVersion: SCHEMA_VERSION,
    contract: PROD_GOLDEN_PATH_LEDGER_CONTRACT,
    surfaces: {},
    updatedAt,
  };
}

export function parseProdGoldenPathLedger(raw: unknown): ProdGoldenPathLedger {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new ProdGoldenPathPersistenceError(
        'Production golden-path ledger is not valid JSON.'
      );
    }
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    value.contract !== PROD_GOLDEN_PATH_LEDGER_CONTRACT ||
    !isRecord(value.surfaces) ||
    !isIso(value.updatedAt)
  ) {
    throw new ProdGoldenPathPersistenceError(
      'Production golden-path ledger has an unexpected shape.'
    );
  }
  for (const [id, record] of Object.entries(value.surfaces)) {
    if (
      !isRecord(record) ||
      !isProdGoldenPathReceipt(record.latest) ||
      record.latest.surface !== id
    ) {
      throw new ProdGoldenPathPersistenceError(
        `Production golden-path record ${id} is invalid.`
      );
    }
  }
  return value as unknown as ProdGoldenPathLedger;
}

/** A missing ledger is disconnected evidence, never a measured zero. */
export async function readProdGoldenPathLedger(
  backend: CertificationRecordBackend
): Promise<ProdGoldenPathLedger | null> {
  const raw = await backend.get(PROD_GOLDEN_PATH_LEDGER_KEY);
  return raw === null || raw === undefined
    ? null
    : parseProdGoldenPathLedger(raw);
}

export type ProdGoldenPathRecordResult = {
  readonly recorded: readonly ProdGoldenPathSurfaceId[];
  /** Receipts not newer than the stored latest for their surface. */
  readonly stale: readonly ProdGoldenPathSurfaceId[];
};

/**
 * One run posts one receipt per surface. A receipt older than the stored
 * latest for its surface is ignored so a slow older run can never overwrite a
 * newer verdict.
 */
export async function recordProdGoldenPathRun(input: {
  readonly backend: CertificationRecordBackend;
  readonly receipts: readonly ProdGoldenPathReceipt[];
  readonly recordedAt?: string;
}): Promise<ProdGoldenPathRecordResult> {
  for (const receipt of input.receipts) {
    if (!isProdGoldenPathReceipt(receipt)) {
      throw new ProdGoldenPathPersistenceError(
        `Golden-path receipt for ${String((receipt as { surface?: unknown })?.surface)} is invalid.`
      );
    }
  }
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  return mutateCertificationRecord<
    ProdGoldenPathLedger,
    ProdGoldenPathRecordResult
  >({
    backend: input.backend,
    key: PROD_GOLDEN_PATH_LEDGER_KEY,
    initialize: () =>
      input.backend.setIfAbsent(
        PROD_GOLDEN_PATH_LEDGER_KEY,
        JSON.stringify(emptyLedger(recordedAt)),
        CERTIFICATION_PERSISTENCE_TTL_SECONDS
      ),
    parse: parseProdGoldenPathLedger,
    validate: parseProdGoldenPathLedger,
    error: message => new ProdGoldenPathPersistenceError(message),
    update: ledger => {
      const surfaces: Record<string, ProdGoldenPathSurfaceRecord> = {
        ...ledger.surfaces,
      };
      const recorded: ProdGoldenPathSurfaceId[] = [];
      const stale: ProdGoldenPathSurfaceId[] = [];
      for (const receipt of input.receipts) {
        const existing = surfaces[receipt.surface];
        if (
          existing &&
          Date.parse(receipt.endedAt) <= Date.parse(existing.latest.endedAt)
        ) {
          stale.push(receipt.surface);
          continue;
        }
        surfaces[receipt.surface] = {
          latest: receipt,
          lastPassedSha:
            receipt.status === 'passed'
              ? receipt.sha
              : (existing?.lastPassedSha ?? null),
          history: [
            ...(existing?.history ?? []),
            {
              sha: receipt.sha,
              status: receipt.status,
              endedAt: receipt.endedAt,
            },
          ].slice(-HISTORY_LIMIT),
        };
        recorded.push(receipt.surface);
      }
      if (recorded.length === 0) {
        return { ledger, result: { recorded, stale } };
      }
      return {
        ledger: { ...ledger, surfaces, updatedAt: recordedAt },
        result: { recorded, stale },
      };
    },
  });
}

const EVIDENCE_STATUS = {
  passed: 'passed',
  failed: 'failed',
  blocked: 'blocked',
} as const satisfies Record<
  ProdGoldenPathStatus,
  'passed' | 'failed' | 'blocked'
>;

function summarize(receipt: ProdGoldenPathReceipt): string {
  if (receipt.status === 'blocked') {
    return `Not exercised on production: ${receipt.blocker}`;
  }
  const failed = receipt.checks.filter(c => c.status === 'failed');
  if (failed.length > 0) {
    return `Failed on production: ${failed.map(c => `${c.id} (${c.summary})`).join('; ')}`.slice(
      0,
      1_900
    );
  }
  return `${receipt.checks.length} production checks passed as ${receipt.identity}.`;
}

/**
 * Project each stored surface into the packet-file shape the Ovie inventory
 * already renders. The evidence is runtime_dogfood bound to the deployed SHA.
 */
export function prodGoldenPathPacketFiles(
  ledger: ProdGoldenPathLedger
): CertificationPacketFile[] {
  const files: CertificationPacketFile[] = [];
  for (const id of PROD_GOLDEN_PATH_SURFACE_IDS) {
    const record = ledger.surfaces[id];
    if (!record) continue;
    const receipt = record.latest;
    const meta = PROD_GOLDEN_PATH_SURFACES[id];
    const packet: CertificationReviewPacket = {
      contract: JOVIE_CERTIFICATION_CONTRACT,
      subject: {
        id: `golden-path:${id}`,
        kind: 'production-surface',
        title: `${meta.title} (production)`,
      },
      source: {
        repository: 'JovieInc/Jovie',
        ref: 'production',
        sha: receipt.sha,
        paths: [...receipt.screenIds],
        digest: null,
      },
      canonicalReferences: [],
      invariantEvaluation: [],
      testsCoverage: [],
      visualProof: [],
      requiredVariants: [],
      itemMedia: [],
      operational: {
        runtimeDogfood: [
          {
            id: `prod-golden-path:${id}:${receipt.sha.slice(0, 8)}`,
            tier: 'runtime_dogfood',
            status: EVIDENCE_STATUS[receipt.status],
            sourceSha: receipt.sha,
            ref: receipt.runUrl ?? 'prod-golden-path',
            digest: null,
            summary: summarize(receipt),
          },
        ],
      },
    };
    files.push({
      domain: meta.domain,
      surface: meta.title,
      owner: null,
      packetUpdatedAt: receipt.endedAt,
      links: receipt.runUrl
        ? [{ label: 'Production run', href: receipt.runUrl, kind: 'test_run' }]
        : [],
      packet,
      file: `ledger:prod-golden-path/${id}`,
    });
  }
  return files;
}
