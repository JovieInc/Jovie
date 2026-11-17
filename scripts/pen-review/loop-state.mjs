/**
 * Pen review loop state: round decision and top-issue selection, frame
 * digests and the ready marker, the single-writer lease and the save guard.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { ownsLease } from './writer-identity.mjs';

export * from './frame-identity.mjs';

export const RECEIPT_SCHEMA = 'pen-review-receipt/v1';
export const LEASE_SCHEMA = 'pen-writer-lease/v1';
/** Two consecutive judge rounds with nothing material (Tim, 2026-11-01). */
export const QUIET_ROUNDS_TO_PASS = 2;
export const DEFAULT_MAX_ROUNDS = 8;

// ── Judges -> loop decision ──────────────────────────────────────────────

const CHECK_RANK = [
  'render',
  'artist-dignity',
  'private-ratings',
  'layout',
  'logo-size',
  'sidebar-badge',
  'sidebar-detached-button',
  'elevation',
  'accent',
  'contrast',
  'dead-end',
  'claims',
  'one-primary',
  'touch-target',
  'ds-tokens',
  'ds-radius',
  'ds-spacing',
  'type-scale',
  'type-family',
  'optical-axis',
  'grid',
  'casing',
  'copy',
];

/**
 * One round's evidence -> what happens next.
 * checks: findings[]; gates: Clef receipt; judges: [{persona, material, confirmed, issue}].
 */
export function decideRound({
  checks = [],
  gates = null,
  judges = [],
  quietRounds = 0,
  complete = true,
  round = 0,
  maxRounds = DEFAULT_MAX_ROUNDS,
}) {
  const blocks = checks.filter(f => f.severity === 'block');
  const gateFails = gates?.failed ?? [];
  const confirmed = judges.filter(j => j.material && j.confirmed);
  const material = blocks.length + gateFails.length + confirmed.length;
  const issue = topIssue({ blocks, gateFails, gates, confirmed });
  if (material === 0 && !complete)
    return {
      action: round + 1 >= maxRounds ? 'fail' : 'rejudge',
      quietRounds: 0,
      topIssue: null,
      incomplete: true,
    };
  if (material === 0) {
    const quiet = quietRounds + 1;
    if (quiet >= QUIET_ROUNDS_TO_PASS)
      return { action: 'pass', quietRounds: quiet, topIssue: null };
    return { action: 'rejudge', quietRounds: quiet, topIssue: null };
  }
  if (round + 1 >= maxRounds)
    return { action: 'fail', quietRounds: 0, topIssue: issue, material };
  return { action: 'fix', quietRounds: 0, topIssue: issue, material };
}

export function topIssue({
  blocks = [],
  gateFails = [],
  gates = null,
  confirmed = [],
}) {
  if (blocks.length) {
    const ranked = [...blocks].sort((a, b) => rank(a.check) - rank(b.check));
    const head = ranked[0];
    const same = ranked.filter(f => f.check === head.check);
    return {
      source: 'check',
      check: head.check,
      message: head.message,
      nodes: same.map(f => f.node),
      detail: same.slice(0, 12),
    };
  }
  if (gateFails.length) {
    const id = [...gateFails].sort(
      (a, b) =>
        (gates.rules[b]?.pViolation ?? 0) - (gates.rules[a]?.pViolation ?? 0)
    )[0];
    return {
      source: 'clef-gate',
      check: id,
      message: `Clef gate ${id} p=${gates.rules[id]?.pViolation}`,
      nodes: [],
    };
  }
  const votes = new Map();
  for (const j of confirmed) {
    const k = j.key ?? j.issue;
    votes.set(k, [...(votes.get(k) ?? []), j]);
  }
  const best = [...votes.values()].sort(
    (a, b) => b.length - a.length || (b[0].p ?? 0) - (a[0].p ?? 0)
  )[0];
  return best
    ? {
        source: 'judge',
        check: 'judge',
        message: best[0].issue,
        fix: best[0].fix,
        element: best[0].element,
        personas: best.map(j => j.persona),
        nodes: [],
      }
    : null;
}

