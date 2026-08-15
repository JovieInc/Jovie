import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { HERMES_PATHS } from './hermes-paths';

export const DELIVERY_LIVENESS_SCHEMA = 'jovie-delivery-liveness/v1';
export const DELIVERY_RECEIPT_STALE_MS = 5 * 60 * 1000;
export const VERIFICATION_DEADLINE_MS = 10 * 60 * 1000;

export type DeliveryProofTier =
  | 'source'
  | 'ci'
  | 'merge'
  | 'deploy'
  | 'runtime';
export type DeliveryStatus =
  | 'implementing'
  | 'awaiting_verification'
  | 'remediating'
  | 'blocked'
  | 'complete';
export type ExternalAuthorityReason =
  | 'credential'
  | 'account_2fa'
  | 'payment'
  | 'legal'
  | 'founder_decision'
  | 'irreversible_side_effect';
export type RemediationStep =
  | 'fresh_state_retry'
  | 'alternate_local_path'
  | 'docs_source_inspection'
  | 'reasoning_escalation'
  | 'peer_agent_assist'
  | 'accepted_owner_handoff'
  | 'decision_packet';

export interface DeliveryReceipt {
  readonly tier: DeliveryProofTier;
  readonly observedAt: string;
  readonly subject: string;
  readonly evidence: string;
}

export interface RemediationEvidence {
  readonly step: RemediationStep;
  readonly observedAt: string;
  readonly evidence: string;
}

export interface AcceptedOwner {
  readonly owner: string;
  readonly acceptedAt: string;
  readonly startedAt: string;
  readonly startReceipt: string;
}

export interface ExternalAuthorityBlock {
  readonly reason: ExternalAuthorityReason;
  readonly evidence: string;
  readonly decisionPacket: string;
  readonly criticalLane: 'standard' | 'summer';
}

export interface DeliveryLease {
  readonly schema: typeof DELIVERY_LIVENESS_SCHEMA;
  readonly repo: string;
  readonly issue: number;
  readonly pr: number | null;
  readonly prUrl: string | null;
  readonly status: DeliveryStatus;
  readonly requestedOutcomes: ReadonlyArray<DeliveryProofTier>;
  readonly receipts: ReadonlyArray<DeliveryReceipt>;
  readonly remediation: ReadonlyArray<RemediationEvidence>;
  readonly acceptedOwner: AcceptedOwner | null;
  readonly blocked: ExternalAuthorityBlock | null;
  readonly lastReceiptAt: string;
  readonly verificationDeadlineAt: string;
  readonly retryCount: number;
  readonly updatedAt: string;
}

export type WatchdogAction =
  | { readonly action: 'none'; readonly lease: DeliveryLease }
  | { readonly action: 'complete'; readonly lease: DeliveryLease }
  | {
      readonly action: 'retry_or_reassign';
      readonly lease: DeliveryLease;
      readonly reason: 'verification_deadline' | 'stale_receipt';
    }
  | {
      readonly action: 'external_authority';
      readonly lease: DeliveryLease;
      readonly packet: ExternalAuthorityBlock;
    };

export const DELIVERY_LIVENESS_DIR = join(
  HERMES_PATHS.stateDir,
  'delivery-liveness'
);

const REQUIRED_REMEDIATION_STEPS: ReadonlyArray<RemediationStep> = [
  'fresh_state_retry',
  'alternate_local_path',
  'docs_source_inspection',
  'reasoning_escalation',
  'peer_agent_assist',
  'accepted_owner_handoff',
  'decision_packet',
];

function isoAdd(now: string, milliseconds: number): string {
  return new Date(Date.parse(now) + milliseconds).toISOString();
}

export function requestedOutcomeTiers(text: string): DeliveryProofTier[] {
  const outcomes: DeliveryProofTier[] = ['source', 'ci', 'merge'];
  if (/\b(deploy|deployment|production|release)\b/i.test(text)) {
    outcomes.push('deploy');
  }
  if (/\b(runtime|smoke|oauth|auth|revenue|customer proof)\b/i.test(text)) {
    if (!outcomes.includes('deploy')) outcomes.push('deploy');
    outcomes.push('runtime');
  }
  return outcomes;
}

export function beginAwaitingVerification(input: {
  readonly repo: string;
  readonly issue: number;
  readonly issueText: string;
  readonly pr: number;
  readonly prUrl: string;
  readonly sourceSubject: string;
  readonly now?: string;
}): DeliveryLease {
  const now = input.now ?? new Date().toISOString();
  return {
    schema: DELIVERY_LIVENESS_SCHEMA,
    repo: input.repo,
    issue: input.issue,
    pr: input.pr,
    prUrl: input.prUrl,
    status: 'awaiting_verification',
    requestedOutcomes: requestedOutcomeTiers(input.issueText),
    receipts: [
      {
        tier: 'source',
        observedAt: now,
        subject: input.sourceSubject,
        evidence: input.prUrl,
      },
    ],
    remediation: [],
    acceptedOwner: null,
    blocked: null,
    lastReceiptAt: now,
    verificationDeadlineAt: isoAdd(now, VERIFICATION_DEADLINE_MS),
    retryCount: 0,
    updatedAt: now,
  };
}

