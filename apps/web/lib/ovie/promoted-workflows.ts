/**
 * Summer workflow promotion (JOV-5217).
 *
 * Inventory every candidate, reject discretionary authority, and promote one
 * proven dump classify+ack workflow. Eve executes the frozen contract only.
 * Code work still routes Summer → Symphony → identified worker on Gem.
 */

import {
  ingestOvieDump,
  type OvieDestination,
  type OvieLane,
  type OvieReceipt,
  persistOvieReceipt,
} from '@/lib/ovie/ingest';

export const PROMOTED_DUMP_ACK_WORKFLOW_ID = 'summer.ovie-dump-ack' as const;
export const PROMOTED_DUMP_ACK_VERSION_ID = '1' as const;
export const PROMOTED_WORKFLOW_OWNER = 'summer' as const;

export const CODE_WORK_ROUTING = Object.freeze({
  authority: 'summer',
  orchestrator: 'symphony',
  executionHost: 'gem',
  identifiedWorkerRequired: true,
  eveMayInvokeSymphony: false,
  eveMaySelectWorker: false,
});

export const PROMOTED_DUMP_ACK_CONTRACT = Object.freeze({
  workflowId: PROMOTED_DUMP_ACK_WORKFLOW_ID,
  versionId: PROMOTED_DUMP_ACK_VERSION_ID,
  owner: PROMOTED_WORKFLOW_OWNER,
  promotionStatus: 'promoted' as const,
  permissions: Object.freeze(['ingest-ack'] as const),
  deniedPermissions: Object.freeze([
    'choose-goal',
    'change-policy',
    'expand-permissions',
    'symphony-heal',
    'symphony-discretion',
    'privileged-gbrain-write',
    'public-action',
    'self-promote',
  ] as const),
  costCeilingUsd: 0,
  runtimeCeilingMs: 5_000,
  retryPolicy: Object.freeze({ maxAttempts: 3, backoffMs: 50 } as const),
  codeRouting: CODE_WORK_ROUTING,
  touchesFounderGatedDomains: false,
  founderApprovalRequiredFor: Object.freeze([
    'privacy',
    'identity',
    'memory',
    'credentials',
    'retention',
    'security',
    'public-action',
    'authority-boundary',
  ] as const),
});

export type PromotionDecision = 'promote' | 'reject';

export type SummerWorkflowCandidate = {
  readonly id: string;
  readonly title: string;
  readonly decision: PromotionDecision;
  readonly reason: string;
  readonly owner: 'summer' | null;
  readonly typedIo: boolean;
  readonly deterministic: boolean;
  readonly bounded: boolean;
  readonly discretionaryPrioritization: boolean;
  readonly ambiguousBroadAuthority: boolean;
  readonly recurrenceEvidence: string | null;
};

export const SUMMER_WORKFLOW_INVENTORY: readonly SummerWorkflowCandidate[] =
  Object.freeze([
    Object.freeze({
      id: 'ovie-dump-ack',
      title: 'Ovie dump classify + ack',
      decision: 'promote',
      reason:
        'Proven JOV-5215 dump path: typed receipts, no worker spawn, Kanban for company work. Linear→Symphony stays Summer-admitted.',
      owner: 'summer',
      typedIo: true,
      deterministic: true,
      bounded: true,
      discretionaryPrioritization: false,
      ambiguousBroadAuthority: false,
      recurrenceEvidence:
        'JOV-5215 shipped; mixed-dump classify+ack is the live ov chat path',
    }),
    Object.freeze({
      id: 'priority-triage',
      title: 'Company priority triage',
      decision: 'reject',
      reason: 'Requires discretionary prioritization.',
      owner: 'summer',
      typedIo: false,
      deterministic: false,
      bounded: false,
      discretionaryPrioritization: true,
      ambiguousBroadAuthority: true,
      recurrenceEvidence: null,
    }),
    Object.freeze({
      id: 'goal-selection',
      title: 'Goal selection',
      decision: 'reject',
      reason: 'Chooses goals; company judgment stays with Summer.',
      owner: 'summer',
      typedIo: false,
      deterministic: false,
      bounded: false,
      discretionaryPrioritization: true,
      ambiguousBroadAuthority: true,
      recurrenceEvidence: null,
    }),
    Object.freeze({
      id: 'policy-change',
      title: 'Policy change',
      decision: 'reject',
      reason: 'Changes policy; founder-gated authority boundary.',
      owner: 'summer',
      typedIo: false,
      deterministic: false,
      bounded: false,
      discretionaryPrioritization: true,
      ambiguousBroadAuthority: true,
      recurrenceEvidence: null,
    }),
    Object.freeze({
      id: 'permission-expansion',
      title: 'Permission expansion',
      decision: 'reject',
      reason: 'Expands permissions.',
      owner: null,
      typedIo: false,
      deterministic: false,
      bounded: false,
      discretionaryPrioritization: false,
      ambiguousBroadAuthority: true,
      recurrenceEvidence: null,
    }),
    Object.freeze({
      id: 'symphony-discretion',
      title: 'Symphony discretionary invoke',
      decision: 'reject',
      reason: 'Eve must not invoke Symphony discretionarily.',
      owner: 'summer',
      typedIo: false,
      deterministic: false,
      bounded: false,
      discretionaryPrioritization: true,
      ambiguousBroadAuthority: true,
      recurrenceEvidence: null,
    }),
    Object.freeze({
      id: 'self-promotion',
      title: 'Eve self-promotion',
      decision: 'reject',
      reason: 'Eve cannot promote itself.',
      owner: null,
      typedIo: false,
      deterministic: false,
      bounded: false,
      discretionaryPrioritization: true,
      ambiguousBroadAuthority: true,
      recurrenceEvidence: null,
    }),
  ]);

