#!/usr/bin/env node
// Read-only size evidence from a merge-group checkout.
//
// The Size Guard workflow fetches the synthetic head, then this module counts
// the diff and the tracked-byte total with local git. Numstat replaces the
// compare files API. `git ls-tree -r -l` replaces GET /git/trees. Neither
// command fetches: a missing object returns null and the caller uses the API
// when the quota allows it. Line counts match `git diff --numstat -z -M` the
// way the source PR Size Guard step does (renames once, under the new path;
// binary rows count zero lines).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    timeout: 20_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * `git ls-tree -r -l -z` lists every tracked path from tree objects. Regular
 * files (100644, 100755) carry their blob size, so the combined-tree budget
 * does not need GET /git/trees. A malformed row fails the whole listing:
 * a partial count must not pass the budget.
 * @returns {null | { trackedBytes: number, trackedFiles: number }}
 */
export function parseLsTreeLongZ(stdout) {
  let trackedBytes = 0;
  let trackedFiles = 0;
  for (const record of String(stdout ?? '').split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    if (tab < 0) return null;
    const meta = record.slice(0, tab).trim().split(/ +/);
    const path = record.slice(tab + 1);
    if (meta.length !== 4 || path.length === 0) return null;
    const [mode, type, sha, size] = meta;
    if (!/^[0-7]{6}$/.test(mode) || !SHA_PATTERN.test(sha)) return null;
    if (mode !== '100644' && mode !== '100755') continue;
    if (type !== 'blob' || !/^[0-9]+$/.test(size)) return null;
    const bytes = Number(size);
    if (!Number.isSafeInteger(bytes)) return null;
    trackedBytes += bytes;
    trackedFiles += 1;
    if (!Number.isSafeInteger(trackedBytes)) return null;
  }
  return { trackedBytes, trackedFiles };
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
 *   trackedBytes: number | null,
 *   trackedFiles: number | null,
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
  let trackedBytes = null;
  let trackedFiles = null;
  try {
    const listing = parseLsTreeLongZ(
      git(['ls-tree', '-r', '-l', '-z', headSha], cwd)
    );
    if (listing) {
      trackedBytes = listing.trackedBytes;
      trackedFiles = listing.trackedFiles;
    }
  } catch {
    trackedBytes = null;
    trackedFiles = null;
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
    trackedBytes,
    trackedFiles,
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
