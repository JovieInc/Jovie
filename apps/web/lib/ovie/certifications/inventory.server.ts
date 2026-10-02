import 'server-only';

import type { AcquisitionCertificationStore } from '@/lib/acquisition/certification-store';
import { readFeatureRegistrySource } from '@/lib/admin/feature-registry.server';
import type { FounderReviewItem } from '@/lib/admin/founder-review-registry';
import {
  evaluateCertificationAdmission,
  type FounderCertificationDecisionKind,
} from '@/lib/agent-os/certification';
import type {
  CertificationRecordBackend,
  MarketingCertificationStore,
} from '@/lib/agent-os/certification-adapter';
import {
  type CertificationInboxDelivery,
  projectCertificationInbox,
} from '@/lib/agent-os/certification-inbox';
import { getMarketingCertificationStore } from '@/lib/agent-os/certification-runtime-store';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import {
  countCertificationStates,
  normalizeKernelCertificationRow,
} from './normalize';
import {
  type PacketDecisionRecord,
  readPacketDecisionLedger,
  recordPacketFounderDecision,
} from './packet-decisions';
import {
  type CertificationPacketFile,
  type CertificationPacketFileRead,
  PACKET_FILE_DOMAINS,
  readCertificationPacketFiles,
} from './packet-files.server';
import {
  OVIE_CERTIFICATION_DOMAIN_LABELS,
  OVIE_CERTIFICATION_INVENTORY_CONTRACT,
  type OvieCertificationDecisionRequest,
  type OvieCertificationDomainId,
  type OvieCertificationDomainSummary,
  type OvieCertificationInventory,
  type OvieCertificationInventoryIssue,
  type OvieCertificationRow,
} from './types';

/**
 * The marketing adapter authorizes founder decisions only with a registered
 * assurance profile; none exist in source yet, so the rail says so instead of
 * offering an action the kernel would refuse.
 */
export const MARKETING_ASSURANCE_GATE =
  'No assurance profile is registered for this marketing component yet.';

const MARKETING_SURFACE_LABELS = {
  shell: 'Marketing Shell',
  section: 'Marketing Section',
  recipe: 'Marketing Recipe',
} as const;

const ACQUISITION_NOTE =
  'No trusted production candidate inventory exists yet; acquisition decisions stay in the acquisition store.';

const CUSTOMERS_NOTE =
  'No customer prospect inventory is connected yet; the kernel v2 candidate inventory lands with the customer epic.';

/**
 * One ranked customer prospect in certification. `subjectId` is the v1
 * prospect subject (`acquisition:premade-artist-profile:<leadId>:<runId>`);
 * `revision` is the immutable domain revision `decide` binds to. Ranking
 * fields come from the pipeline's `rankCustomer` output.
 */
export interface CustomerCertificationCandidateRef {
  readonly subjectId: string;
  readonly revision: string;
  readonly rank: number | null;
  readonly payScore: number | null;
  readonly fitScore: number | null;
  readonly heldFor: readonly string[];
  readonly updatedAt: string;
}

/**
 * The prospect inventory plus the acquisition certification store that owns
 * its rows and decisions. Absent until a trusted candidate inventory exists —
 * the domain then reports `not_connected` instead of a certified zero.
 */
export interface CustomerCertificationSource {
  list(): Promise<readonly CustomerCertificationCandidateRef[]>;
  store(): Pick<AcquisitionCertificationStore, 'project' | 'decide'>;
}

/**
 * Feature Registry packets are derived from the committed
 * `docs/FEATURE_REGISTRY.md` source at read time — the same projection the
 * admin page renders. `sourceUpdatedAt` is the registry file's mtime and
 * stands in for `packetUpdatedAt` in the shared decision ledger.
 */
export interface FeatureRegistryCertificationSource {
  list(): Promise<{
    readonly items: readonly FounderReviewItem[];
    readonly sourceUpdatedAt: string;
  }>;
}

export interface OvieCertificationInventoryDeps {
  readonly marketingStore: () => MarketingCertificationStore;
  readonly backend: () => CertificationRecordBackend;
  readonly readPacketFiles: () => Promise<CertificationPacketFileRead>;
  readonly featureRegistry: FeatureRegistryCertificationSource;
  readonly customers?: CustomerCertificationSource;
}

