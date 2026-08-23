import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const INVARIANT_REGISTRY_PATH = 'canon/invariants.jsonl';
export const INVARIANT_REGISTRY_SCHEMA = 'jovie-invariant-registry/v1';
export const INVARIANT_STATES = new Set(['binding', 'adopted', 'superseded']);

const DEFAULT_REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const REQUIRED_FIELDS = [
  'id',
  'title',
  'statement',
  'scope',
  'authority',
  'effective',
  'precedence',
  'policy',
  'enforcementConsumers',
  'evidence',
  'lifecycle',
];

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function intersects(left = [], right = []) {
  return (
    left.includes('*') ||
    right.includes('*') ||
    left.some(item => right.includes(item))
  );
}

function overlaps(left, right) {
  return (
    intersects(left.scope?.products, right.scope?.products) &&
    intersects(left.scope?.surfaces, right.scope?.surfaces)
  );
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function push(errors, invariant, detail) {
  errors.push(`${invariant?.id || '<unknown>'}: ${detail}`);
}

export function readInvariantRegistry(repoRoot = DEFAULT_REPO_ROOT) {
  const rows = readFileSync(resolve(repoRoot, INVARIANT_REGISTRY_PATH), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
  const [metadata, ...invariants] = rows;
  return { ...metadata, invariants };
}

export function validateInvariantRegistry(
  registry,
  { repoRoot = DEFAULT_REPO_ROOT, verifyBindings = true } = {}
) {
  const errors = [];
  const blockers = [];
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    return { ok: false, errors: ['registry must be an object'], blockers };
  }
  if (registry.schema !== INVARIANT_REGISTRY_SCHEMA) {
    errors.push(`schema must be ${INVARIANT_REGISTRY_SCHEMA}`);
  }
  if (!Array.isArray(registry.invariants) || registry.invariants.length === 0) {
    errors.push('registry must contain at least one invariant');
    return { ok: false, errors, blockers };
  }

  const byId = new Map();
  for (const invariant of registry.invariants) {
    for (const field of REQUIRED_FIELDS) {
      if (invariant?.[field] === undefined || invariant?.[field] === null) {
        push(errors, invariant, `missing ${field}`);
      }
    }
    if (!/^JOV-INV-[0-9]{3}$/.test(invariant?.id || '')) {
      push(errors, invariant, 'id must match JOV-INV-NNN');
    } else if (byId.has(invariant.id)) {
      push(errors, invariant, 'duplicate stable identity');
    } else {
      byId.set(invariant.id, invariant);
    }
    if (
      !Array.isArray(invariant?.scope?.products) ||
      !invariant.scope.products.length
    ) {
      push(errors, invariant, 'scope.products must be non-empty');
    }
    if (
      !Array.isArray(invariant?.scope?.surfaces) ||
      !invariant.scope.surfaces.length
    ) {
      push(errors, invariant, 'scope.surfaces must be non-empty');
    }
    if (
      !hasText(invariant?.authority?.owner) ||
      !hasText(invariant?.authority?.approvedBy)
    ) {
      push(errors, invariant, 'authority owner and approvedBy are required');
    }
    if (
      !hasText(invariant?.effective?.date) ||
      !Number.isInteger(invariant?.effective?.version)
    ) {
      push(
        errors,
        invariant,
        'effective date and integer version are required'
      );
    }
    if (!Number.isInteger(invariant?.precedence)) {
      push(errors, invariant, 'precedence must be an integer');
    }
    if (
      !hasText(invariant?.policy?.key) ||
      invariant?.policy?.value === undefined
    ) {
      push(errors, invariant, 'policy key and value are required');
    }
    if (!INVARIANT_STATES.has(invariant?.lifecycle?.state)) {
      push(errors, invariant, 'lifecycle state is invalid');
    }

    const consumers = invariant?.enforcementConsumers;
    const deliberateRed = invariant?.evidence?.deliberateRed;
    if (invariant?.lifecycle?.state === 'adopted') {
      if (!Array.isArray(consumers) || consumers.length === 0) {
        push(errors, invariant, 'adopted invariant has no production consumer');
      }
      if (!Array.isArray(deliberateRed) || deliberateRed.length === 0) {
        push(
          errors,
          invariant,
          'adopted invariant has no deliberate-red evidence'
        );
      }
    } else if (invariant?.lifecycle?.state === 'binding') {
      blockers.push(`${invariant.id}: binding is incomplete`);
    }

    for (const consumer of verifyBindings ? consumers || [] : []) {
      const path = resolve(repoRoot, consumer.path || '');
      if (
        !hasText(consumer.name) ||
        !hasText(consumer.path) ||
        !existsSync(path)
      ) {
        push(
          errors,
          invariant,
          `invalid or missing consumer ${consumer.path || '<missing>'}`
        );
        continue;
      }
      if (!readFileSync(path, 'utf8').includes(invariant.id)) {
        push(
          errors,
          invariant,
          `consumer ${consumer.path} does not bind ${invariant.id}`
        );
      }
    }
    for (const evidence of verifyBindings
      ? [...(invariant?.evidence?.tests || []), ...(deliberateRed || [])]
      : []) {
      const path = resolve(repoRoot, evidence.path || '');
      if (
        !hasText(evidence.path) ||
        !hasText(evidence.name) ||
        !existsSync(path)
      ) {
        push(
          errors,
          invariant,
          `invalid or missing evidence ${evidence.path || '<missing>'}`
        );
        continue;
      }
      if (!readFileSync(path, 'utf8').includes(evidence.name)) {
        push(
          errors,
          invariant,
          `evidence ${evidence.path} does not name ${evidence.name}`
        );
      }
    }
  }

  for (let index = 0; index < registry.invariants.length; index += 1) {
    const left = registry.invariants[index];
    for (const right of registry.invariants.slice(index + 1)) {
      if (left.policy?.key !== right.policy?.key || !overlaps(left, right))
        continue;
      if (stable(left.policy.value) === stable(right.policy.value)) continue;
      const leftSupersedes = left.lifecycle?.supersedes?.includes(right.id);
      const rightSupersedes = right.lifecycle?.supersedes?.includes(left.id);
      const explicit =
        (leftSupersedes &&
          right.lifecycle?.state === 'superseded' &&
          right.lifecycle?.supersededBy === left.id) ||
        (rightSupersedes &&
          left.lifecycle?.state === 'superseded' &&
          left.lifecycle?.supersededBy === right.id);
      if (!explicit) {
        const newest = [left, right]
          .filter(item => item.authority?.approvedBy === 'Founder')
          .sort((a, b) =>
            `${b.effective.date}:${b.effective.version}`.localeCompare(
              `${a.effective.date}:${a.effective.version}`
            )
          )[0];
        errors.push(
          `${left.id}/${right.id}: contradictory ${left.policy.key} overlaps without explicit supersession${newest ? `; newest founder-approved candidate is ${newest.id}` : ''}`
        );
      }
    }
  }

  for (const invariant of registry.invariants) {
    for (const target of invariant.lifecycle?.supersedes || []) {
      if (!byId.has(target))
        push(errors, invariant, `supersedes unknown ${target}`);
    }
  }
  return { ok: errors.length === 0 && blockers.length === 0, errors, blockers };
}

export function invariantPolicy(id, registry = readInvariantRegistry()) {
  const invariant = registry.invariants.find(item => item.id === id);
  if (!invariant || invariant.lifecycle.state !== 'adopted') {
    throw new Error(`invariant ${id} is not adopted`);
  }
  return invariant.policy.value;
}

// Production consumer bindings: JOV-INV-001, JOV-INV-002, JOV-INV-003, JOV-INV-004.