export type PromotedDumpAckStatus =
  | 'completed'
  | 'duplicate'
  | 'ignored_out_of_order'
  | 'timed_out'
  | 'failed'
  | 'compensated'
  | 'disabled';

export type RedactedDumpAckItem = {
  readonly lane: OvieLane;
  readonly destination: OvieDestination;
  readonly ack: string;
  readonly text: string;
  readonly workerSpawned: false;
};

export type PromotedDumpAckReceipt = {
  readonly workId: string;
  readonly workflowId: typeof PROMOTED_DUMP_ACK_WORKFLOW_ID;
  readonly versionId: typeof PROMOTED_DUMP_ACK_VERSION_ID;
  readonly status: PromotedDumpAckStatus;
  readonly owner: typeof PROMOTED_WORKFLOW_OWNER;
  readonly orchestrator: 'symphony';
  readonly executionHost: 'gem';
  readonly eveInvokedSymphony: false;
  readonly eveSelectedWorker: false;
  readonly attempt: number;
  readonly sequence: number;
  readonly items: readonly RedactedDumpAckItem[];
  readonly createdAt: string;
};

export type PromotedDumpAckInput = {
  readonly workId: string;
  readonly items: readonly string[];
  readonly sequence?: number;
};

export type PromotedDumpAckExecuteOptions = {
  readonly now?: () => number;
  readonly persist?: (receipts: readonly OvieReceipt[]) => void;
};

export class EveWorkflowContractMutationError extends Error {
  constructor() {
    super(
      'Eve cannot modify the workflow contract, permissions, cost ceiling, retry policy, or promotion status'
    );
    this.name = 'EveWorkflowContractMutationError';
  }
}

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SECRET_RE = /\b(?:sk|pk|token|bearer|key)[-_]?[A-Za-z0-9+/_=-]{8,}\b/gi;

type StoredRun = {
  sequence: number;
  attempts: number;
  terminal: boolean;
  receipt: PromotedDumpAckReceipt;
};

const runs = new Map<string, StoredRun>();
const receiptLog: PromotedDumpAckReceipt[] = [];
let enabled = true;

function redactText(text: string): string {
  return text
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(SECRET_RE, '[redacted-secret]');
}

/** In-process ack log only. Eve must not Linear-route or dispatch Symphony. */
export function persistPromotedDumpAckReceipts(
  receipts: readonly OvieReceipt[]
): void {
  for (const receipt of receipts) {
    persistOvieReceipt(receipt);
  }
}

function toRedactedItems(
  receipts: readonly OvieReceipt[]
): readonly RedactedDumpAckItem[] {
  return receipts.map(receipt => ({
    lane: receipt.lane,
    destination: receipt.destination,
    ack: receipt.ack,
    text: redactText(receipt.text),
    workerSpawned: false as const,
  }));
}

function recordReceipt(
  receipt: PromotedDumpAckReceipt
): PromotedDumpAckReceipt {
  receiptLog.push(receipt);
  return receipt;
}

export function evaluateSummerWorkflowCandidate(
  id: string
): SummerWorkflowCandidate | undefined {
  return SUMMER_WORKFLOW_INVENTORY.find(candidate => candidate.id === id);
}

export function listPromotedSummerWorkflows(): readonly SummerWorkflowCandidate[] {
  return SUMMER_WORKFLOW_INVENTORY.filter(
    candidate => candidate.decision === 'promote'
  );
}

export function applyEveWorkflowContractPatch(
  _patch: Record<string, unknown>
): never {
  void _patch;
  throw new EveWorkflowContractMutationError();
}

export function isPromotedDumpAckEnabled(): boolean {
  return enabled;
}

export function disablePromotedDumpAck(): void {
  enabled = false;
}

export function enablePromotedDumpAck(): void {
  enabled = true;
}

export function resetPromotedDumpAckRuntime(): void {
  runs.clear();
  receiptLog.length = 0;
  enabled = true;
}

export function listPromotedDumpAckReceipts(): readonly PromotedDumpAckReceipt[] {
  return receiptLog;
}

