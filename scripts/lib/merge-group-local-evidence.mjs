#!/usr/bin/env node
// Size evidence from a merge-group checkout.
//
// The Size Guard workflow fetches the synthetic head, then this module counts
// the diff and the tracked-byte total with local git. That replaces the
// compare API, the per-PR files API, and GET /git/trees. Blob size is not
// stored in the tree object: `git ls-tree -r -l` asks the object database,
// and on a blobless fetch that lazy-fetches every missing blob until the
// 20s git timeout (2026-10-15 17:37Z, the trees API 403 then ejected in-cap
// groups). A missing size fetches that commit's blobs once over the git
// protocol — not the REST API — and measures again. Still-unmeasured bytes
// stay null so the caller can hold or fail closed. Line counts match
// `git diff --numstat -z -M` the way the source PR Size Guard step does
// (renames once, under the new path; binary rows count zero lines).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
const NO_LAZY_FETCH = { GIT_NO_LAZY_FETCH: '1' };

function runGit(args, cwd, options) {
  const explicit = options?.env || typeof options?.input === 'string';
  const env = explicit ? options.env : options;
  const input = explicit ? options.input : undefined;
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    input,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    timeout: args[0] === 'fetch' ? 70_000 : 20_000,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
}

/**
 * `git ls-tree -r -l <commit>`. Regular files (100644/100755) contribute their
 * blob size. A malformed row returns null so the caller can fall back.
 * @returns {{ bytes: number, files: number } | null}
 */
export function parseLsTreeLong(stdout) {
  let bytes = 0;
  let files = 0;
  const lines = String(stdout ?? '').split('\n');
  for (const line of lines) {
    if (line.length === 0) continue;
    const match = line.match(
      /^(\d{6}) (blob|tree|commit) ([0-9a-f]{40})\s+(\d+|-)\t(.+)$/
    );
    if (!match) return null;
    const [, mode, type, , size] = match;
    if (mode !== '100644' && mode !== '100755') continue;
    if (type !== 'blob' || size === '-') return null;
    const length = Number(size);
    if (!Number.isSafeInteger(length) || length < 0) return null;
    bytes += length;
    if (!Number.isSafeInteger(bytes)) return null;
    files += 1;
  }
  return { bytes, files };
}

/**
 * `git cat-file --batch-check` sizes for regular blobs listed by
 * `git ls-tree -r` (no `-l`). A missing object is incomplete: return null
 * instead of a partial total.
 * @returns {{ bytes: number, files: number } | null}
 */
export function trackedBytesFromCatFile(listing, batch) {
  const wanted = new Map();
  for (const line of String(listing ?? '').split('\n')) {
    if (line.length === 0) continue;
    const match = line.match(
      /^(\d{6}) (blob|tree|commit) ([0-9a-f]{40})\t(.+)$/
    );
    if (!match) return null;
    const [, mode, type, oid] = match;
    if (mode !== '100644' && mode !== '100755') continue;
    if (type !== 'blob') return null;
    wanted.set(oid, (wanted.get(oid) ?? 0) + 1);
  }
  if (wanted.size === 0) return { bytes: 0, files: 0 };
  let bytes = 0;
  let files = 0;
  const seen = new Set();
  for (const line of String(batch ?? '').split('\n')) {
    if (line.length === 0) continue;
    const match = line.match(/^([0-9a-f]{40}) (\d+)$/);
    if (!match) return null;
    const [, oid, size] = match;
    const copies = wanted.get(oid);
    if (!copies || seen.has(oid)) return null;
    const length = Number(size);
    if (!Number.isSafeInteger(length) || length < 0) return null;
    bytes += length * copies;
    if (!Number.isSafeInteger(bytes)) return null;
    files += copies;
    seen.add(oid);
  }
  if (seen.size !== wanted.size) return null;
  return { bytes, files };
}

function measureTrackedTree(git, headSha, cwd) {
  try {
    const listed = parseLsTreeLong(
      git(['ls-tree', '-r', '-l', headSha], cwd, NO_LAZY_FETCH)
    );
    if (listed) return listed;
  } catch {
    // Missing blobs make ls-tree fail closed under GIT_NO_LAZY_FETCH.
  }
  let listing;
  try {
    listing = git(['ls-tree', '-r', headSha], cwd, NO_LAZY_FETCH);
  } catch {
    return null;
  }
  const oids = [];
  const seen = new Set();
  for (const line of String(listing).split('\n')) {
    const match = line.match(/^100(?:644|755) blob ([0-9a-f]{40})\t/);
    if (match && !seen.has(match[1])) {
      seen.add(match[1]);
      oids.push(match[1]);
    }
  }
  if (oids.length === 0) return trackedBytesFromCatFile(listing, '');
  try {
    return trackedBytesFromCatFile(
      listing,
      git(['cat-file', '--batch-check=%(objectname) %(objectsize)'], cwd, {
        env: NO_LAZY_FETCH,
        input: `${oids.join('\n')}\n`,
      })
    );
  } catch {
    return null;
  }
}