export const defaultOvieCertificationInventoryDeps: OvieCertificationInventoryDeps =
  {
    marketingStore: getMarketingCertificationStore,
    backend: postgresRecordBackend,
    readPacketFiles: () => readCertificationPacketFiles(),
    featureRegistry: { list: readFeatureRegistrySource },
  };

const STATE_ORDER = new Map(
  (
    [
      'review_ready',
      'working',
      'founder_locked',
      'shipped',
      'monitored',
    ] as const
  ).map((state, index) => [state, index])
);

function laterTimestamp(a: string, b: string): string {
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

interface CertificationDomainProjection {
  readonly rows: OvieCertificationRow[];
  readonly deliveries: CertificationInboxDelivery[];
  readonly summary: OvieCertificationDomainSummary;
  readonly issues: OvieCertificationInventoryIssue[];
}

function packetProjection(
  file: CertificationPacketFile,
  record: PacketDecisionRecord | undefined,
  evaluatedAt: string
): {
  readonly row: OvieCertificationRow;
  readonly delivery: CertificationInboxDelivery;
} {
  const decisions = record?.decisions ?? [];
  const admission = evaluateCertificationAdmission({
    packet: file.packet,
    decisions,
    evaluatedAt,
  });
  const updatedAt = record
    ? laterTimestamp(file.packetUpdatedAt, record.updatedAt)
    : file.packetUpdatedAt;
  return {
    row: normalizeKernelCertificationRow({
      domain: file.domain,
      surface: file.surface,
      packet: file.packet,
      admission,
      decisions,
      auditHistory: record?.auditHistory ?? [],
      updatedAt,
      links: file.links,
    }),
    delivery: {
      admission,
      domain: file.domain,
      observedAt: updatedAt,
      packet: file.packet,
    },
  };
}

function packetRow(
  file: CertificationPacketFile,
  record: PacketDecisionRecord | undefined,
  evaluatedAt: string
): OvieCertificationRow {
  return packetProjection(file, record, evaluatedAt).row;
}

async function marketingDomain(
  deps: OvieCertificationInventoryDeps,
  evaluatedAt: string
): Promise<CertificationDomainProjection> {
  const domain = 'marketing_components' as const;
  const label = OVIE_CERTIFICATION_DOMAIN_LABELS[domain];
  try {
    const projection = await deps.marketingStore().inspectLedger(evaluatedAt);
    const rows = projection.rows.map(row =>
      normalizeKernelCertificationRow({
        domain,
        surface: MARKETING_SURFACE_LABELS[row.registryKind],
        packet: row.packet,
        admission: row.admission,
        decisions: row.decisions,
        auditHistory: row.auditHistory,
        updatedAt: row.updatedAt,
        links: [],
        domainDecisionGate: MARKETING_ASSURANCE_GATE,
      })
    );
    return {
      rows,
      deliveries: projection.rows.map(row => ({
        admission: row.admission,
        domain: 'marketing_component',
        observedAt: row.updatedAt,
        packet: row.packet,
      })),
      summary: {
        domain,
        label,
        status: 'connected',
        rowCount: rows.length,
        note: null,
      },
      issues: [],
    };
  } catch {
    return {
      rows: [],
      deliveries: [],
      summary: {
        domain,
        label,
        status: 'error',
        rowCount: 0,
        note: 'The marketing certification ledger could not be read.',
      },
      issues: [
        {
          domain,
          source: 'ovie_operating_kv',
          message: 'Marketing certification ledger read failed.',
        },
      ],
    };
  }
}

async function packetDomain(
  domain: OvieCertificationDomainId,
  files: readonly CertificationPacketFile[],
  deps: OvieCertificationInventoryDeps,
  evaluatedAt: string
): Promise<CertificationDomainProjection> {
  const label = OVIE_CERTIFICATION_DOMAIN_LABELS[domain];
  if (files.length === 0) {
    return {
      rows: [],
      deliveries: [],
      summary: {
        domain,
        label,
        status: 'empty',
        rowCount: 0,
        note: 'No packet files are committed for this domain yet.',
      },
      issues: [],
    };
  }
  try {
    const ledger = await readPacketDecisionLedger(deps.backend(), domain);
    const projections = files.map(file =>
      packetProjection(
        file,
        ledger.records[file.packet.subject.id],
        evaluatedAt
      )
    );
    return {
      rows: projections.map(projection => projection.row),
      deliveries: projections.map(projection => projection.delivery),
      summary: {
        domain,
        label,
        status: 'connected',
        rowCount: projections.length,
        note: null,
      },
      issues: [],
    };
  } catch {
    // Without the decision ledger the state could hide a founder lock, so the
    // domain fails closed instead of showing guessed states.
    return {
      rows: [],
      deliveries: [],
      summary: {
        domain,
        label,
        status: 'error',
        rowCount: 0,
        note: 'Founder decisions for this domain could not be read.',
      },
      issues: [
        {
          domain,
          source: 'ovie_operating_kv',
          message: `Decision ledger read failed for ${files.length} packet${files.length === 1 ? '' : 's'}.`,
        },
      ],
    };
  }
}

const FEATURE_REGISTRY_SURFACE_LABELS = {
  behavior: 'Atomic Behavior',
  capability: 'Feature Capability',
  component: 'Registry Component',
} as const;

function featureRegistryPacketFile(
  item: FounderReviewItem,
  sourceUpdatedAt: string
): CertificationPacketFile {
  return {
    domain: 'feature_registry',
    surface: FEATURE_REGISTRY_SURFACE_LABELS[item.scope],
    packetUpdatedAt: sourceUpdatedAt,
    links: [],
    packet: item.certificationPacket,
    file: item.source,
  };
}

/**
 * The Feature Registry projects the same kernel admission and decision ledger
 * as packet-file domains; only the packet source differs (the committed
 * FEATURE_REGISTRY.md instead of worker packet files).
 */
async function featureRegistryDomain(
  deps: OvieCertificationInventoryDeps,
  evaluatedAt: string
): Promise<CertificationDomainProjection> {
  const domain = 'feature_registry' as const;
  let source: Awaited<ReturnType<FeatureRegistryCertificationSource['list']>>;
  try {
    source = await deps.featureRegistry.list();
  } catch {
    return {
      rows: [],
      deliveries: [],
      summary: {
        domain,
        label: OVIE_CERTIFICATION_DOMAIN_LABELS[domain],
        status: 'error',
        rowCount: 0,
        note: 'The feature registry source could not be read.',
      },
      issues: [
        {
          domain,
          source: 'feature_registry',
          message: 'Feature registry read failed.',
        },
      ],
    };
  }
  return packetDomain(
    domain,
    source.items.map(item =>
      featureRegistryPacketFile(item, source.sourceUpdatedAt)
    ),
    deps,
    evaluatedAt
  );
}

/**
 * One customer prospect row plus its inbox delivery. The row is a pure
 * projection of the acquisition store's candidate state — ranking fields are
 * pass-through, and the kernel admission is re-derived from the store's bound
 * packet so the decision digest a card acts on is the store's own.
 */
async function customerProjection(
  store: Pick<AcquisitionCertificationStore, 'project' | 'decide'>,
  candidate: CustomerCertificationCandidateRef,
  evaluatedAt: string
): Promise<{
  readonly row: OvieCertificationRow;
  readonly delivery: CertificationInboxDelivery;
}> {
  const projection = await store.project(candidate.subjectId);
  const decisions = projection.receipts.map(receipt => receipt.decision);
  const admission = {
    ...evaluateCertificationAdmission({
      packet: projection.packet,
      decisions,
      evaluatedAt,
    }),
    // The store's own gates (fresh evidence, bound candidate fields,
    // idempotent effect) hold the row at working even when the kernel
    // admission would otherwise read review-ready.
    state: projection.state,
  };
  const row = normalizeKernelCertificationRow({
    domain: 'customers',
    surface: 'Customer Prospect',
    packet: projection.packet,
    admission,
    decisions,
    auditHistory: [],
    updatedAt: candidate.updatedAt,
  });
  const gated = new Set(row.blockers.map(blocker => blocker.code));
  return {
    row: {
      ...row,
      blockers: [
        ...row.blockers,
        ...projection.missing
          .filter(code => !gated.has(code))
          .map(code => ({
            code,
            tier: 'state',
            summary: `Candidate gate failed: ${code}.`,
          })),
      ],
      rank: candidate.rank,
      payScore: candidate.payScore,
      fitScore: candidate.fitScore,
      heldFor: candidate.heldFor,
    },
    delivery: {
      admission,
      domain: 'customers',
      observedAt: candidate.updatedAt,
      packet: projection.packet,
      ranking: { impact: (candidate.payScore ?? 0) * 10 },
      requestedDecision: 'Certify this prospect for outreach.',
    },
  };
}

async function customersDomain(
  deps: OvieCertificationInventoryDeps,
  evaluatedAt: string
): Promise<CertificationDomainProjection> {
  const domain = 'customers' as const;
  const label = OVIE_CERTIFICATION_DOMAIN_LABELS[domain];
  const source = deps.customers;
  if (!source) {
    return {
      rows: [],
      deliveries: [],
      summary: {
        domain,
        label,
        status: 'not_connected',
        rowCount: 0,
        note: CUSTOMERS_NOTE,
      },
      issues: [],
    };
  }
  try {
    const candidates = await source.list();
    if (candidates.length === 0) {
      return {
        rows: [],
        deliveries: [],
        summary: {
          domain,
          label,
          status: 'empty',
          rowCount: 0,
          note: 'No customer prospects are in certification yet.',
        },
        issues: [],
      };
    }
    const store = source.store();
    const projections = await Promise.all(
      candidates.map(candidate =>
        customerProjection(store, candidate, evaluatedAt)
      )
    );
    return {
      rows: projections.map(projection => projection.row),
      deliveries: projections.map(projection => projection.delivery),
      summary: {
        domain,
        label,
        status: 'connected',
        rowCount: projections.length,
        note: null,
      },
      issues: [],
    };
  } catch {
    return {
      rows: [],
      deliveries: [],
      summary: {
        domain,
        label,
        status: 'error',
        rowCount: 0,
        note: 'The customer certification inventory could not be read.',
      },
      issues: [
        {
          domain,
          source: 'customer_prospect_inventory',
          message: 'Customer certification inventory read failed.',
        },
      ],
    };
  }
}

function compareRows(a: OvieCertificationRow, b: OvieCertificationRow) {
  return (
    (STATE_ORDER.get(a.state) ?? 0) - (STATE_ORDER.get(b.state) ?? 0) ||
    Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
    a.id.localeCompare(b.id)
  );
}

export async function readOvieCertificationInventory(
  deps: OvieCertificationInventoryDeps = defaultOvieCertificationInventoryDeps,
  generatedAt: string = new Date().toISOString()
): Promise<OvieCertificationInventory> {
  const packetRead = await deps.readPacketFiles();
  const results = await Promise.all([
    marketingDomain(deps, generatedAt),
    customersDomain(deps, generatedAt),
    featureRegistryDomain(deps, generatedAt),
    ...PACKET_FILE_DOMAINS.map(domain =>
      packetDomain(
        domain,
        packetRead.files.filter(file => file.domain === domain),
        deps,
        generatedAt
      )
    ),
  ]);

  const rows = results.flatMap(result => result.rows).sort(compareRows);
  const domains: OvieCertificationDomainSummary[] = [
    ...results.map(result => result.summary),
    {
      domain: 'acquisition',
      label: OVIE_CERTIFICATION_DOMAIN_LABELS.acquisition,
      status: 'not_connected',
      rowCount: 0,
      note: ACQUISITION_NOTE,
    },
  ];

  return {
    contract: OVIE_CERTIFICATION_INVENTORY_CONTRACT,
    generatedAt,
    universal: false,
    domains,
    counts: countCertificationStates(rows),
    queue: projectCertificationInbox(
      results.flatMap(result => result.deliveries)
    ),
    rows,
    issues: [...packetRead.issues, ...results.flatMap(result => result.issues)],
  };
}

export type OvieCertificationDecisionOutcome =
  | { readonly ok: true; readonly row: OvieCertificationRow }
  | {
      readonly ok: false;
      readonly status: 404 | 409;
      readonly error: string;
      readonly message: string;
    };

const DECISION_KINDS = new Set<FounderCertificationDecisionKind>([
  'approved',
  'changes_requested',
  'rejected',
]);

export function parseOvieCertificationDecisionRequest(
  body: unknown
): OvieCertificationDecisionRequest | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  const value = body as Record<string, unknown>;
  const notes =
    typeof value.notes === 'string' && value.notes.trim().length > 0
      ? value.notes.trim().slice(0, 4000)
      : null;
  if (
    typeof value.rowId !== 'string' ||
    !value.rowId.includes(':') ||
    typeof value.evidenceDigest !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(value.evidenceDigest) ||
    typeof value.decision !== 'string' ||
    !DECISION_KINDS.has(value.decision as FounderCertificationDecisionKind) ||
    typeof value.actionId !== 'string' ||
    !/^[\w-]{8,128}$/.test(value.actionId)
  ) {
    return null;
  }
  // Request changes is a comment; an empty one gives the worker nothing to do.
  if (value.decision === 'changes_requested' && !notes) return null;
  // Customer rejections map onto the acquisition store's `rejected`
  // decision, which requires the founder's reason.
  if (
    value.rowId.startsWith('customers:') &&
    value.decision === 'rejected' &&
    !notes
  ) {
    return null;
  }
  return {
    rowId: value.rowId,
    evidenceDigest: value.evidenceDigest,
    decision: value.decision as FounderCertificationDecisionKind,
    notes,
    actionId: value.actionId,
  };
}

