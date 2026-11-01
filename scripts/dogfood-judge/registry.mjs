// Surface registry for the dogfood judge: ROI ordering, coverage, model
// binding resolution, fingerprints and model-change invalidation. Pure
// except for the explicit file reads in resolveBindings.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUBRIC_VERSION } from './rubric.mjs';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const SURFACES_PATH = 'scripts/dogfood-judge/surfaces.json';
export const CAPACITY_PATH = 'ops/registry/capacity.json';

export function readSurfaces(root = REPO_ROOT) {
  return JSON.parse(readFileSync(join(root, SURFACES_PATH), 'utf8'));
}

export function roiScore(surface, weights) {
  const roi = surface.roi ?? {};
  return (
    (roi.goldenPath ? weights.goldenPath : 0) +
    (roi.revenue ?? 0) * weights.revenue +
    (roi.traffic ?? 0) * weights.traffic
  );
}

export function byRoi(registry) {
  return [...registry.surfaces].sort(
    (a, b) =>
      roiScore(b, registry.roiWeights) - roiScore(a, registry.roiWeights)
  );
}

/** Extract `export const NAME = 'value'` from a TS source string. */
export function readTsConst(source, name) {
  const match = source.match(
    new RegExp(`export const ${name}(?::[^=]+)?\\s*=\\s*['"]([^'"]+)['"]`, 'u')
  );
  return match ? match[1] : null;
}

function capacityRoleModel(capacity, role) {
  const candidates = capacity.roles?.[role]?.candidates ?? [];
  const available = candidates.filter(
    c => c.availability?.status === 'available'
  );
  const pick = available.find(c => c.preferred) ?? available[0] ?? null;
  return pick ? pick.model : null;
}

/**
 * Resolve every binding source to its current model id. A binding that cannot
 * be resolved resolves to null, and a null binding never matches a receipt,
 * so an unreadable source invalidates rather than passes.
 */
export function resolveBindings(registry, root = REPO_ROOT) {
  const fileCache = new Map();
  const read = rel => {
    if (!fileCache.has(rel)) {
      try {
        fileCache.set(rel, readFileSync(join(root, rel), 'utf8'));
      } catch {
        fileCache.set(rel, null);
      }
    }
    return fileCache.get(rel);
  };
  let capacity = null;
  try {
    capacity = JSON.parse(read(CAPACITY_PATH) ?? 'null');
  } catch {
    capacity = null;
  }
  /** @type {Record<string, string | null>} */
  const resolved = {};
  for (const [name, source] of Object.entries(registry.bindingSources)) {
    let value = null;
    if (source.kind === 'ts-const') {
      const text = read(source.file);
      value = text ? readTsConst(text, source.name) : null;
    } else if (source.kind === 'capacity-family') {
      value =
        capacity?.modelFamilies?.families?.[source.family]?.latest ?? null;
    } else if (source.kind === 'capacity-role') {
      value = capacity ? capacityRoleModel(capacity, source.role) : null;
    } else if (source.kind === 'judge-tier') {
      value = registry.judge?.tiers?.[source.tier] ?? null;
    }
    resolved[name] = value;
  }
  return resolved;
}

/** Bindings that determine a surface's verdict: its own models plus the judge's. */
export function surfaceBindings(surface, resolved) {
  const names = [
    ...new Set([...(surface.models ?? []), 'judge-screen', 'judge-confirm']),
  ].sort();
  return Object.fromEntries(names.map(name => [name, resolved[name] ?? null]));
}

export function fingerprint(bindings) {
  const body = JSON.stringify({ rubric: RUBRIC_VERSION, bindings });
  return `sha256:${createHash('sha256').update(body).digest('hex').slice(0, 32)}`;
}

/**
 * Compare a receipt with the current world. Returns the reasons it is no
 * longer valid (empty = still valid).
 */
export function receiptStaleness(
  receipt,
  surface,
  resolved,
  { now = Date.now(), maxAgeDays = 7 } = {}
) {
  const reasons = [];
  if (!receipt) return ['no-receipt'];
  if (receipt.rubricVersion !== RUBRIC_VERSION)
    reasons.push(`rubric-changed:${receipt.rubricVersion}->${RUBRIC_VERSION}`);
  const current = surfaceBindings(surface, resolved);
  for (const [name, model] of Object.entries(current)) {
    const was = receipt.bindings?.[name];
    if (model === null) reasons.push(`binding-unresolved:${name}`);
    else if (was !== model)
      reasons.push(`model-changed:${name}:${was ?? 'none'}->${model}`);
  }
  const age = (now - Date.parse(receipt.judgedAt ?? 0)) / 86_400_000;
  if (!(age <= maxAgeDays))
    reasons.push(`expired:${Number.isFinite(age) ? age.toFixed(1) : '?'}d`);
  return reasons;
}

/**
 * Event-driven invalidation: given the bindings before and after a change,
 * return the surfaces whose receipts must be re-recorded and re-judged, and
 * whether the judge itself must re-calibrate against Tim's rejection set.
 */
export function invalidationPlan(registry, before, after) {
  const changed = Object.keys({ ...before, ...after }).filter(
    name => before[name] !== after[name]
  );
  const judgeChanged = changed.some(name => name.startsWith('judge-'));
  const surfaces = registry.surfaces
    .filter(
      surface =>
        judgeChanged ||
        (surface.models ?? []).some(name => changed.includes(name))
    )
    .map(surface => ({
      id: surface.id,
      status: surface.status,
      recorder: surface.recorder,
      changed: judgeChanged
        ? changed
        : changed.filter(name => (surface.models ?? []).includes(name)),
    }));
  return {
    changed: changed.map(name => ({
      binding: name,
      from: before[name] ?? null,
      to: after[name] ?? null,
    })),
    recalibrateJudge: judgeChanged,
    surfaces,
  };
}

/**
 * Coverage = judged surfaces with a currently valid passing receipt / all
 * surfaces. `next` is the queued surface Summer should promote, and only
 * when every judged surface is green.
 * @param {Record<string, any>} receipts latest receipt per surface id
 */
export function coverage(registry, receipts, resolved, opts = {}) {
  const rows = byRoi(registry).map(surface => {
    const receipt = receipts[surface.id] ?? null;
    const stale =
      surface.status === 'judged'
        ? receiptStaleness(receipt, surface, resolved, {
            ...opts,
            maxAgeDays: registry.judge?.maxReceiptAgeDays ?? 7,
          })
        : ['not-yet-judged'];
    const green =
      surface.status === 'judged' &&
      stale.length === 0 &&
      receipt?.verdict === 'pass';
    return {
      id: surface.id,
      status: surface.status,
      roiScore: roiScore(surface, registry.roiWeights),
      verdict: receipt?.verdict ?? null,
      green,
      stale,
    };
  });
  const judged = rows.filter(row => row.status === 'judged');
  const allJudgedGreen = judged.length > 0 && judged.every(row => row.green);
  const next = allJudgedGreen
    ? (rows.find(row => row.status === 'queued') ?? null)
    : null;
  return {
    total: rows.length,
    judged: judged.length,
    green: rows.filter(row => row.green).length,
    coverage: rows.length
      ? rows.filter(row => row.green).length / rows.length
      : 0,
    judgedShare: rows.length ? judged.length / rows.length : 0,
    allJudgedGreen,
    next: next ? next.id : null,
    blockedExpansionBy: allJudgedGreen
      ? []
      : judged.filter(row => !row.green).map(row => row.id),
    rows,
  };
}
