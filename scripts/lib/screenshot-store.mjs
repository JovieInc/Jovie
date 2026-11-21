// Off-repo store for screenshot binaries (product screenshot catalog and
// docs/screenshots evidence).
//
// Binaries live in a content-addressed, public-read Cloudflare R2 bucket. The
// repo keeps one small JSON pointer per image: sha256, size, content type, the
// content-addressed store URL, viewport and capture time. Content addressing
// makes a pointer immutable: a changed image is a new key, never an overwrite.
// Consumers hydrate the real bytes at build/CI time over plain HTTPS (no
// secret) and verify sha256 and size on every download. Only uploads need the
// Cloudflare token.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join } from 'node:path';

export const POINTER_SCHEMA = 'jovie.screenshot-pointer/v1';
export const POINTER_SUFFIX = '.pointer.json';
export const STORE_BUCKET = 'jovie-screenshots';
export const STORE_URL_PREFIX = `r2://${STORE_BUCKET}/`;
// Public-read origin of the bucket (R2 custom domain). Content-addressed keys
// are unguessable without the repo pointers. Override with
// SCREENSHOT_STORE_PUBLIC_BASE (for example an r2.dev URL).
export const DEFAULT_PUBLIC_BASE = 'https://screenshots.jov.ie';
export const publicBase = (env = process.env) =>
  (env.SCREENSHOT_STORE_PUBLIC_BASE || DEFAULT_PUBLIC_BASE).replace(/\/+$/, '');

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

/** True for a binary path that must live in the store, not in git. */
export function isMovedBinary(path) {
  return (
    isBinaryPath(path) &&
    MOVED_BINARY_ROOTS.some(root => path.startsWith(root)) &&
    !MOVED_BINARY_ALLOWED.includes(path)
  );
}

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
export const publicUrlOf = (pointer, env = process.env) =>
  `${publicBase(env)}/${keyOf(pointer)}`;

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

async function fetchBytes(url, fetchImpl, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(url);
      if (response.status === 404) return { missing: true };
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { bytes: Buffer.from(await response.arrayBuffer()) };
    } catch (error) {
      lastError = error;
      if (attempt < attempts)
        await new Promise(r => setTimeout(r, 250 * attempt));
    }
  }
  throw new Error(`GET ${url} failed: ${lastError?.message ?? lastError}`);
}

/**
 * Makes every pointer's binary present on disk with verified bytes. Existing
 * files whose hash matches are left alone. Returns { downloaded, present }.
 * Throws one error listing every failure.
 */
export async function hydrate({
  root,
  scope = 'all',
  fetchImpl = fetch,
  env = process.env,
  log = () => {},
  concurrency = 8,
}) {
  const pointers = listPointers(root, scope);
  const failures = [];
  let downloaded = 0;
  let present = 0;
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
    const url = publicUrlOf(pointer, env);
    try {
      const result = await fetchBytes(url, fetchImpl);
      if (result.missing) {
        failures.push(
          `${binaryPath}: not in the store (${url}). The screenshot upload has not been done.`
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
  if (failures.length) {
    throw new Error(
      `Screenshot hydrate failed for ${failures.length} of ${pointers.length} images:\n${failures.sort().join('\n')}`
    );
  }
  return { downloaded, present, total: pointers.length };
}

/** HEAD-checks that every pointer's object exists in the store with the right size. */
export async function verifyRemote({
  root,
  scope = 'all',
  fetchImpl = fetch,
  env = process.env,
  concurrency = 8,
}) {
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
    const url = publicUrlOf(pointer, env);
    let response;
    try {
      response = await fetchImpl(url, { method: 'HEAD' });
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

export function uploadHint(base = publicBase()) {
  return (
    'Screenshot upload not done: run the "Screenshots to R2 upload" workflow ' +
    '(.github/workflows/screenshots-r2-upload.yml) on this branch, and make sure ' +
    `the ${STORE_BUCKET} bucket is public at ${base}. Merging before the upload ` +
    'would break live product screenshots.'
  );
}

function wrangler(args, env = process.env) {
  const result = spawnSync(env.WRANGLER_BIN || 'wrangler', args, {
    encoding: 'utf8',
    env,
  });
  if (result.status !== 0) {
    throw new Error(
      `wrangler ${args.slice(0, 3).join(' ')} failed: ${(result.stderr || result.stdout || String(result.error)).trim()}`
    );
  }
}

/** Uploads a verified file under its content-addressed key. Idempotent. */
export function uploadObject(pointer, file, run = wrangler) {
  run([
    'r2',
    'object',
    'put',
    `${STORE_BUCKET}/${keyOf(pointer)}`,
    `--file=${file}`,
    `--content-type=${pointer.contentType}`,
    '--remote',
  ]);
}
