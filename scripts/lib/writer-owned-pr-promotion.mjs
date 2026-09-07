import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const WRITER_PROOF_SCHEMA = 'jovie-writer-pr-proof/v1'; // JOV-INV-022
// JOV-INV-029: writer owns review handoff; promotion and activation remain downstream.
export const WRITER_PROMOTION_BLOCKER_SCHEMA =
  'jovie-writer-pr-promotion-blocker/v1';

const EVIDENCE_FIELDS = Object.freeze([
  ['requiredTests', 'required-tests', 'Required test evidence is missing.'],
  ['reviewSweep', 'review-sweep', 'Review sweep evidence is missing.'],
  ['ticketEvidence', 'ticket-evidence', 'Ticket evidence is missing.'],
  ['prEvidence', 'pr-evidence', 'PR evidence is missing.'],
]);
const REQUIRED_WRITER_PROOF_GATES = Object.freeze([
  'exact-head',
  'writer',
  ...EVIDENCE_FIELDS.map(([, id]) => id),
  'writer-promotion-path',
]);

const SHA_RE = /^[0-9a-f]{40}$/;
const ISSUE_RE = /^[A-Z][A-Z0-9]+-\d+$/;
const SUCCESS_EVIDENCE_STATUSES = new Set(['attached', 'complete', 'passed']);
const INCOMPLETE_EVIDENCE_RE =
  /^$|^(?:false|fail|failed|missing|none|no|pending|skipped|todo|unchecked)(?:\b|:|$)/i;
export const CONTROLLED_PROOF_LABELS = Object.freeze([
  'canary',
  'controlled-proof',
  'deliberate-red',
  'proof',
]);
export const WRITER_PROMOTION_HOLD_LABELS = Object.freeze([
  'fast',
  'hold',
  'gated',
  'incident',
  'needs-conflict-resolution',
  'needs-manual-rebase',
  'queue-deferred',
  'security',
  'needs:security',
  ...CONTROLLED_PROOF_LABELS,
]);
const HOLD_LABELS = new Set(
  WRITER_PROMOTION_HOLD_LABELS.map(label => label.toLowerCase())
);

const exactSha = value =>
  typeof value === 'string' && SHA_RE.test(value.toLowerCase())
    ? value.toLowerCase()
    : '';
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const normalizeLogin = value =>
  typeof value === 'string' ? value.trim().replace(/^@/, '').toLowerCase() : '';
const normalizeIssue = value =>
  typeof value === 'string' ? value.trim().toUpperCase() : '';
const positiveInteger = value => {
  const number = Number.parseInt(String(value), 10);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};
const gate = (id, passed, reason) => ({ id, passed, reason });
const fail = reason => ({ ok: false, reason });

function evidenceSummary(value) {
  if (value === true) return 'complete';
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  return [value.status, value.summary]
    .filter(hasText)
    .map(item => item.trim())
    .join(': ');
}

function evidenceStatus(value) {
  if (value === true) return { status: 'complete', summary: 'complete' };
  if (typeof value === 'string') {
    const summary = value.trim();
    const directStatus = summary.toLowerCase();
    const match = /^([a-z][a-z0-9-]*):\s*(.+)$/i.exec(summary);
    if (match) {
      return { status: match[1].toLowerCase(), summary: match[2].trim() };
    }
    return {
      status: SUCCESS_EVIDENCE_STATUSES.has(directStatus) ? directStatus : '',
      summary,
    };
  }
  if (!value || typeof value !== 'object') return { status: '', summary: '' };
  return {
    status: String(value.status ?? '')
      .trim()
      .toLowerCase(),
    summary: String(value.summary ?? '').trim(),
  };
}

function evidenceComplete(value) {
  const { status, summary } = evidenceStatus(value);
  return (
    SUCCESS_EVIDENCE_STATUSES.has(status) &&
    summary.length > 0 &&
    !INCOMPLETE_EVIDENCE_RE.test(summary)
  );
}

