// Off-repo store for certification and visual evidence binaries.
//
// Binaries live in a content-addressed Cloudflare R2 bucket (same account as the
// turbo remote cache, no new spend). The repo keeps only a small JSON pointer:
// content hash, store URL, viewport and capture time. A pointer can be verified
// offline (shape) or against the bytes (hash). Content addressing makes a
// pointer immutable: a changed image is a new key, never an overwrite.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

export const EVIDENCE_POINTER_SCHEMA = 'jovie.evidence-pointer/v1';
export const EVIDENCE_POINTER_SUFFIX = '.evidence.json';
export const EVIDENCE_BUCKET = 'jovie-evidence';
export const EVIDENCE_URL_PREFIX = `r2://${EVIDENCE_BUCKET}/`;
export const EVIDENCE_BINARY_EXTENSIONS = Object.freeze([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.mp4',
  '.mov',
  '.webm',
]);
// Evidence directories where new binaries are banned. Corpus directories below
// are test fixtures read by code, not evidence, and stay in the tree.
export const EVIDENCE_BINARY_ROOTS = Object.freeze([
  'docs/screenshots/',
  'docs/evidence/',
  '.no-mistakes/evidence/',
]);
export const EVIDENCE_BINARY_ALLOWED_PREFIXES = Object.freeze([
  'docs/screenshots/ui-escape-holdout/',
  'docs/screenshots/taste-labels/images/',
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

export function isEvidenceBinary(path) {
  return EVIDENCE_BINARY_EXTENSIONS.includes(extname(path).toLowerCase());
}

/** True when a path is a binary under an evidence root and not an allowed corpus. */
export function isBannedEvidenceBinary(path) {
  return (
    isEvidenceBinary(path) &&
    EVIDENCE_BINARY_ROOTS.some(root => path.startsWith(root)) &&
    !EVIDENCE_BINARY_ALLOWED_PREFIXES.some(prefix => path.startsWith(prefix))
  );
}

export function objectKey(hash, extension) {
  return `evidence/${hash.slice(0, 2)}/${hash}${extension.toLowerCase()}`;
}

export function pointerPathFor(binaryPath) {
  return `${binaryPath}${EVIDENCE_POINTER_SUFFIX}`;
}

/**
 * @param {{ bytes: Buffer, extension: string, viewport?: string | null,
 *   capturedAt: string, label?: string }} input
 */
export function buildPointer({
  bytes,
  extension,
  viewport,
  capturedAt,
  label,
}) {
  const hash = sha256(bytes);
  const ext = extension.toLowerCase();
  return {
    schema: EVIDENCE_POINTER_SCHEMA,
    sha256: hash,
    bytes: bytes.length,
    contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream',
    url: `${EVIDENCE_URL_PREFIX}${objectKey(hash, ext)}`,
    viewport: viewport ?? null,
    capturedAt,
    ...(label ? { label } : {}),
  };
}

/** Returns a list of problems; empty means the pointer is well formed. */
export function validatePointer(pointer, now = Date.now()) {
  const problems = [];
  if (!pointer || typeof pointer !== 'object')
    return ['pointer is not an object'];
  if (pointer.schema !== EVIDENCE_POINTER_SCHEMA)
    problems.push('unknown schema');
  if (!SHA256.test(String(pointer.sha256)))
    problems.push('sha256 must be 64 hex');
  if (!Number.isInteger(pointer.bytes) || pointer.bytes <= 0) {
    problems.push('bytes must be a positive integer');
  }
  const ext = extname(String(pointer.url ?? '')).toLowerCase();
  if (!isEvidenceBinary(`x${ext}`))
    problems.push('url must end in a binary extension');
  else if (
    pointer.url !==
    `${EVIDENCE_URL_PREFIX}${objectKey(String(pointer.sha256), ext)}`
  ) {
    problems.push('url must be the content-addressed key for sha256');
  }
  const at = Date.parse(pointer.capturedAt);
  if (!Number.isFinite(at) || at > now)
    problems.push('capturedAt must be a past ISO time');
  if (
    pointer.viewport !== null &&
    !/^\d{2,5}x\d{2,5}$/.test(String(pointer.viewport))
  ) {
    problems.push('viewport must be WIDTHxHEIGHT or null');
  }
  return problems;
}

export function readPointer(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Verifies bytes against a pointer's hash and size. */
export function verifyBytes(pointer, bytes) {
  const problems = [];
  if (bytes.length !== pointer.bytes) problems.push('size mismatch');
  if (sha256(bytes) !== pointer.sha256) problems.push('sha256 mismatch');
  return problems;
}

function wrangler(args, env = process.env) {
  const result = spawnSync('wrangler', args, { encoding: 'utf8', env });
  if (result.status !== 0) {
    throw new Error(
      `wrangler ${args[0]} ${args[1]} failed: ${(result.stderr || result.stdout).trim()}`
    );
  }
  return result;
}

/** Uploads a file under its content-addressed key. Idempotent by construction. */
export function uploadObject(pointer, file, run = wrangler) {
  const key = pointer.url.slice(EVIDENCE_URL_PREFIX.length);
  run([
    'r2',
    'object',
    'put',
    `${EVIDENCE_BUCKET}/${key}`,
    `--file=${file}`,
    `--content-type=${pointer.contentType}`,
    '--remote',
  ]);
}

/** Fetches stored bytes. Used by `verify --remote`, not by the PR-time check. */
export function downloadObject(pointer, destination, run = wrangler) {
  const key = pointer.url.slice(EVIDENCE_URL_PREFIX.length);
  run([
    'r2',
    'object',
    'get',
    `${EVIDENCE_BUCKET}/${key}`,
    `--file=${destination}`,
    '--remote',
  ]);
  return readFileSync(destination);
}