export function beginImplementing(input: {
  readonly repo: string;
  readonly issue: number;
  readonly issueText: string;
  readonly owner: string;
  readonly startReceipt: string;
  readonly now?: string;
}): DeliveryLease {
  const now = input.now ?? new Date().toISOString();
  return {
    schema: DELIVERY_LIVENESS_SCHEMA,
    repo: input.repo,
    issue: input.issue,
    pr: null,
    prUrl: null,
    status: 'implementing',
    requestedOutcomes: requestedOutcomeTiers(input.issueText),
    receipts: [],
    remediation: [],
    acceptedOwner: {
      owner: input.owner,
      acceptedAt: now,
      startedAt: now,
      startReceipt: input.startReceipt,
    },
    blocked: null,
    lastReceiptAt: now,
    verificationDeadlineAt: isoAdd(now, VERIFICATION_DEADLINE_MS),
    retryCount: 0,
    updatedAt: now,
  };
}

export function recordReceipt(
  lease: DeliveryLease,
  receipt: DeliveryReceipt
): DeliveryLease {
  const unchanged = lease.receipts.find(
    existing =>
      existing.tier === receipt.tier &&
      existing.subject === receipt.subject &&
      existing.evidence === receipt.evidence
  );
  if (unchanged) return lease;
  const receipts = [
    ...lease.receipts.filter(existing => existing.tier !== receipt.tier),
    receipt,
  ];
  const proven = new Set(receipts.map(value => value.tier));
  const complete = lease.requestedOutcomes.every(tier => proven.has(tier));
  return {
    ...lease,
    receipts,
    status: complete ? 'complete' : 'awaiting_verification',
    lastReceiptAt: receipt.observedAt,
    verificationDeadlineAt: isoAdd(
      receipt.observedAt,
      VERIFICATION_DEADLINE_MS
    ),
    updatedAt: receipt.observedAt,
  };
}

export function startInternalRemediation(input: {
  readonly lease: DeliveryLease;
  readonly evidence: string;
  readonly owner?: string;
  readonly now?: string;
}): DeliveryLease {
  const now = input.now ?? new Date().toISOString();
  const owner = input.owner ?? 'codex-issue-shipper';
  const startReceipt = `internal-remediation:${input.lease.repo}#${input.lease.issue}:${now}`;
  return {
    ...input.lease,
    status: 'remediating',
    blocked: null,
    acceptedOwner: {
      owner,
      acceptedAt: now,
      startedAt: now,
      startReceipt,
    },
    remediation: [
      ...input.lease.remediation,
      { step: 'fresh_state_retry', observedAt: now, evidence: input.evidence },
      {
        step: 'accepted_owner_handoff',
        observedAt: now,
        evidence: `${owner}:${startReceipt}`,
      },
    ],
    lastReceiptAt: now,
    verificationDeadlineAt: isoAdd(now, VERIFICATION_DEADLINE_MS),
    retryCount: input.lease.retryCount + 1,
    updatedAt: now,
  };
}

export function blockForExternalAuthority(input: {
  readonly lease: DeliveryLease;
  readonly block: ExternalAuthorityBlock;
  readonly now?: string;
}): DeliveryLease {
  const present = new Set(input.lease.remediation.map(value => value.step));
  const missing = REQUIRED_REMEDIATION_STEPS.filter(step => !present.has(step));
  if (missing.length > 0) {
    throw new Error(`remediation_ladder_incomplete:${missing.join(',')}`);
  }
  if (!input.lease.acceptedOwner?.startReceipt) {
    throw new Error('accepted_owner_start_receipt_missing');
  }
  const now = input.now ?? new Date().toISOString();
  return {
    ...input.lease,
    status: 'blocked',
    blocked: input.block,
    updatedAt: now,
  };
}

export function watchdogDecision(
  lease: DeliveryLease,
  now: string = new Date().toISOString()
): WatchdogAction {
  if (lease.status === 'complete') return { action: 'complete', lease };
  if (lease.status === 'blocked' && lease.blocked) {
    return { action: 'external_authority', lease, packet: lease.blocked };
  }
  const nowMs = Date.parse(now);
  const receiptAge = nowMs - Date.parse(lease.lastReceiptAt);
  if (receiptAge > DELIVERY_RECEIPT_STALE_MS) {
    return { action: 'retry_or_reassign', lease, reason: 'stale_receipt' };
  }
  if (nowMs > Date.parse(lease.verificationDeadlineAt)) {
    return {
      action: 'retry_or_reassign',
      lease,
      reason: 'verification_deadline',
    };
  }
  return { action: 'none', lease };
}

export function deliveryLeasePath(
  repo: string,
  issue: number,
  dir: string = DELIVERY_LIVENESS_DIR
): string {
  return join(dir, `${repo.replaceAll('/', '--')}--${issue}.json`);
}

export function writeDeliveryLease(
  lease: DeliveryLease,
  path: string = deliveryLeasePath(lease.repo, lease.issue)
): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(lease, null, 2)}\n`);
  renameSync(temporary, path);
}

export function readDeliveryLease(path: string): DeliveryLease | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as DeliveryLease;
    return parsed.schema === DELIVERY_LIVENESS_SCHEMA ? parsed : null;
  } catch {
    return null;
  }
}
