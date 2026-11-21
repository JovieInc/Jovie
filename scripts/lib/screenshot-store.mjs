// Off-repo store for screenshot binaries (the catalog images that nothing
// serves, and docs/screenshots evidence).
//
// Binaries live in a PRIVATE, content-addressed Cloudflare R2 bucket with no
// public domain and no public development URL. Every read and write goes through R2's
// S3-compatible API signed with an access key (SigV4, implemented here with
// node:crypto, no dependencies). Credentials come only from the environment:
// R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (bucket name
// R2_SCREENSHOTS_BUCKET, default jovie-screenshots). CI reads use a read-only
// key; only a person (or the manual upload workflow) holds the write key.
//
// The repo keeps one small JSON pointer per image: sha256, size, content type,
// the content-addressed key, viewport and capture time. Content addressing
// makes a pointer immutable: a changed image is a new key, never an overwrite.
// Every download is verified against the pointer's sha256 and size.
//
// Images the live site serves (the targets of the apps/web/public symlinks into
// the catalog) are NOT in the store: they stay in git as regular files and have
// no pointer. See servedCatalogImages().
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import {
  DEFAULT_BUCKET,
  MISSING_CREDENTIALS,
  storeConfig,
  storeRequest,
} from './r2-store-client.mjs';

export const POINTER_SCHEMA = 'jovie.screenshot-pointer/v1';
export const POINTER_SUFFIX = '.pointer.json';
export const STORE_BUCKET = DEFAULT_BUCKET;
export const STORE_URL_PREFIX = `r2://${STORE_BUCKET}/`;
export const BINARY_EXTENSIONS = Object.freeze([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.mp4',
  '.mov',
  '.webm',
]);

// Where binaries live in git no more. Catalog pointers sit in a sibling
// directory because check-screenshot-catalog rejects any non-image file inside
// `current/`; docs pointers sit next to their image.
export const CATALOG_BINARY_DIR = 'apps/web/screenshot-catalog/current';
export const CATALOG_POINTER_DIR = 'apps/web/screenshot-catalog/pointers';
export const DOCS_BINARY_DIR = 'docs/screenshots';
export const MOVED_BINARY_ROOTS = Object.freeze([
  `${CATALOG_BINARY_DIR}/`,
  `${DOCS_BINARY_DIR}/`,
]);
// Small files that code and guards read straight from git; they stay in tree.
export const MOVED_BINARY_ALLOWED = Object.freeze([
  'docs/screenshots/gem-symphony-hud-430x90.png',
  'docs/screenshots/jov-7878-shell/mobile-history-short.png',
]);

const SHA256 = /^[0-9a-f]{64}$/;
const CONTENT_TYPES = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
});

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function isBinaryPath(path) {
  return BINARY_EXTENSIONS.includes(extname(path).toLowerCase());
}

/**
 * True for a binary path that must live in the store, not in git. `served` is
 * the set from servedCatalogImages(): those stay in git.
 */
export function isMovedBinary(path, served = new Set()) {
  return (
    isBinaryPath(path) &&
    MOVED_BINARY_ROOTS.some(root => path.startsWith(root)) &&
    !MOVED_BINARY_ALLOWED.includes(path) &&
    !served.has(path)
  );
}

/**
 * Catalog images the live site serves, repo-relative: the targets of symlinks
 * under apps/web/public that point into the catalog, following dedupe symlinks
 * inside the catalog to the regular file at the end of each chain. They must
 * stay in git (never in the private store), with no pointer.
 */
export function servedCatalogImages(root) {
  const served = new Set();
  const hop = (from, link) =>
    relative(root, resolve(root, dirname(from), link)).replaceAll('\\', '/');
  const follow = start => {
    let path = start;
    while (path.startsWith(`${CATALOG_BINARY_DIR}/`) && isBinaryPath(path)) {
      served.add(path);
      let stat;
      try {
        stat = lstatSync(join(root, path));
      } catch {
        return;
      }
      if (!stat.isSymbolicLink()) return;
      path = hop(path, readlinkSync(join(root, path)));
    }
  };
  const walk = dir => {
    if (!existsSync(join(root, dir))) return;
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.isSymbolicLink())
        follow(hop(path, readlinkSync(join(root, path))));
    }
  };
  walk('apps/web/public');
  // App code that imports a catalog image bundles it at build time, so it is
  // served too (e.g. `import X from '@/screenshot-catalog/current/a.png'`).
  const scan = dir => {
    if (!existsSync(join(root, dir))) return;
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SOURCE_SKIP_DIRS.has(entry.name)) scan(path);
      } else if (entry.isFile() && SOURCE_FILE.test(entry.name)) {
        const text = readFileSync(join(root, path), 'utf8');
        for (const match of text.matchAll(CATALOG_IMPORT))
          follow(`${CATALOG_BINARY_DIR}/${match[1]}`);
      }
    }
  };
  scan('apps/web');
  return served;
}

