import 'server-only';

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
  type PacketFileDomain,
  readCertificationPacketFiles,
} from './packet-files.server';
import {
  OVIE_CERTIFICATION_DOMAIN_LABELS,
  OVIE_CERTIFICATION_INVENTORY_CONTRACT,
  type OvieCertificationDecisionRequest,
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

export interface OvieCertificationInventoryDeps {
  readonly marketingStore: () => MarketingCertificationStore;
  readonly backend: () => CertificationRecordBackend;
  readonly readPacketFiles: () => Promise<CertificationPacketFileRead>;
}

export const defaultOvieCertificationInventoryDeps: OvieCertificationInventoryDeps =
  {
    marketingStore: getMarketingCertificationStore,
    backend: postgresRecordBackend,
    readPacketFiles: () => readCertificationPacketFiles(),
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
  domain: PacketFileDomain,
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
  return {
    rowId: value.rowId,
    evidenceDigest: value.evidenceDigest,
    decision: value.decision as FounderCertificationDecisionKind,
    notes,
    actionId: value.actionId,
  };
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
    file,
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