export function buildWriterProofReceipt(input = {}) {
  const issueId = normalizeIssue(input.issueId);
  const prNumber = positiveInteger(input.prNumber);
  const headSha = exactSha(input.headSha);
  const writerLogin = normalizeLogin(input.writerLogin);
  const promotionPath = String(
    input.promotionPath ?? 'writer-owned-pr-promote'
  );
  const reconciliationRequired = input.reconciliationRequired === true;
  const evidence = Object.fromEntries(
    EVIDENCE_FIELDS.map(([field]) => [field, evidenceSummary(input[field])])
  );
  const gates = [
    gate('exact-head', Boolean(headSha), headSha || 'Head SHA missing.'),
    gate('writer', Boolean(writerLogin), writerLogin || 'Writer missing.'),
    ...EVIDENCE_FIELDS.map(([field, gateId, missing]) =>
      gate(gateId, evidenceComplete(input[field]), evidence[field] || missing)
    ),
    gate(
      'writer-promotion-path',
      promotionPath === 'writer-owned-pr-promote' && !reconciliationRequired,
      reconciliationRequired
        ? 'Successful promotion must not require reconciliation.'
        : `Promotion path is ${promotionPath}.`
    ),
  ];
  const blockedBy = gates.filter(item => !item.passed).map(item => item.id);
  return {
    schema: WRITER_PROOF_SCHEMA,
    issuedAt:
      typeof input.issuedAt === 'string'
        ? input.issuedAt
        : new Date().toISOString(),
    issueId,
    prNumber,
    headSha,
    writerLogin,
    ownership: 'author-owned',
    evidence,
    promotion: {
      path: promotionPath,
      readyAndNativeIntent: 'same-bounded-action',
      reconciliationRequired,
    },
    gates,
    proofComplete: blockedBy.length === 0,
    blockedBy,
  };
}

export const renderWriterProofReceipt = receipt =>
  `<!-- ${WRITER_PROOF_SCHEMA}\n${JSON.stringify(receipt, null, 2)}\n-->`;

function receiptPattern(prefix = '') {
  return new RegExp(
    `${prefix}<!--\\s*${WRITER_PROOF_SCHEMA.replaceAll('/', '\\/')}\\s*([\\s\\S]*?)\\s*-->`,
    'g'
  );
}

export function extractWriterProofReceipts(markdown = '') {
  const receipts = [];
  for (const match of String(markdown ?? '').matchAll(receiptPattern())) {
    try {
      receipts.push(JSON.parse(match[1]));
    } catch {}
  }
  return receipts;
}

export const extractLatestWriterProofReceipt = (markdown = '') =>
  extractWriterProofReceipts(markdown).at(-1) ?? null;

export function attachWriterProofReceipt(markdown = '', receipt) {
  const body = String(markdown ?? '')
    .trimEnd()
    .replace(receiptPattern('\\n{0,2}'), '')
    .trimEnd();
  return [body, renderWriterProofReceipt(receipt)].filter(Boolean).join('\n\n');
}

export function validateWriterProofReceipt(receipt, context = {}) {
  if (!receipt || typeof receipt !== 'object') return fail('proof-missing');
  if (receipt.schema !== WRITER_PROOF_SCHEMA) {
    return fail('proof-schema-mismatch');
  }

  const issueId = normalizeIssue(receipt.issueId);
  const prNumber = positiveInteger(receipt.prNumber);
  const headSha = exactSha(receipt.headSha);
  const writerLogin = normalizeLogin(receipt.writerLogin);
  const expectedPrNumber = positiveInteger(context.prNumber);
  const expectedHeadSha = exactSha(context.expectedHeadSha ?? context.headSha);
  const expectedWriter = normalizeLogin(
    context.expectedWriterLogin ?? context.writerLogin
  );
  for (const [blocked, reason] of [
    [!ISSUE_RE.test(issueId), 'issue-missing'],
    [!prNumber, 'pr-number-missing'],
    [expectedPrNumber && prNumber !== expectedPrNumber, 'pr-number-mismatch'],
    [!headSha, 'head-missing'],
    [expectedHeadSha && headSha !== expectedHeadSha, 'head-mismatch'],
    [!writerLogin, 'writer-missing'],
    [expectedWriter && writerLogin !== expectedWriter, 'writer-mismatch'],
    [receipt.ownership !== 'author-owned', 'ownership-mismatch'],
  ]) {
    if (blocked) return fail(reason);
  }

  const gates = new Map(
    Array.isArray(receipt.gates)
      ? receipt.gates.map(item => [item?.id, item])
      : []
  );
  const failedGate = REQUIRED_WRITER_PROOF_GATES.find(
    id => gates.get(id)?.passed !== true
  );
  if (failedGate) return fail(`gate-${failedGate}`);

  const evidence =
    receipt.evidence && typeof receipt.evidence === 'object'
      ? receipt.evidence
      : {};
  const failedEvidence = EVIDENCE_FIELDS.find(
    ([field]) => !evidenceComplete(evidence[field])
  );
  if (failedEvidence) return fail(`evidence-${failedEvidence[1]}`);
  if (receipt.proofComplete !== true) return fail('proof-incomplete');
  if (Array.isArray(receipt.blockedBy) && receipt.blockedBy.length > 0) {
    return fail('proof-blocked');
  }
  if (receipt.promotion?.path !== 'writer-owned-pr-promote') {
    return fail('promotion-path-mismatch');
  }
  if (receipt.promotion?.reconciliationRequired === true) {
    return fail('reconciliation-required');
  }
  return {
    ok: true,
    reason: 'proof-complete',
    receipt: { issueId, prNumber, headSha, writerLogin },
  };
}