const SOURCE_SKIP_DIRS = new Set([
  '.next',
  '__tests__',
  'node_modules',
  'public',
  'screenshot-catalog',
  'tests',
]);
const SOURCE_FILE = /^(?!.*\.(?:test|spec)\.)[^.].*\.(?:[cm]?[jt]sx?)$/;
const CATALOG_IMPORT =
  /screenshot-catalog\/current\/([\w.-]+\.(?:png|jpe?g|webp|gif))['"`]/g;

export function objectKey(hash, extension) {
  return `sha256/${hash.slice(0, 2)}/${hash}${extension.toLowerCase()}`;
}

/** Repo path of the pointer for a repo-relative binary path. */
export function pointerPathFor(binaryPath) {
  if (binaryPath.startsWith(`${CATALOG_BINARY_DIR}/`)) {
    return `${CATALOG_POINTER_DIR}/${binaryPath.slice(CATALOG_BINARY_DIR.length + 1)}${POINTER_SUFFIX}`;
  }
  return `${binaryPath}${POINTER_SUFFIX}`;
}

/** Repo path of the binary a repo-relative pointer path describes. */
export function binaryPathFor(pointerPath) {
  if (!pointerPath.endsWith(POINTER_SUFFIX))
    throw new Error(`not a pointer path: ${pointerPath}`);
  const stem = pointerPath.slice(0, -POINTER_SUFFIX.length);
  if (pointerPath.startsWith(`${CATALOG_POINTER_DIR}/`)) {
    return `${CATALOG_BINARY_DIR}/${stem.slice(CATALOG_POINTER_DIR.length + 1)}`;
  }
  return stem;
}

export function buildPointer({ bytes, extension, viewport, capturedAt }) {
  const hash = sha256(bytes);
  const ext = extension.toLowerCase();
  return {
    schema: POINTER_SCHEMA,
    sha256: hash,
    bytes: bytes.length,
    contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream',
    url: `${STORE_URL_PREFIX}${objectKey(hash, ext)}`,
    viewport: viewport ?? null,
    capturedAt,
  };
}

/** Returns a list of problems; empty means the pointer is well formed. */
export function validatePointer(pointer, now = Date.now()) {
  const problems = [];
  if (!pointer || typeof pointer !== 'object')
    return ['pointer is not an object'];
  if (pointer.schema !== POINTER_SCHEMA) problems.push('unknown schema');
  if (!SHA256.test(String(pointer.sha256)))
    problems.push('sha256 must be 64 hex');
  if (!Number.isInteger(pointer.bytes) || pointer.bytes <= 0)
    problems.push('bytes must be a positive integer');
  const ext = extname(String(pointer.url ?? '')).toLowerCase();
  if (!isBinaryPath(`x${ext}`)) {
    problems.push('url must end in a binary extension');
  } else if (
    pointer.url !==
    `${STORE_URL_PREFIX}${objectKey(String(pointer.sha256), ext)}`
  ) {
    problems.push('url must be the content-addressed key for sha256');
  }
  const at = Date.parse(pointer.capturedAt);
  if (!Number.isFinite(at) || at > now)
    problems.push('capturedAt must be a past ISO time');
  if (
    pointer.viewport !== null &&
    !/^\d{2,5}x\d{2,5}$/.test(String(pointer.viewport))
  )
    problems.push('viewport must be WIDTHxHEIGHT or null');
  return problems;
}

export const keyOf = pointer => pointer.url.slice(STORE_URL_PREFIX.length);

/** Verifies bytes against a pointer's hash and size. */
export function verifyBytes(pointer, bytes) {
  const problems = [];
  if (bytes.length !== pointer.bytes) problems.push('size mismatch');
  if (sha256(bytes) !== pointer.sha256) problems.push('sha256 mismatch');
  return problems;
}

/** Every pointer under the repo, as { pointerPath, binaryPath } (repo-relative). */
export function listPointers(root, scope = 'all') {
  const dirs = [];
  if (scope === 'all' || scope === 'catalog') dirs.push(CATALOG_POINTER_DIR);
  if (scope === 'all' || scope === 'docs') dirs.push(DOCS_BINARY_DIR);
  const found = [];
  const walk = dir => {
    if (!existsSync(join(root, dir))) return;
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(POINTER_SUFFIX))
        found.push({ pointerPath: path, binaryPath: binaryPathFor(path) });
    }
  };
  for (const dir of dirs) walk(dir);
  return found.sort((a, b) => a.pointerPath.localeCompare(b.pointerPath));
}

export function readPointer(root, pointerPath) {
  return JSON.parse(readFileSync(join(root, pointerPath), 'utf8'));
}

