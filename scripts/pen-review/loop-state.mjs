/**
 * Pen review loop state: round decision and top-issue selection, frame
 * digests and the ready marker, the single-writer lease and the save guard.
 */

import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

export const RECEIPT_SCHEMA = 'pen-review-receipt/v1';
export const LEASE_SCHEMA = 'pen-writer-lease/v1';
export const READY_SUFFIX = ' · ready for Tim';
/** "PROPOSAL / …" at the start or "· PROPOSAL" as a segment; never the big "PROPOSAL AREA" boards. */
export const PROPOSAL_RE = /^PROPOSAL\s*[/·]|·\s*PROPOSAL\s*(?:·|$)/;
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
  'contrast',
  'dead-end',
  'claims',
  'one-primary',
  'touch-target',
  'ds-tokens',
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
  round = 0,
  maxRounds = DEFAULT_MAX_ROUNDS,
}) {
  const blocks = checks.filter(f => f.severity === 'block');
  const gateFails = gates?.failed ?? [];
  const confirmed = judges.filter(j => j.material && j.confirmed);
  const material = blocks.length + gateFails.length + confirmed.length;
  const issue = topIssue({ blocks, gateFails, gates, confirmed });
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

/** Content digest of a frame, ignoring its own name (the ready marker). */
export function frameDigest(tree) {
  const { name: _name, ...rest } = tree ?? {};
  return createHash('sha256').update(stableJson(rest)).digest('hex');
}

export function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .map(k => `${JSON.stringify(k)}:${stableJson(v[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

export function stripReady(name) {
  return String(name ?? '').replace(/ · ready for Tim(?: r[0-9a-f]{8})?$/, '');
}

export function markReady(name, receiptHash) {
  return `${stripReady(name)}${READY_SUFFIX} r${String(receiptHash).slice(0, 8)}`;
}

export function isProposalFrame(node) {
  return Boolean(node?.name) && PROPOSAL_RE.test(stripReady(node.name).trim());
}

// ── Single-writer lease (shared by every agent that writes the canvas) ──

/**
 * The Pen canvas has one writer at a time (Jovie .claude/rules/pen.md). A
 * lease is a JSON file created with O_EXCL; an expired lease may be taken
 * over, a live foreign lease never. `scope` names what the holder may write
 * (for example "proposal-frames"); saves must also pass foreignUnsaved().
 */
/**
 * @param {string} path
 * @param {{holder?: string, scope?: string|null, ttlMs?: number, now?: () => number}} [opts]
 */
export function acquireLease(
  path,
  { holder, scope, ttlMs = 15 * 60_000, now = Date.now } = {}
) {
  if (!holder) throw new Error('lease holder is required');
  mkdirSync(dirname(path), { recursive: true });
  const body = {
    schema: LEASE_SCHEMA,
    holder,
    scope: scope ?? null,
    pid: process.pid,
    acquiredAt: new Date(now()).toISOString(),
    expiresAt: new Date(now() + ttlMs).toISOString(),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, 'wx');
      writeFileSync(fd, `${JSON.stringify(body)}\n`);
      closeSync(fd);
      return { ok: true, lease: body };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const cur = readLease(path);
      if (cur && cur.holder === holder) {
        writeAtomic(path, { ...body, acquiredAt: cur.acquiredAt });
        return {
          ok: true,
          lease: { ...body, acquiredAt: cur.acquiredAt },
          renewed: true,
        };
      }
      if (cur && Date.parse(cur.expiresAt) > now())
        return { ok: false, heldBy: cur };
      try {
        unlinkSync(path); // expired or unreadable: take over once
      } catch {
        // Another taker won the race; the retry sees its lease.
      }
    }
  }
  const cur = readLease(path);
  return { ok: false, heldBy: cur };
}

export function readLease(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function releaseLease(path, holder) {
  const cur = readLease(path);
  if (cur && cur.holder !== holder) return false;
  try {
    unlinkSync(path);
  } catch {
    // Already gone.
  }
  return true;
}

function writeAtomic(path, value) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value)}\n`);
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
