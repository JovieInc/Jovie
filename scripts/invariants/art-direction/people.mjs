/**
 * Approved-people registry guard (2026-10-25).
 *
 * Tim: "she's not an approved character." Any image that depicts a person on a
 * marketing or public surface must be listed in `approved-people.json` with
 * consent and provenance. Today that is Tim White, from his own photos.
 * Generated or stock people are banned unless a registry entry names who
 * approved them and when.
 *
 * What counts as a person image, with no face detection involved:
 *   - a sidecar `<file>.meta.json` that declares `"subject": "person"`;
 *   - any image in a people directory (avatars) unless its sidecar declares a
 *     different subject (`object`, `ui`, `abstract`);
 *   - an image whose name says so (portrait, headshot, model, stock, selfie,
 *     the editorial P01-P12 portrait series, and similar).
 * A person image that is not in the registry is an `unapproved-person:<path>`
 * id. Ids only shrink, same ratchet as the other image checks.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ancestorIds, ratchet } from './images.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export const PEOPLE_REGISTRY =
  'scripts/invariants/art-direction/approved-people.json';
export const PEOPLE_BASELINE =
  'scripts/invariants/art-direction/people.baseline.json';

const ROOTS = ['apps/web/public'];
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'product-screenshots',
  'device-bezels',
  'brand-logos',
  'brand',
  'og',
]);
const IMAGE_EXT = /\.(png|jpe?g|webp|avif|gif|svg)$/iu;
const PEOPLE_DIRS = [
  'apps/web/public/images/avatars/',
  'apps/web/public/avatars/',
];
const PERSON_NAME =
  /(^|[/_.-])(portrait|headshot|model|stock|selfie|woman|female|people|person)s?([_.-]|$)|(^|[/_.-])p(0[1-9]|1[0-2])([_.-]|$)/iu;
const NON_PERSON_SUBJECTS = new Set(['object', 'ui', 'abstract', 'none']);
const CONSENTS = new Set(['self', 'written']);
const SOURCES = new Set(['own-photo', 'commissioned']);
const RESTRICTED_SOURCES = new Set(['generated', 'stock']);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function walk(absolute, out) {
  let stats;
  try {
    stats = statSync(absolute);
  } catch {
    return;
  }
  if (stats.isFile()) {
    if (IMAGE_EXT.test(absolute)) out.push(absolute);
    return;
  }
  if (!stats.isDirectory()) return;
  for (const entry of readdirSync(absolute)) {
    if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;
    walk(join(absolute, entry), out);
  }
}

export function validateRegistry(registry, exists) {
  const errors = [];
  const people = new Map();
  for (const person of registry.people ?? []) {
    if (!person.id || !person.name) {
      errors.push('registry person needs id and name');
      continue;
    }
    people.set(person.id, person);
    if (!CONSENTS.has(person.consent))
      errors.push(`person ${person.id}: consent must be self or written`);
    if (!String(person.provenance ?? '').trim())
      errors.push(`person ${person.id}: provenance is required`);
    const restricted = RESTRICTED_SOURCES.has(person.source);
    if (!restricted && !SOURCES.has(person.source))
      errors.push(
        `person ${person.id}: source must be own-photo or commissioned`
      );
    if (restricted && !(person.approvedBy && person.approvedOn))
      errors.push(
        `person ${person.id}: ${person.source} people are banned without approvedBy and approvedOn`
      );
  }
  for (const image of registry.images ?? []) {
    if (!people.has(image.person))
      errors.push(`image ${image.path}: unknown person ${image.person}`);
    if (!exists(image.path))
      errors.push(`image ${image.path}: file does not exist`);
  }
  return errors;
}

export function classifyPersonImage(rel, sidecar) {
  const subject = sidecar?.subject;
  if (subject === 'person') return true;
  if (NON_PERSON_SUBJECTS.has(subject)) return false;
  if (PEOPLE_DIRS.some(dir => rel.startsWith(dir))) {
    return !/default-user/iu.test(rel);
  }
  return (
    PERSON_NAME.test(rel.slice(rel.lastIndexOf('/') + 1)) ||
    PERSON_NAME.test(rel)
  );
}

export function scanPeople(repoRoot = REPO_ROOT) {
  const registry = readJson(join(repoRoot, PEOPLE_REGISTRY));
  const errors = validateRegistry(registry, path =>
    existsSync(join(repoRoot, path))
  );
  const approved = new Set((registry.images ?? []).map(image => image.path));
  const files = [];
  for (const root of ROOTS) walk(join(repoRoot, root), files);
  const ids = [];
  for (const file of files) {
    const rel = relative(repoRoot, file).split('\\').join('/');
    let sidecar;
    try {
      sidecar = readJson(`${file}.meta.json`);
    } catch {
      sidecar = undefined;
    }
    if (classifyPersonImage(rel, sidecar) && !approved.has(rel)) {
      ids.push(`unapproved-person:${rel}`);
    }
  }
  ids.sort();
  return { ids, errors };
}

export async function check(repoRoot = REPO_ROOT, recordedIds) {
  const { ids, errors } = scanPeople(repoRoot);
  const recorded = recordedIds ?? readJson(join(repoRoot, PEOPLE_BASELINE)).ids;
  const ancestor = ancestorIds(repoRoot, PEOPLE_BASELINE);
  const failures = [...errors];
  if (!ancestor.ok) failures.push(ancestor.error);
  else failures.push(...ratchet(ids, recorded, ancestor.ancestor));
  return { failures, ids };
}