export function writePointer(root, pointerPath, pointer) {
  const target = join(root, pointerPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(pointer, null, 2)}\n`);
}

async function pool(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index], index);
      }
    })
  );
  return results;
}

async function fetchBytes(config, key, fetchImpl, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await storeRequest(config, 'GET', key, { fetchImpl });
      if (response.status === 404) return { missing: true };
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { bytes: Buffer.from(await response.arrayBuffer()) };
    } catch (error) {
      lastError = error;
      if (attempt < attempts)
        await new Promise(r => setTimeout(r, 250 * attempt));
    }
  }
  throw new Error(`GET ${key} failed: ${lastError?.message ?? lastError}`);
}

/**
 * Makes every pointer's binary present on disk with verified bytes. Existing
 * files whose hash matches are left alone. Needs credentials for anything not
 * already on disk: without them it throws, or with `optional` it skips cleanly
 * and reports how many files are still absent. Returns
 * { downloaded, present, skipped, total }. Throws one error listing every failure.
 */
export async function hydrate({
  root,
  scope = 'all',
  fetchImpl = fetch,
  env = process.env,
  config = storeConfig(env),
  optional = false,
  log = (/** @type {string} */ _message) => {},
  concurrency = 8,
}) {
  const pointers = listPointers(root, scope);
  const failures = [];
  let downloaded = 0;
  let present = 0;
  let skipped = 0;
  await pool(pointers, concurrency, async ({ pointerPath, binaryPath }) => {
    const pointer = readPointer(root, pointerPath);
    const bad = validatePointer(pointer);
    if (bad.length) {
      failures.push(`${pointerPath}: ${bad.join(', ')}`);
      return;
    }
    const target = join(root, binaryPath);
    if (
      existsSync(target) &&
      !verifyBytes(pointer, readFileSync(target)).length
    ) {
      present += 1;
      return;
    }
    if (!config) {
      skipped += 1;
      return;
    }
    try {
      const result = await fetchBytes(config, keyOf(pointer), fetchImpl);
      if (result.missing) {
        failures.push(
          `${binaryPath}: not in the store (${keyOf(pointer)}). The screenshot upload has not been done.`
        );
        return;
      }
      const problems = verifyBytes(pointer, result.bytes);
      if (problems.length) {
        failures.push(
          `${binaryPath}: downloaded bytes failed ${problems.join(', ')}`
        );
        return;
      }
      mkdirSync(dirname(target), { recursive: true });
      const temporary = `${target}.${process.pid}.tmp`;
      writeFileSync(temporary, result.bytes);
      renameSync(temporary, target);
      downloaded += 1;
      log(`hydrated ${binaryPath}`);
    } catch (error) {
      failures.push(`${binaryPath}: ${error.message}`);
    }
  });
  if (skipped && !optional) throw new Error(MISSING_CREDENTIALS);
  if (failures.length) {
    throw new Error(
      `Screenshot hydrate failed for ${failures.length} of ${pointers.length} images:\n${failures.sort().join('\n')}`
    );
  }
  return { downloaded, present, skipped, total: pointers.length };
}

/**
 * HEAD-checks, with credentials, that every pointer's object exists in the
 * store with the right size. Throws MISSING_CREDENTIALS when there are none, so
 * an unverified upload can never read as verified.
 */
export async function verifyRemote({
  root,
  scope = 'all',
  fetchImpl = fetch,
  env = process.env,
  config = storeConfig(env),
  concurrency = 8,
}) {
  if (!config) throw new Error(MISSING_CREDENTIALS);
  const pointers = listPointers(root, scope);
  const missing = [];
  const bad = [];
  await pool(pointers, concurrency, async ({ pointerPath }) => {
    const pointer = readPointer(root, pointerPath);
    const problems = validatePointer(pointer);
    if (problems.length) {
      bad.push(`${pointerPath}: ${problems.join(', ')}`);
      return;
    }
    let response;
    try {
      response = await storeRequest(config, 'HEAD', keyOf(pointer), {
        fetchImpl,
      });
    } catch (error) {
      missing.push(`${pointerPath}: unreachable (${error.message})`);
      return;
    }
    if (!response.ok) {
      missing.push(`${pointerPath}: HTTP ${response.status}`);
      return;
    }
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > 0 && length !== pointer.bytes)
      bad.push(
        `${pointerPath}: stored size ${length} != pointer ${pointer.bytes}`
      );
  });
  return { total: pointers.length, missing: missing.sort(), bad: bad.sort() };
}

export function uploadHint() {
  return (
    'Screenshot upload not verified: these pointers have no matching object in ' +
    `the private ${STORE_BUCKET} bucket. Someone with write credentials must run ` +
    '"node scripts/screenshot-store.mjs upload --from <ref>" (see docs/ci/repository-health.md). ' +
    'Merging before the upload would break screenshot consumers.'
  );
}

/** Uploads verified bytes under the pointer's content-addressed key. Idempotent. */
export async function uploadObject(config, pointer, bytes, fetchImpl = fetch) {
  const response = await storeRequest(config, 'PUT', keyOf(pointer), {
    body: bytes,
    contentType: pointer.contentType,
    fetchImpl,
  });
  if (!response.ok)
    throw new Error(`PUT ${keyOf(pointer)}: HTTP ${response.status}`);
}