/**
 * Card and table decisions on a customer prospect are the same call: the
 * row's revision and evidence digest bind to the acquisition store's `decide`
 * either way, so both surfaces land one identical receipt.
 */
async function recordCustomerDecision(
  request: OvieCertificationDecisionRequest,
  subjectId: string,
  deps: OvieCertificationInventoryDeps,
  decidedAt: string
): Promise<OvieCertificationDecisionOutcome> {
  const source = deps.customers;
  if (!source) {
    return {
      ok: false,
      status: 404,
      error: 'unknown_certification',
      message: 'Customer prospect certification is not connected.',
    };
  }
  let candidate: CustomerCertificationCandidateRef | undefined;
  try {
    candidate = (await source.list()).find(
      item => item.subjectId === subjectId
    );
  } catch {
    return {
      ok: false,
      status: 409,
      error: 'customer_inventory_unavailable',
      message: 'The customer certification inventory could not be read.',
    };
  }
  if (!candidate) {
    return {
      ok: false,
      status: 404,
      error: 'unknown_certification',
      message: 'This certification item is not a connected customer prospect.',
    };
  }
  const store = source.store();
  try {
    await store.decide({
      subjectId,
      revision: candidate.revision,
      evidenceDigest: request.evidenceDigest,
      actionId: request.actionId,
      // The acquisition decision ledger has approve/reject only; request
      // rebuild is recorded as a rejection carrying the founder's notes.
      decision: request.decision === 'approved' ? 'approved' : 'rejected',
      notes: request.notes,
    });
  } catch (error) {
    return {
      ok: false,
      status: 409,
      error: 'decision_rejected',
      message:
        error instanceof Error
          ? error.message
          : 'The decision could not be recorded.',
    };
  }
  const projection = await customerProjection(store, candidate, decidedAt);
  return { ok: true, row: projection.row };
}

