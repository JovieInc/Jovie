#!/usr/bin/env node
/**
 * Typed queue-deferral receipt (`jovie-queue-deferral/v1`).
 *
 * `queue-deferred` is a hard hold on the auto-ready and merge-queue paths.
 * Historically the label had no provenance, so no controller could tell a
 * temporary mechanical hold (Symphony birth hold, queue-pressure deferral)
 * from an explicit repair/human hold — and nothing could safely release it.
 * This module is the canonical reader/writer of the typed receipt that makes
 * that distinction. The receipt is stored as one upserted PR comment carrying
 * the `<!-- bot-comment:queue-deferral -->` marker plus a fenced JSON block.
 *
 * Release contract (consumed by scripts/release-queue-deferred.sh):
 *   - schema, pr, head (40-hex), reason, source, deferredAt are required.
 *   - The receipt's head must equal the PR's exact current head.
 *   - Only RELEASABLE_REASONS are mechanical holds eligible for automatic
 *     release once required checks are green and a fresh GREEN fleet receipt
 *     exists. Any missing, malformed, head-stale, or unknown-reason receipt is
 *     an untyped hold and is never released automatically.
 *
 * CLI:
 *   render --pr <n> --head <sha> --reason <r> --source <s> [--note <text>]
 *          [--deferred-at <iso>]   print the full comment body
 *   validate                        read receipt JSON from stdin; print the
 *                                   normalized receipt; exit 2 on violations
 *   extract                         read a comment body from stdin; print the
 *                                   receipt JSON; exit 3 when absent/invalid
 *   classify                        read receipt JSON from stdin; print
 *                                   "releasable" (exit 0) or "held:<detail>"
 *                                   (exit 4)
 */

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

/**
 * @param {object} fields
 * @param {number} fields.pr
 * @param {string} fields.head
 * @param {string} fields.reason
 * @param {string} fields.source
 * @param {string} [fields.deferredAt]
 * @param {string} [fields.note]
 */
export function renderReceiptComment({
  pr,
  head,
  reason,
  source,
  deferredAt = new Date().toISOString(),
  note,
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

This PR carries a typed \`queue-deferred\` hold (reason: \`${reason}\`, source: \`${source}\`).
The queue-deferred release controller lifts this hold automatically once the
required checks are green on this exact head and a fresh GREEN fleet receipt
exists. A missing, malformed, or head-stale receipt is an untyped hold and is
never released automatically.`;
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
    case 'validate': {
      let parsed;
      try {
        parsed = JSON.parse(await readStdin());
      } catch {
        process.stderr.write('receipt is not valid JSON\n');
        return 2;
      }
      const { ok, errors, receipt } = validateReceipt(parsed);
      if (!ok) {
        process.stderr.write(`${errors.join('\n')}\n`);
        return 2;
      }
      process.stdout.write(`${JSON.stringify(receipt)}\n`);
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
    default:
      process.stderr.write(
        'usage: queue-deferral-receipt.mjs <render|validate|extract|classify> [options]\n'
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