/** @returns {Array<{ filename: string, additions: number, deletions: number }> | null} */
export function parseNumstatZ(stdout) {
  const files = [];
  const parts = String(stdout ?? '').split('\0');
  for (let index = 0; index < parts.length; ) {
    const record = parts[index++];
    if (!record) continue;
    const [added, deleted, path] = record.split('\t');
    let name = path;
    if (path === '') {
      index += 1;
      name = parts[index++];
    }
    const additions = added === '-' ? 0 : Number(added);
    const deletions = deleted === '-' ? 0 : Number(deleted);
    if (
      typeof name !== 'string' ||
      name.length === 0 ||
      !Number.isSafeInteger(additions) ||
      additions < 0 ||
      !Number.isSafeInteger(deletions) ||
      deletions < 0
    ) {
      return null;
    }
    files.push({ filename: name, additions, deletions });
  }
  return files;
}

/**
 * @param {{
 *   baseSha?: string,
 *   headSha?: string,
 *   cwd?: string,
 *   git?: (args: readonly string[], cwd: string) => string,
 * }} [options]
 * @returns {null | {
 *   baseSha: string,
 *   headSha: string,
 *   parentSha: string,
 *   treeSha: string,
 *   subject: string,
 *   committerName: string,
 *   committerEmail: string,
 *   files: Array<{ filename: string, additions: number, deletions: number }> | null,
 *   tracked: { bytes: number, files: number } | null,
 * }}
 */
export function readLocalMergeGroupEvidence({
  baseSha,
  headSha,
  cwd = process.cwd(),
  git = runGit,
} = {}) {
  if (
    !SHA_PATTERN.test(String(baseSha ?? '')) ||
    !SHA_PATTERN.test(String(headSha ?? ''))
  ) {
    return null;
  }
  let meta;
  try {
    const resolved = git(
      ['rev-parse', '--verify', `${headSha}^{commit}`],
      cwd
    ).trim();
    if (resolved !== headSha) return null;
    git(['rev-parse', '--verify', `${baseSha}^{commit}`], cwd);
    meta = git(
      ['log', '-1', `--format=%P%x00%cn%x00%ce%x00%T%x00%s`, headSha],
      cwd
    );
  } catch {
    return null;
  }
  const [parents, committerName, committerEmail, treeSha, subject] = meta
    .replace(/\n$/, '')
    .split('\0');
  const parentList = String(parents ?? '')
    .split(' ')
    .filter(Boolean);
  if (
    parentList.length !== 1 ||
    parentList[0] !== baseSha ||
    committerName !== 'GitHub' ||
    committerEmail !== 'noreply@github.com' ||
    !SHA_PATTERN.test(String(treeSha ?? '')) ||
    typeof subject !== 'string' ||
    subject.length === 0
  ) {
    return null;
  }
  let files = null;
  try {
    files = parseNumstatZ(
      git(['diff', '--numstat', '-z', '-M', baseSha, headSha], cwd)
    );
  } catch {
    files = null;
  }
  let tracked = measureTrackedTree(git, headSha, cwd);
  if (!tracked) {
    try {
      // One git-protocol backfill. --refetch is required after a blob:none
      // fetch, which otherwise will not send blobs for a commit it already has.
      git(
        [
          'fetch',
          '--refetch',
          '--filter=blob:limit=1g',
          '--no-tags',
          '--depth=2',
          'origin',
          headSha,
        ],
        cwd
      );
      tracked = measureTrackedTree(git, headSha, cwd);
    } catch {
      tracked = null;
    }
  }
  return {
    baseSha,
    headSha,
    parentSha: parentList[0],
    treeSha,
    subject,
    committerName,
    committerEmail,
    files,
    tracked,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const target = process.env.MERGE_GROUP_LOCAL_EVIDENCE;
  const evidence = readLocalMergeGroupEvidence({
    baseSha: process.env.GROUP_BASE,
    headSha: process.env.GROUP_HEAD,
  });
  if (target && evidence) writeFileSync(target, JSON.stringify(evidence));
}
