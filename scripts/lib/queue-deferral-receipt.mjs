#!/usr/bin/env node
/** Canonical reader/writer for exact-head `jovie-queue-deferral/v1` comments. */

export const QUEUE_DEFERRAL_SCHEMA = 'jovie-queue-deferral/v1';
export const QUEUE_DEFERRAL_MARKER = '<!-- bot-comment:queue-deferral -->';

/**
 * Mechanical holds a controller may lift after green checks + fresh GREEN.
 * Bind each reason to its only authorized writer; a reason string on its own
 * is not provenance.
 */
export const RELEASABLE_REASON_SOURCES = Object.freeze({
  'symphony-birth-hold': 'symphony',
  'queue-pressure': 'agent-pipeline',
});
export const RELEASABLE_REASONS = Object.freeze(
  Object.keys(RELEASABLE_REASON_SOURCES)
);

/**
 * Holds only a human may keep in place. Mechanical `queue-deferred` is not
 * in this set: missing receipts must not become a permanent manual trap.
 * Closed-loop policy: humans block on net-new, taste, or outbound.
 */
export const HUMAN_POLICY_HOLD_LABELS = Object.freeze([
  'needs-human',
  'hold',
  'gated',
  'fast',
  'needs-conflict-resolution',
  'needs:taste',
  'needs-human-taste',
  'taste',
  'net-new',
  'needs:net-new',
  'needs-net-new',
  'outbound',
  'needs:outbound',
  'needs-outbound',
]);

function labelName(label) {
  if (typeof label === 'string') return label;
  if (label && typeof label === 'object' && typeof label.name === 'string') {
    return label.name;
  }
  return '';
}

export function humanPolicyHoldsOn(labels = []) {
  const allowed = new Set(HUMAN_POLICY_HOLD_LABELS);
  return [
    ...new Set((labels ?? []).map(labelName).filter(name => allowed.has(name))),
  ];
}

export function humanPolicyHoldRegex() {
  const escaped = HUMAN_POLICY_HOLD_LABELS.map(name =>
    name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  return `^(${escaped.join('|')})$`;
}

const HEAD_RE = /^[0-9a-f]{40}$/;
const JSON_BLOCK_RE = /```json\s*\n([\s\S]*?)\n```/;

export function validateReceipt(candidate) {
  const errors = [];
  if (
    candidate === null ||
    typeof candidate !== 'object' ||
    Array.isArray(candidate)
  ) {
    return {
      ok: false,
      errors: ['receipt must be a JSON object'],
      receipt: null,
    };
  }
  const r = candidate;
  if (r.schema !== QUEUE_DEFERRAL_SCHEMA) {
    errors.push(`schema must be "${QUEUE_DEFERRAL_SCHEMA}"`);
  }
  if (!Number.isInteger(r.pr) || r.pr <= 0) {
    errors.push('pr must be a positive integer');
  }
  if (typeof r.head !== 'string' || !HEAD_RE.test(r.head)) {
    errors.push('head must be a 40-character lowercase hex SHA');
  }
  if (typeof r.reason !== 'string' || r.reason.length === 0) {
    errors.push('reason must be a non-empty string');
  }
  if (typeof r.source !== 'string' || r.source.length === 0) {
    errors.push('source must be a non-empty string');
  }
  if (
    typeof r.deferredAt !== 'string' ||
    Number.isNaN(Date.parse(r.deferredAt))
  ) {
    errors.push('deferredAt must be an ISO timestamp');
  }
  if (r.note !== undefined && typeof r.note !== 'string') {
    errors.push('note must be a string when present');
  }
  if (errors.length > 0) {
    return { ok: false, errors, receipt: null };
  }
  const receipt = {
    schema: QUEUE_DEFERRAL_SCHEMA,
    pr: r.pr,
    head: r.head,
    reason: r.reason,
    source: r.source,
    deferredAt: new Date(r.deferredAt).toISOString(),
  };
  if (typeof r.note === 'string' && r.note.length > 0) {
    receipt.note = r.note;
  }
  return { ok: true, errors: [], receipt };
}

export function renderReceiptComment({
  pr,
  head,
  reason,
  source,
  deferredAt = new Date().toISOString(),
  note = undefined,
}) {
  const { ok, errors, receipt } = validateReceipt({
    schema: QUEUE_DEFERRAL_SCHEMA,
    pr,
    head,
    reason,
    source,
    deferredAt,
    note,
  });
  if (!ok) {
    throw new Error(`invalid deferral receipt: ${errors.join('; ')}`);
  }
  return `${QUEUE_DEFERRAL_MARKER}
## Queue Deferral Receipt

\`\`\`json
${JSON.stringify(receipt, null, 2)}
\`\`\`

Typed \`queue-deferred\` hold: \`${reason}\` from \`${source}\`.
It is released when this exact head, required checks, and a fresh GREEN fleet gate agree.
Human-policy holds (taste, net-new, outbound) stay held. Untyped ready holds are not a manual trap.`;
}

export function extractReceiptFromComment(body) {
  if (typeof body !== 'string' || !body.includes(QUEUE_DEFERRAL_MARKER)) {
    return null;
  }
  const match = JSON_BLOCK_RE.exec(body);
  if (!match) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return null;
  }
  const { ok, receipt } = validateReceipt(parsed);
  return ok ? receipt : null;
}

