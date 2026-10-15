#!/usr/bin/env node
// Read-only size evidence from a merge-group checkout.
//
// The Size Guard workflow fetches the synthetic head, then this module counts
// the diff with local git. That replaces the compare API and the per-PR files
// API when both commits are already in the repo. It never fetches: a missing
// object returns null and the caller uses the API. Line counts match
// `git diff --numstat -z -M` the way the source PR Size Guard step does
// (renames once, under the new path; binary rows count zero lines).
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
 * }}
 */
export function readLocalMergeGroupEvidence({
  baseSha,
  headSha,
  cwd = process.cwd(),
  git = runGit,
} = {}) {
  if (!SHA_PATTERN.test(String(baseSha ?? '')) || !SHA_PATTERN.test(String(headSha ?? ''))) {
    return null;
  }
  let meta;
  try {
    const resolved = git(['rev-parse', '--verify', `${headSha}^{commit}`], cwd).trim();
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
  return {
    baseSha,
    headSha,
    parentSha: parentList[0],
    treeSha,
    subject,
    committerName,
    committerEmail,
    files,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.env.MERGE_GROUP_LOCAL_EVIDENCE;
  const evidence = readLocalMergeGroupEvidence({
    baseSha: process.env.GROUP_BASE,
    headSha: process.env.GROUP_HEAD,
  });
  if (target && evidence) writeFileSync(target, JSON.stringify(evidence));
}
