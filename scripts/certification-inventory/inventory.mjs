#!/usr/bin/env node
/** Certification inventory validator (JOV-7328).
 *
 * Canonical bootstrap denominator for certifiable objects: every in-scope
 * capability, surface, and experience is listed once, classified, and bound to
 * its prerequisite DAG. The governor selects work by dependency-aware value;
 * this file only guarantees the graph is truthful and schedulable — it does
 * not issue certificates (that stays with `jovie.certification/v1`).
 *
 * Usage: node scripts/certification-inventory/inventory.mjs [path]
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const INVENTORY_SCHEMA = 'jovie.certification-inventory/v1';
export const INVENTORY_PATH = 'scripts/certification-inventory/inventory.json';

export const LAYERS = new Set(['capability', 'surface', 'experience']);
export const STATUSES = new Set([
  'certified-current',
  'certified-stale',
  'running',
  'blocked',
  'failed',
  'never-evaluated',
  'retired',
]);
export const RISKS = new Set(['revenue-critical', 'high', 'medium', 'low']);

const OBJECT_ID = /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9-]{1,79}$/u;
const JOURNEY_ID = /^journey:[a-z0-9][a-z0-9-]{1,79}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;

const OBJECT_FIELDS = [
  'id',
  'title',
  'layer',
  'status',
  'owner',
  'prerequisites',
  'journeys',
  'surfaces',
  'risk',
  'uiRequired',
  'expectedEvidence',
  'issues',
];

/** @returns {never} */
function fail(message) {
  throw new Error(`certification-inventory: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0)
    fail(`${label}: expected non-empty string`);
  return value;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {{ pattern?: RegExp, allowEmpty?: boolean }} [options]
 */
function requireStringArray(value, label, { pattern, allowEmpty = true } = {}) {
  if (!Array.isArray(value)) fail(`${label}: expected array`);
  if (!allowEmpty && value.length === 0) fail(`${label}: expected non-empty`);
  value.forEach((item, index) => {
    requireString(item, `${label}[${index}]`);
    if (pattern && !pattern.test(item))
      fail(`${label}[${index}]: invalid id ${JSON.stringify(item)}`);
  });
  if (new Set(value).size !== value.length) fail(`${label}: duplicate entries`);
  return value;
}

export function validateObject(object) {
  const label = `object ${JSON.stringify(object?.id ?? '<missing id>')}`;
  if (!isRecord(object)) fail(`${label}: expected object`);
  const keys = Object.keys(object);
  if (keys.some(key => !OBJECT_FIELDS.includes(key)))
    fail(`${label}: unexpected field`);
  if (OBJECT_FIELDS.some(key => !(key in object)))
    fail(`${label}: missing field`);

  if (!OBJECT_ID.test(object.id)) fail(`${label}: invalid id`);
  requireString(object.title, `${label}.title`);

  if (!LAYERS.has(object.layer)) fail(`${label}: invalid layer`);
  const expectedPrefix = `${object.layer}:`;
  if (!object.id.startsWith(expectedPrefix))
    fail(`${label}: id must start with ${expectedPrefix}`);

  if (!STATUSES.has(object.status)) fail(`${label}: invalid status`);
  requireString(object.owner, `${label}.owner`);
  if (!RISKS.has(object.risk)) fail(`${label}: invalid risk`);
  if (typeof object.uiRequired !== 'boolean')
    fail(`${label}: uiRequired must be boolean`);

  requireStringArray(object.prerequisites, `${label}.prerequisites`, {
    pattern: OBJECT_ID,
  });
  if (object.prerequisites.includes(object.id))
    fail(`${label}: self-dependency`);
  requireStringArray(object.journeys, `${label}.journeys`, {
    pattern: JOURNEY_ID,
  });
  requireStringArray(object.surfaces, `${label}.surfaces`);
  requireStringArray(object.expectedEvidence, `${label}.expectedEvidence`, {
    allowEmpty: false,
  });
  requireStringArray(object.issues, `${label}.issues`);

  if (object.layer === 'experience' && object.journeys.length === 0)
    fail(`${label}: experience must bind at least one journey`);
  if (object.layer !== 'surface' && object.surfaces.length === 0)
    fail(`${label}: capability/experience must name supported surfaces`);
  return object;
}

/** DFS over the prerequisite DAG; throws on cycles or dangling references. */
export function assertAcyclic(objects) {
  const byId = new Map(objects.map(object => [object.id, object]));
  for (const object of objects) {
    for (const prerequisite of object.prerequisites) {
      if (!byId.has(prerequisite))
        fail(`${object.id}: unknown prerequisite ${prerequisite}`);
    }
  }
  const visiting = new Set();
  const done = new Set();
  const visit = id => {
    if (done.has(id)) return;
    if (visiting.has(id)) fail(`dependency cycle at ${id}`);
    visiting.add(id);
    for (const prerequisite of byId.get(id).prerequisites) visit(prerequisite);
    visiting.delete(id);
    done.add(id);
  };
  for (const object of objects) visit(object.id);
}

export function validateInventory(data) {
  if (!isRecord(data)) fail('expected object');
  if (data.schema !== INVENTORY_SCHEMA) fail('invalid schema');
  requireString(data.inventoryVersion, 'inventoryVersion');
  requireString(data.issue, 'issue');
  if (!ISO.test(requireString(data.asOf, 'asOf'))) fail('asOf: expected ISO');
  if (!Array.isArray(data.objects) || data.objects.length === 0)
    fail('objects: expected non-empty array');
  data.objects.forEach(validateObject);
  const ids = data.objects.map(object => object.id);
  if (new Set(ids).size !== ids.length) fail('duplicate object ids');
  assertAcyclic(data.objects);
  return data;
}

/** All objects that directly or transitively depend on `id`. */
export function dependentsOf(objects, id) {
  const direct = new Map();
  for (const object of objects) {
    for (const prerequisite of object.prerequisites) {
      if (!direct.has(prerequisite)) direct.set(prerequisite, new Set());
      direct.get(prerequisite).add(object.id);
    }
  }
  const result = new Set();
  const queue = [...(direct.get(id) ?? [])];
  while (queue.length > 0) {
    const next = queue.pop();
    if (result.has(next)) continue;
    result.add(next);
    queue.push(...(direct.get(next) ?? []));
  }
  return result;
}

/** Denominator counts the governor reports on (JOV-7328 two clocks). */
export function summarize(objects) {
  const byStatus = {};
  const byLayer = {};
  for (const object of objects) {
    byStatus[object.status] = (byStatus[object.status] ?? 0) + 1;
    byLayer[object.layer] = (byLayer[object.layer] ?? 0) + 1;
  }
  return { total: objects.length, byStatus, byLayer };
}

export function loadInventory(path = INVENTORY_PATH) {
  return validateInventory(JSON.parse(readFileSync(path, 'utf8')));
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const path = process.argv[2] ?? INVENTORY_PATH;
  const inventory = loadInventory(path);
  const summary = summarize(inventory.objects);
  console.log(
    `certification-inventory: ${summary.total} objects ` +
      `(${JSON.stringify(summary.byStatus)}) valid`
  );
}
