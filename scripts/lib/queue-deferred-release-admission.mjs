/**
 * Exact-head admission evidence for the one controller allowed to lift a
 * `queue-deferred` hold.  This closes the gap between label removal (which
 * wakes auto-enrollment) and native enrollment: an unlabeled event alone is
 * never authority while the fleet controller is degraded.
 */

export const QUEUE_DEFERRED_RELEASE_SCHEMA =
  'jovie-queue-deferred-release/v1';
export const QUEUE_DEFERRED_RELEASE_MARKER =
  '<!-- bot-comment:queue-deferred-release -->';
export const QUEUE_DEFERRED_RELEASE_ACTOR = 'jovie-bot[bot]';

const SHA = /^[0-9a-f]{40}$/;
const FALLBACK_REASON_CODES = new Set(['controller-failure', 'queue-unknown']);

function exactSha(value) {
  return typeof value === 'string' && SHA.test(value);
}

/**
 * The controller may continue a previously-held exact head when Gem's local
 * observation endpoint alone is unavailable.  It is deliberately not a
 * general AMBER promotion exception: main and production must be green and
 * bound, integrity clear, and every AMBER reason must be the two observation
 * failures below.  RED, unknown source/production, and any product/integrity
 * signal remain fail-closed.
 */
export function evaluateQueueDeferredReleaseFleetGate(receipt, now = Date.now()) {
  if (!receipt || typeof receipt !== 'object') {
    return { allowed: false, mode: null, reason: 'fleet-receipt-malformed' };
  }
  const observed = Date.parse(String(receipt.observedAt ?? ''));
  if (!Number.isFinite(observed) || Math.abs(now - observed) > 10 * 60_000) {
    return { allowed: false, mode: null, reason: 'fleet-receipt-stale' };
  }
  if (receipt.state === 'GREEN' && receipt?.promotionAdmission?.allowed === true) {
    return { allowed: true, mode: 'normal', reason: 'fleet-green' };
  }

  const reasons = Array.isArray(receipt.reasons) ? receipt.reasons : [];
  const onlyObservationFailures =
    receipt.state === 'AMBER' &&
    reasons.length > 0 &&
    reasons.every(
      reason =>
        reason &&
        reason.severity === 'warning' &&
        FALLBACK_REASON_CODES.has(reason.code)
    );
  const main = receipt?.signals?.main;
  const production = receipt?.signals?.production;
  const integrity = receipt?.signals?.integrity;
  const bound =
    exactSha(main?.sha) &&
    exactSha(production?.deployedSha) &&
    main.sha === production.deployedSha;
  if (
    onlyObservationFailures &&
    main?.status === 'green' &&
    production?.status === 'green' &&
    bound &&
    ['clear', 'resolved'].includes(integrity?.status)
  ) {
    return {
      allowed: true,
      mode: 'deferred-release-only',
      reason: 'controller-observation-fallback',
    };
  }
  return {
    allowed: false,
    mode: null,
    reason: `fleet-gate-not-releasable:${String(receipt.state ?? 'unknown')}`,
  };
}

export function validateQueueDeferredRelease(candidate, now = Date.now()) {
  const errors = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, errors: ['receipt must be an object'], receipt: null };
  }
  if (candidate.schema !== QUEUE_DEFERRED_RELEASE_SCHEMA) {
    errors.push(`schema must be ${QUEUE_DEFERRED_RELEASE_SCHEMA}`);
  }
  if (!Number.isInteger(candidate.pr) || candidate.pr < 1) {
    errors.push('pr must be a positive integer');
  }
  if (!exactSha(candidate.head)) errors.push('head must be an exact lowercase SHA');
  if (typeof candidate.releasedAt !== 'string' || !Number.isFinite(Date.parse(candidate.releasedAt))) {
    errors.push('releasedAt must be an ISO timestamp');
  }
  if (!['normal', 'deferred-release-only'].includes(candidate.mode)) {
    errors.push('mode must be normal or deferred-release-only');
  }
  if (typeof candidate.reason !== 'string' || candidate.reason.length === 0) {
    errors.push('reason must be non-empty');
  }
  if (errors.length) return { ok: false, errors, receipt: null };
  const releasedAt = new Date(candidate.releasedAt).toISOString();
  if (Math.abs(now - Date.parse(releasedAt)) > 15 * 60_000) {
    return { ok: false, errors: ['release receipt is stale'], receipt: null };
  }
  return {
    ok: true,
    errors: [],
    receipt: {
      schema: QUEUE_DEFERRED_RELEASE_SCHEMA,
      pr: candidate.pr,
      head: candidate.head,
      releasedAt,
      mode: candidate.mode,
      reason: candidate.reason,
    },
  };
}

export function renderQueueDeferredReleaseComment(input) {
  const { ok, errors, receipt } = validateQueueDeferredRelease(input);
  if (!ok) throw new Error(errors.join('; '));
  return `${QUEUE_DEFERRED_RELEASE_MARKER}\n## Queue Deferred Release Receipt\n\n\`\`\`json\n${JSON.stringify(receipt, null, 2)}\n\`\`\`\n\nController-owned exact-head release. Native enrollment may proceed only for this receipt's PR/head.`;
}

export function extractQueueDeferredRelease(body, now = Date.now()) {
  if (typeof body !== 'string' || !body.includes(QUEUE_DEFERRED_RELEASE_MARKER)) {
    return null;
  }
  const match = body.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    const result = validateQueueDeferredRelease(JSON.parse(match[1]), now);
    return result.ok ? result.receipt : null;
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    result[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return result;
}

async function stdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export async function runCli(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  if (command === 'fleet') {
    let value;
    try {
      value = JSON.parse(await stdin());
    } catch {
      process.stdout.write('{"allowed":false,"reason":"fleet-receipt-malformed"}\n');
      return 2;
    }
    const result = evaluateQueueDeferredReleaseFleetGate(value);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result.allowed ? 0 : 2;
  }
  if (command === 'render') {
    const body = renderQueueDeferredReleaseComment({
      schema: QUEUE_DEFERRED_RELEASE_SCHEMA,
      pr: Number(args.pr),
      head: args.head,
      releasedAt: args['released-at'] ?? new Date().toISOString(),
      mode: args.mode,
      reason: args.reason,
    });
    process.stdout.write(`${body}\n`);
    return 0;
  }
  if (command === 'extract') {
    const receipt = extractQueueDeferredRelease(await stdin());
    if (!receipt) return 3;
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    return 0;
  }
  throw new Error('Usage: queue-deferred-release-admission.mjs <fleet|render|extract>');
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  runCli().then(code => process.exitCode = code).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
