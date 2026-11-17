// The certification registry is one policy file plus shard files.
//
// `docs/design-system/component-certification.json` holds `policy`, `gates`
// and `waivers`. Every `*.json` in the sibling `component-certification.d/`
// directory may add `gates` and `waivers` for components no other file names.
// A batch PR writes its own shard, so PRs that certify different components
// never edit the same lines and never conflict with each other.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

// Same order and message as component-cert-screens.mjs, kept local so the
// certificate CLI's import closure stays small.
const SORT_COMMAND = 'node scripts/component-certificate.mjs --sort';
/** @param {string} a @param {string} b */
const comparePaths = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** @param {Record<string, any>} [map] */
const sortByPath = (map = {}) =>
  Object.fromEntries(
    Object.entries(map).sort(([a], [b]) => comparePaths(a, b))
  );
/** @param {string} label @param {Record<string, any>} [map] */
function unsortedPathErrors(label, map = {}) {
  const keys = Object.keys(map);
  const at = keys.findIndex(
    (key, i) => i && comparePaths(keys[i - 1], key) > 0
  );
  return at < 0
    ? []
    : [
        `${label} is not sorted by component path (${keys[at]} comes after ${keys[at - 1]}); run ${SORT_COMMAND}`,
      ];
}

const KEYS = /** @type {const} */ (['gates', 'waivers']);

/** @param {string} root @param {string} rel */
const abs = (root, rel) => (rel.startsWith('/') ? rel : join(root, rel));

/** Repo-relative paths of the registry's shard files, sorted. */
export function shardPaths(root, rel) {
  const dir = join(dirname(rel), `${basename(rel, '.json')}.d`);
  if (!existsSync(abs(root, dir))) return [];
  return readdirSync(abs(root, dir))
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => join(dir, name));
}

/**
 * The registry with every shard's gates and waivers merged in, and the
 * errors the gate reports: a key named by two files, or a file out of path
 * order.
 * @param {string} root
 * @param {string} rel
 * @param {Record<string, any>} [fallback]
 */
export function readCertificationRegistry(root, rel, fallback = {}) {
  const file = abs(root, rel);
  /** @type {Record<string, any>} */
  const main = existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8'))
    : { ...fallback };
  /** @type {string[]} */
  const errors = [];
  /** @type {Record<string, Record<string, string>>} */
  const owner = { gates: {}, waivers: {} };
  /** @type {Record<string, any>} */
  const registry = { ...main, gates: {}, waivers: {} };
  const docs = [
    [rel, main],
    ...shardPaths(root, rel).map(p => [
      p,
      JSON.parse(readFileSync(abs(root, p), 'utf8')),
    ]),
  ];
  for (const [path, doc] of docs) {
    for (const key of KEYS) {
      errors.push(...unsortedPathErrors(`${path}: ${key}`, doc[key]));
      for (const [component, value] of Object.entries(doc[key] ?? {})) {
        if (owner[key][component]) {
          errors.push(
            `${path}: ${key} names ${component}, already in ${owner[key][component]}; keep one entry`
          );
          continue;
        }
        owner[key][component] = path;
        registry[key][component] = value;
      }
    }
  }
  registry.gates = sortByPath(registry.gates);
  registry.waivers = sortByPath(registry.waivers);
  return { registry, errors };
}

/** Sorts gates and waivers in the registry and each shard, in place. */
export function sortCertificationRegistry(root, rel) {
  for (const path of [rel, ...shardPaths(root, rel)]) {
    const file = abs(root, path);
    if (!existsSync(file)) continue;
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    for (const key of KEYS) if (doc[key]) doc[key] = sortByPath(doc[key]);
    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
  }
}