export function classifyReceipt(receipt) {
  const validation = validateReceipt(receipt);
  if (!validation.ok) {
    return {
      releasable: false,
      detail: 'untyped-hold-manual-release-required',
    };
  }
  const normalized = validation.receipt;
  const expectedSource = RELEASABLE_REASON_SOURCES[normalized.reason];
  if (!expectedSource) {
    return {
      releasable: false,
      detail: `held:unknown-reason:${normalized.reason}`,
    };
  }
  if (normalized.source !== expectedSource) {
    return {
      releasable: false,
      detail: `held:source-mismatch:${normalized.reason}:${normalized.source}`,
    };
  }
  return { releasable: true, detail: 'releasable' };
}

/**
 * Decide whether a queue-deferred hold may be lifted once fleet/live
 * checks agree. Typed mechanical receipts stay reason-bound. A missing or
 * structurally invalid receipt is an untyped ready hold — releasable unless
 * a human-policy label is present.
 */
export function classifyQueueDeferredHold({
  receipt = null,
  labels = [],
} = {}) {
  const humanHolds = humanPolicyHoldsOn(labels);
  if (humanHolds.length > 0) {
    return {
      releasable: false,
      detail: `human-policy-hold:${humanHolds.join(',')}`,
    };
  }
  if (receipt == null) {
    return { releasable: true, detail: 'untyped-ready-hold' };
  }
  const typed = classifyReceipt(receipt);
  if (
    !typed.releasable &&
    typed.detail === 'untyped-hold-manual-release-required'
  ) {
    return { releasable: true, detail: 'untyped-ready-hold' };
  }
  return typed;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function runCli(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);

  switch (command) {
    case 'render': {
      const body = renderReceiptComment({
        pr: Number.parseInt(String(args.pr ?? ''), 10),
        head: String(args.head ?? ''),
        reason: String(args.reason ?? ''),
        source: String(args.source ?? ''),
        deferredAt: args['deferred-at']
          ? String(args['deferred-at'])
          : undefined,
        note: args.note ? String(args.note) : undefined,
      });
      process.stdout.write(`${body}\n`);
      return 0;
    }
    case 'extract': {
      const receipt = extractReceiptFromComment(await readStdin());
      if (!receipt) {
        return 3;
      }
      process.stdout.write(`${JSON.stringify(receipt)}\n`);
      return 0;
    }
    case 'classify': {
      let parsed;
      try {
        parsed = JSON.parse(await readStdin());
      } catch {
        process.stdout.write('held:untyped-hold-manual-release-required\n');
        return 4;
      }
      const { releasable, detail } = classifyReceipt(parsed);
      process.stdout.write(`${releasable ? 'releasable' : detail}\n`);
      return releasable ? 0 : 4;
    }
    case 'human-policy-re': {
      process.stdout.write(`${humanPolicyHoldRegex()}\n`);
      return 0;
    }
    case 'classify-hold': {
      const labels = String(args.labels ?? '')
        .split(',')
        .map(name => name.trim())
        .filter(Boolean);
      const raw = (await readStdin()).trim();
      let receipt = null;
      if (raw.length > 0) {
        try {
          receipt = JSON.parse(raw);
        } catch {
          receipt = null;
        }
      }
      const { releasable, detail } = classifyQueueDeferredHold({
        receipt,
        labels,
      });
      process.stdout.write(`${detail}\n`);
      return releasable ? 0 : 4;
    }
    default:
      process.stderr.write(
        'usage: queue-deferral-receipt.mjs <render|extract|classify|classify-hold|human-policy-re> [options]\n'
      );
      return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli()
    .then(code => {
      process.exit(code);
    })
    .catch(err => {
      process.stderr.write(
        `${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(2);
    });
}