function labelsOf(state = {}) {
  const raw = Array.isArray(state.labels)
    ? state.labels
    : Array.isArray(state.labels?.nodes)
      ? state.labels.nodes
      : [];
  return raw
    .map(label => (typeof label === 'string' ? label : label?.name))
    .filter(hasText);
}

export function normalizePromotionState(state = {}) {
  const labels = labelsOf(state);
  const mergeQueueEntry = state.mergeQueueEntry ?? null;
  return {
    state: String(state.state ?? 'UNKNOWN').toUpperCase(),
    draft:
      typeof state.draft === 'boolean' ? state.draft : state.isDraft === true,
    headSha: exactSha(state.head ?? state.headSha ?? state.headRefOid),
    labels,
    heldLabels: labels.filter(label => HOLD_LABELS.has(label.toLowerCase())),
    autoMerge: state.autoMerge === true || state.autoMergeRequest != null,
    queued:
      state.queued === true ||
      (state.isInMergeQueue === true && mergeQueueEntry !== null),
  };
}

function readyAtHead(state, expectedHeadSha) {
  const normalized = normalizePromotionState(state);
  return {
    normalized,
    ready:
      normalized.state === 'OPEN' &&
      normalized.draft === false &&
      normalized.headSha === exactSha(expectedHeadSha),
  };
}

export function hasNativePromotionIntent(state, expectedHeadSha) {
  const { normalized, ready } = readyAtHead(state, expectedHeadSha);
  return (
    ready &&
    normalized.heldLabels.length === 0 &&
    (normalized.autoMerge || normalized.queued)
  );
}

export function isReadyUnenrolledState(state, expectedHeadSha) {
  const { normalized, ready } = readyAtHead(state, expectedHeadSha);
  return ready && !normalized.autoMerge && !normalized.queued;
}

export function evaluateWriterPromotion(input = {}) {
  const { receipt, state, expectedHeadSha, writerLogin, prNumber } = input;
  const proof = validateWriterProofReceipt(receipt, {
    expectedHeadSha,
    writerLogin,
    prNumber,
  });
  if (!proof.ok) return { ...proof, action: 'block' };

  const expected = exactSha(expectedHeadSha);
  const normalized = normalizePromotionState(state);
  if (!expected)
    return { ok: false, action: 'block', reason: 'expected-head-missing' };
  if (normalized.state === 'MERGED' && normalized.headSha === expected) {
    return {
      ok: true,
      action: 'already-complete',
      reason: 'merged-at-exact-head',
    };
  }
  if (hasNativePromotionIntent(normalized, expected)) {
    return {
      ok: true,
      action: 'already-complete',
      reason: 'native-intent-established',
    };
  }
  if (isReadyUnenrolledState(normalized, expected)) {
    return { ok: false, action: 'compensate', reason: 'ready-unenrolled' };
  }
  if (normalized.state !== 'OPEN') {
    return { ok: false, action: 'block', reason: `state-${normalized.state}` };
  }
  if (normalized.headSha !== expected) {
    return { ok: false, action: 'block', reason: 'head-mismatch' };
  }
  if (normalized.heldLabels.length > 0) {
    return {
      ok: false,
      action: 'block',
      reason: `held-by-${normalized.heldLabels.join(',')}`,
    };
  }
  return normalized.draft === true
    ? { ok: true, action: 'promote', reason: 'proof-complete' }
    : { ok: false, action: 'block', reason: 'promotion-state-invalid' };
}