export function getPromotedDumpAckSnapshot(): {
  readonly workflowId: typeof PROMOTED_DUMP_ACK_WORKFLOW_ID;
  readonly versionId: typeof PROMOTED_DUMP_ACK_VERSION_ID;
  readonly owner: typeof PROMOTED_WORKFLOW_OWNER;
  readonly enabled: boolean;
  readonly promotionStatus: 'promoted';
  readonly codeRouting: typeof CODE_WORK_ROUTING;
  readonly eveCannotMutate: true;
  readonly receipts: readonly PromotedDumpAckReceipt[];
} {
  return {
    workflowId: PROMOTED_DUMP_ACK_WORKFLOW_ID,
    versionId: PROMOTED_DUMP_ACK_VERSION_ID,
    owner: PROMOTED_WORKFLOW_OWNER,
    enabled,
    promotionStatus: 'promoted',
    codeRouting: CODE_WORK_ROUTING,
    eveCannotMutate: true,
    receipts: receiptLog.slice(-20),
  };
}

export function parsePromotedDumpAckInput(
  input: PromotedDumpAckInput
): PromotedDumpAckInput {
  const workId = input.workId.trim();
  if (!workId || workId.length > 160) {
    throw new Error('Invalid workId');
  }
  if (
    !Array.isArray(input.items) ||
    input.items.length === 0 ||
    input.items.length > 50
  ) {
    throw new Error('Invalid items');
  }
  const items = input.items.map(item => {
    if (typeof item !== 'string' || item.length > 2000) {
      throw new Error('Invalid item');
    }
    return item;
  });
  const sequence = input.sequence ?? 0;
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error('Invalid sequence');
  }
  return { workId, items, sequence };
}

function buildReceipt(input: {
  readonly workId: string;
  readonly status: PromotedDumpAckStatus;
  readonly attempt: number;
  readonly sequence: number;
  readonly items: readonly RedactedDumpAckItem[];
  readonly createdAt: string;
}): PromotedDumpAckReceipt {
  return {
    workId: input.workId,
    workflowId: PROMOTED_DUMP_ACK_WORKFLOW_ID,
    versionId: PROMOTED_DUMP_ACK_VERSION_ID,
    status: input.status,
    owner: PROMOTED_WORKFLOW_OWNER,
    orchestrator: 'symphony',
    executionHost: 'gem',
    eveInvokedSymphony: false,
    eveSelectedWorker: false,
    attempt: input.attempt,
    sequence: input.sequence,
    items: input.items,
    createdAt: input.createdAt,
  };
}

export function executePromotedDumpAck(
  rawInput: PromotedDumpAckInput,
  options?: PromotedDumpAckExecuteOptions
): PromotedDumpAckReceipt {
  const input = parsePromotedDumpAckInput(rawInput);
  const sequence = input.sequence ?? 0;
  const now = options?.now ?? Date.now;
  const startedAt = now();
  const createdAt = new Date(startedAt).toISOString();
  const existing = runs.get(input.workId);

  if (!enabled) {
    return recordReceipt(
      buildReceipt({
        workId: input.workId,
        status: 'disabled',
        attempt: existing?.attempts ?? 0,
        sequence,
        items: [],
        createdAt,
      })
    );
  }

  if (existing?.terminal && sequence < existing.sequence) {
    return recordReceipt(
      buildReceipt({
        workId: input.workId,
        status: 'ignored_out_of_order',
        attempt: existing.attempts,
        sequence,
        items: existing.receipt.items,
        createdAt,
      })
    );
  }

  if (existing?.terminal && sequence === existing.sequence) {
    return recordReceipt({
      ...existing.receipt,
      status: 'duplicate',
      createdAt,
    });
  }

  const attempt = (existing?.attempts ?? 0) + 1;
  if (attempt > PROMOTED_DUMP_ACK_CONTRACT.retryPolicy.maxAttempts) {
    const failed = buildReceipt({
      workId: input.workId,
      status: 'failed',
      attempt,
      sequence,
      items: [],
      createdAt,
    });
    runs.set(input.workId, {
      sequence,
      attempts: attempt,
      terminal: true,
      receipt: failed,
    });
    return recordReceipt(failed);
  }

  const ovieReceipts = ingestOvieDump(input.items);
  const elapsed = now() - startedAt;
  const redacted = toRedactedItems(ovieReceipts);

  if (elapsed > PROMOTED_DUMP_ACK_CONTRACT.runtimeCeilingMs) {
    const timedOut = buildReceipt({
      workId: input.workId,
      status: 'timed_out',
      attempt,
      sequence,
      items: redacted,
      createdAt,
    });
    runs.set(input.workId, {
      sequence,
      attempts: attempt,
      terminal: false,
      receipt: timedOut,
    });
    return recordReceipt(timedOut);
  }

  try {
    (options?.persist ?? persistPromotedDumpAckReceipts)(ovieReceipts);
  } catch {
    const compensated = buildReceipt({
      workId: input.workId,
      status: 'compensated',
      attempt,
      sequence,
      items: redacted,
      createdAt,
    });
    runs.set(input.workId, {
      sequence,
      attempts: attempt,
      terminal: false,
      receipt: compensated,
    });
    return recordReceipt(compensated);
  }

  const completed = buildReceipt({
    workId: input.workId,
    status: 'completed',
    attempt,
    sequence,
    items: redacted,
    createdAt,
  });
  runs.set(input.workId, {
    sequence,
    attempts: attempt,
    terminal: true,
    receipt: completed,
  });
  return recordReceipt(completed);
}