const DECISION_FAILURE_MESSAGES: Record<string, string> = {
  packet_not_review_ready:
    'This item is not review-ready at its current evidence.',
  decision_digest_mismatch:
    'The evidence changed since this page loaded. Refresh and review again.',
  duplicate_founder_decision:
    'A decision for this evidence (or this action) is already recorded.',
  decision_predates_packet:
    'The packet is newer than this decision. Refresh and review again.',
};

/**
 * Feature Registry decisions land in the same shared packet-decision ledger
 * path as packet-file domains; the packet is re-derived from the committed
 * registry source, so a stale client digest or item fails closed.
 */
async function recordFeatureRegistryDecision(
  request: OvieCertificationDecisionRequest,
  subjectId: string,
  deps: OvieCertificationInventoryDeps,
  decidedAt: string,
  reviewer: string
): Promise<OvieCertificationDecisionOutcome> {
  let source: Awaited<ReturnType<FeatureRegistryCertificationSource['list']>>;
  try {
    source = await deps.featureRegistry.list();
  } catch {
    return {
      ok: false,
      status: 409,
      error: 'feature_registry_unavailable',
      message: 'The feature registry could not be read.',
    };
  }
  const item = source.items.find(candidate => candidate.id === subjectId);
  if (!item) {
    return {
      ok: false,
      status: 404,
      error: 'unknown_certification',
      message: 'This certification item is not in the feature registry.',
    };
  }
  const target = featureRegistryPacketFile(item, source.sourceUpdatedAt);
  const backend = deps.backend();
  const result = await recordPacketFounderDecision({
    backend,
    target,
    decidedAt,
    decision: {
      id: request.actionId,
      decision: request.decision,
      evidenceDigest: request.evidenceDigest,
      notes: request.notes,
      reviewer,
    },
  });
  if (!result.ok) {
    return {
      ok: false,
      status: 409,
      error: result.reason,
      message:
        DECISION_FAILURE_MESSAGES[result.reason] ??
        'The decision could not be recorded.',
    };
  }
  const ledger = await readPacketDecisionLedger(backend, target.domain);
  return {
    ok: true,
    row: packetRow(target, ledger.records[subjectId], decidedAt),
  };
}

