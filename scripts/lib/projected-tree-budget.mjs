// Source-PR projection of the merge_group combined-tree byte budget.
//
// merge_group enforces HYGIENE_LIMITS.maxTrackedBytes on the synthetic
// base + members tree and ejects the whole group when it overflows, so one
// over-budget PR (or main sitting at the edge) blocks every queued PR. This
// runs on the source pull_request with local git evidence: it builds the real
// merged tree of base tip + PR head with `git merge-tree --write-tree` and
// counts it with the exact parseTrackedRegularTree used by the merge_group
// check. Scalar `base + (head - merge base)` arithmetic is wrong whenever both
// sides touch the same path, so the merged tree itself is measured. It fails an
// over-budget PR before queue admission and warns above 95% of budget.
//
// Kept out of merge-group-member-policy.mjs: that trusted queue policy must not
// spawn processes (see merge-group-workflow-contract.test.mjs).
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseTrackedRegularTree } from './merge-group-member-policy.mjs';
import {
  HYGIENE_LIMITS,
  trackedBytesBudgetWarning,
} from './repo-hygiene-limits.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const LS_TREE_RECORD =
  /^(\d{6}) (blob|tree|commit) ([0-9a-f]{40}) +(-|\d+)\t(.+)$/s;
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;

function requireSha(value, field) {
  if (!SHA_PATTERN.test(String(value ?? ''))) {
    throw new Error(`${field} is not a full SHA`);
  }
  return value;
}

// Converts `git ls-tree -r -t -l -z <tree>` output into the GitHub trees API
// payload shape so local evidence is measured by the shared counter.
export function parseGitLsTree(output, treeSha) {
  const tree = [];
  for (const record of String(output).split('\0')) {
    if (!record) continue;
    const match = LS_TREE_RECORD.exec(record);
    if (!match)
      throw new Error('local tree listing contains malformed evidence');
    const [, mode, type, sha, size, path] = match;
    tree.push({
      mode,
      path,
      sha,
      ...(size === '-' ? {} : { size: Number(size) }),
      type,
    });
  }
  return { sha: treeSha, tree, truncated: false };
}

export function measureGitTree(revision, git) {
  const treeSha = git(['rev-parse', '--verify', `${revision}^{tree}`]).trim();
  requireSha(treeSha, `${revision} tree`);
  return parseTrackedRegularTree(
    parseGitLsTree(git(['ls-tree', '-r', '-t', '-l', '-z', treeSha]), treeSha)
  );
}

function localGit(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
}

// Returns the merged tree OID, or null when base and head conflict (a
// conflicted PR cannot be admitted to the queue, so there is nothing to project).
export function mergedTreeSha({ baseSha, git, headSha, mergeBaseSha }) {
  let output;
  try {
    output = git([
      'merge-tree',
      '--write-tree',
      '--no-messages',
      // Byte totals do not depend on rename pairing; exact-only rename
      // detection avoids spurious rename/delete conflicts between unrelated
      // files.
      '-X',
      'find-renames=100%',
      `--merge-base=${mergeBaseSha}`,
      baseSha,
      headSha,
    ]);
  } catch (error) {
    if (error && typeof error === 'object' && error.status === 1) return null;
    throw error;
  }
  return requireSha(String(output).split('\n')[0].trim(), 'merged tree');
}

export function enforceProjectedTreeBudget({
  baseSha,
  git = localGit,
  headSha,
  log = console.log,
  maxTrackedBytes = HYGIENE_LIMITS.maxTrackedBytes,
  mergeBaseSha,
}) {
  requireSha(baseSha, 'PR_BASE_SHA');
  requireSha(mergeBaseSha, 'PR_MERGE_BASE');
  requireSha(headSha, 'PR_HEAD_SHA');
  const base = measureGitTree(baseSha, git);
  const treeSha = mergedTreeSha({ baseSha, git, headSha, mergeBaseSha });
  if (treeSha === null) {
    log(
      '::warning::Projected combined tree: skipped — PR head conflicts with the base; resolve the conflict to project the merged size.'
    );
    return null;
  }
  const merged = measureGitTree(treeSha, git);
  const bytes = merged.bytes;
  const delta = bytes - base.bytes;
  const detail = `merged tree; base ${base.bytes} ${delta >= 0 ? '+' : ''}${delta}`;
  if (bytes > maxTrackedBytes) {
    throw new Error(
      `${bytes} bytes of tracked regular files (${detail}) exceeds the ${maxTrackedBytes}-byte combined-tree budget; the merge queue would reject this PR`
    );
  }
  const warning = trackedBytesBudgetWarning(bytes, maxTrackedBytes);
  if (warning) log(`::warning::Projected combined tree: ${warning}`);
  log(
    `Projected combined tree: PASS — ${bytes} tracked regular-file bytes (${detail}).`
  );
  return { baseBytes: base.bytes, bytes, delta };
}

export function runProjectedTreeBudget({
  env = process.env,
  git = localGit,
  log = console.log,
} = {}) {
  return enforceProjectedTreeBudget({
    baseSha: env.PR_BASE_SHA,
    git,
    headSha: env.PR_HEAD_SHA,
    log,
    mergeBaseSha: env.PR_MERGE_BASE,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    runProjectedTreeBudget();
  } catch (error) {
    console.error(
      `::error::${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}