const rank = c => {
  const i = CHECK_RANK.indexOf(c);
  return i < 0 ? CHECK_RANK.length : i;
};

// ── Digest, receipts ─────────────────────────────────────────────────────

// ── Single-writer lease (shared by every agent that writes the canvas) ──

/** Serialize lease read/replace/release. A crashed or unreadable lock fails closed. */
function withLeaseLock(path, busy, operation) {
  mkdirSync(dirname(path), { recursive: true });
  const lock = `${path}.lock`;
  try {
    mkdirSync(lock);
  } catch (error) {
    if (error.code === 'EEXIST') return busy;
    throw error;
  }
  try {
    return operation();
  } finally {
    rmdirSync(lock);
  }
}

/**
 * @param {string} path
 * @param {{holder?: string, scope?: string|null, ttlMs?: number, now?: () => number, renewOnly?: boolean, token?: string}} [opts]
 */
export function acquireLease(
  path,
  {
    holder,
    scope,
    ttlMs = 15 * 60_000,
    now = Date.now,
    renewOnly = false,
    token,
  } = {}
) {
  if (!holder) throw new Error('lease holder is required');
  return withLeaseLock(path, { ok: false, heldBy: readLease(path) }, () => {
    const cur = readLease(path);
    const active = cur && Date.parse(cur.expiresAt) > now();
    const ours = ownsLease(cur, holder, token);
    // Never reclaim an empty/partially written/corrupt lease, including one
    // created by an older client. Expired takeovers are serialized too.
    if (
      (existsSync(path) &&
        (!cur || !Number.isFinite(Date.parse(cur.expiresAt)))) ||
      (active && !ours) ||
      (renewOnly && (!active || !ours))
    )
      return { ok: false, heldBy: cur };
    const body = {
      schema: LEASE_SCHEMA,
      holder,
      scope: scope ?? null,
      pid: process.pid,
      token: token ?? null,
      acquiredAt:
        active && ours ? cur.acquiredAt : new Date(now()).toISOString(),
      expiresAt: new Date(now() + ttlMs).toISOString(),
    };
    writeAtomic(path, body);
    return { ok: true, lease: body, renewed: Boolean(active && ours) };
  });
}

/** Renew at operation boundaries, including after awaits; always release on failure. */
export async function withWriterLease(path, options, operation) {
  const lease = acquireLease(path, options);
  if (!lease.ok)
    return { ...lease, skipped: true, reason: 'writer lease held' };
  const assertLease = () => {
    const renewed = acquireLease(path, { ...options, renewOnly: true });
    if (!renewed.ok) throw new Error('writer lease lost');
  };
  try {
    return await operation(assertLease);
  } finally {
    releaseLease(path, options.holder, options.token);
  }
}

export function readLease(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function releaseLease(path, holder, token = undefined) {
  return withLeaseLock(path, false, () => {
    if (!existsSync(path)) return true;
    const cur = readLease(path);
    if (!ownsLease(cur, holder, token)) return false;
    unlinkSync(path);
    return true;
  });
}

function writeAtomic(path, value) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}

/**
 * Save guard: top-level nodes that differ between the live canvas and disk
 * but were not touched by this writer are someone else's unsaved work; a save
 * would publish it (2026-11-01: a golden-path save wrote T1E2z and BVsfD).
 * live/disk = {id: signature}. Returns the foreign ids; save only when empty.
 */
export function foreignUnsaved(live, disk, touched = new Set()) {
  const ids = new Set([...Object.keys(live), ...Object.keys(disk)]);
  return [...ids]
    .filter(id => live[id] !== disk[id] && !touched.has(id))
    .sort();
}

/** p50/p95 over stage durations, for the ledger summary. */
export function percentiles(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = q =>
    v.length ? v[Math.min(v.length - 1, Math.ceil(q * v.length) - 1)] : null;
  return { n: v.length, p50: at(0.5), p95: at(0.95) };
}