/**
 * Dispatch one founder decision to the kernel owner of the row's domain.
 * The reviewer is resolved by the caller from the server session only.
 */
export async function recordOvieCertificationDecision(
  request: OvieCertificationDecisionRequest,
  reviewer: string,
  deps: OvieCertificationInventoryDeps = defaultOvieCertificationInventoryDeps,
  decidedAt: string = new Date().toISOString()
): Promise<OvieCertificationDecisionOutcome> {
  const separator = request.rowId.indexOf(':');
  const domain = request.rowId.slice(0, separator);
  const subjectId = request.rowId.slice(separator + 1);

  if (domain === 'marketing_components') {
    return {
      ok: false,
      status: 409,
      error: 'assurance_profile_missing',
      message: MARKETING_ASSURANCE_GATE,
    };
  }
  if (domain === 'customers') {
    return recordCustomerDecision(request, subjectId, deps, decidedAt);
  }
  if (domain === 'feature_registry') {
    return recordFeatureRegistryDecision(
      request,
      subjectId,
      deps,
      decidedAt,
      reviewer
    );
  }
  if (!(PACKET_FILE_DOMAINS as readonly string[]).includes(domain)) {
    return {
      ok: false,
      status: 404,
      error: 'unknown_certification',
      message: 'This certification item is not in a connected domain.',
    };
  }

  const file = (await deps.readPacketFiles()).files.find(
    candidate =>
      candidate.domain === domain && candidate.packet.subject.id === subjectId
  );
  if (!file) {
    return {
      ok: false,
      status: 404,
      error: 'unknown_certification',
      message: 'This certification item no longer has a packet.',
    };
  }

  const backend = deps.backend();
  const result = await recordPacketFounderDecision({
    backend,
    target: file,
    decidedAt,
    decision: {
      id: request.actionId,
      decision: request.decision,
      evidenceDigest: request.evidenceDigest,
      notes: request.notes,
      reviewer,
    },
  });
  if (!result.ok) {
    return {
      ok: false,
      status: 409,
      error: result.reason,
      message:
        DECISION_FAILURE_MESSAGES[result.reason] ??
        'The decision could not be recorded.',
    };
  }

  const ledger = await readPacketDecisionLedger(backend, file.domain);
  return {
    ok: true,
    row: packetRow(file, ledger.records[subjectId], decidedAt),
  };
}