export function buildPromotionBlocker(input = {}) {
  const compensation = input.compensation ?? {};
  return {
    schema: WRITER_PROMOTION_BLOCKER_SCHEMA,
    emittedAt:
      typeof input.emittedAt === 'string'
        ? input.emittedAt
        : new Date().toISOString(),
    status: 'terminal-blocker',
    issueId: normalizeIssue(input.issueId),
    prNumber: positiveInteger(input.prNumber),
    headSha: exactSha(input.headSha),
    writerLogin: normalizeLogin(input.writerLogin),
    phase: hasText(input.phase) ? input.phase : 'promotion',
    reason: hasText(input.reason) ? input.reason : 'unknown',
    compensation: {
      attempted: compensation.attempted === true,
      verified: compensation.verified === true,
      state:
        compensation.state && typeof compensation.state === 'object'
          ? normalizePromotionState(compensation.state)
          : null,
    },
  };
}

export function renderPromotionBlockerComment(blocker) {
  return [
    'Writer-owned PR promotion blocked.',
    '',
    `Schema: \`${WRITER_PROMOTION_BLOCKER_SCHEMA}\``,
    `Issue: \`${blocker.issueId || 'unknown'}\``,
    `PR: \`#${blocker.prNumber ?? 'unknown'}\``,
    `Head: \`${blocker.headSha || 'unknown'}\``,
    `Writer: \`${blocker.writerLogin || 'unknown'}\``,
    `Phase: \`${blocker.phase}\``,
    `Reason: \`${blocker.reason}\``,
    `Compensation verified: \`${blocker.compensation.verified}\``,
    '',
    `<!-- ${WRITER_PROMOTION_BLOCKER_SCHEMA}`,
    JSON.stringify(blocker, null, 2),
    '-->',
  ].join('\n');
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function parseFlagArgs(argv) {
  const flags = {};
  for (let index = 3; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const next = argv[index + 1];
    flags[arg.slice(2)] =
      next === undefined || next.startsWith('--') ? true : next;
    if (next !== undefined && !next.startsWith('--')) index += 1;
  }
  return flags;
}

const flagTrue = value => value === true || value === 'true' || value === '1';
const writeJson = value =>
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

function main(argv) {
  const command = argv[2] ?? 'help';
  if (command === 'receipt') {
    const flags = parseFlagArgs(argv);
    const receipt = buildWriterProofReceipt({
      issueId: flags.issue,
      prNumber: flags.pr,
      headSha: flags.head,
      writerLogin: flags.writer,
      requiredTests: flags['required-tests'],
      reviewSweep: flags['review-sweep'],
      ticketEvidence: flags['ticket-evidence'],
      prEvidence: flags['pr-evidence'],
      promotionPath: flags['promotion-path'],
      reconciliationRequired: flagTrue(flags['reconciliation-required']),
    });
    flagTrue(flags.comment)
      ? process.stdout.write(`${renderWriterProofReceipt(receipt)}\n`)
      : writeJson(receipt);
    return receipt.proofComplete ? 0 : 1;
  }
  if (command === 'extract') {
    writeJson(extractLatestWriterProofReceipt(readStdin()));
    return 0;
  }
  if (command === 'attach') {
    const input = JSON.parse(readStdin());
    process.stdout.write(
      `${attachWriterProofReceipt(input.body, input.receipt)}\n`
    );
    return 0;
  }
  if (command === 'decision') {
    const input = JSON.parse(readStdin());
    writeJson(
      evaluateWriterPromotion({
        receipt:
          input.receipt ?? extractLatestWriterProofReceipt(input.body ?? ''),
        state: input.state,
        expectedHeadSha: input.context?.expectedHeadSha,
        writerLogin: input.context?.writerLogin,
        prNumber: input.context?.prNumber,
      })
    );
    return 0;
  }
  if (command === 'render-blocker') {
    process.stdout.write(
      `${renderPromotionBlockerComment(buildPromotionBlocker(JSON.parse(readStdin())))}\n`
    );
    return 0;
  }
  console.error(
    'Usage: writer-owned-pr-promotion.mjs <receipt|extract|attach|decision|render-blocker>'
  );
  return 2;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main(process.argv);
}
