#!/usr/bin/env node
/**
 * Publish a design-present set's images to the evidence branch.
 *
 * Images (Pen, before, after, triptych) stay out of the main tree (repo
 * hygiene: binaries only in allowlisted asset paths). They are written to
 * `design-present-evidence` at the same repo paths, with git plumbing (no
 * checkout, no stash). The receipt records the evidence commit; the PR body
 * links images at that commit; pr-body-check re-hashes them there.
 *
 *   node scripts/design-present/evidence.mjs --manifest <set>/manifest.json [--no-push]
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './present-check.mjs';

export const EVIDENCE_BRANCH = 'design-present-evidence';
export const IMAGE_KINDS = ['pen', 'before', 'after', 'triptych'];

const git = (args, opts = {}) =>
  execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    ...opts,
  }).trim();

function remoteTip() {
  try {
    const line = git(['ls-remote', 'origin', `refs/heads/${EVIDENCE_BRANCH}`]);
    return line ? line.split(/\s+/)[0] : null;
  } catch {
    return null;
  }
}

export function publishEvidence({ manifestPath, push = true }) {
  const receiptPath = join(dirname(manifestPath), 'receipt.json');
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  if (receipt.pass !== true)
    throw new Error('refusing to publish evidence for a failing receipt');
  const tip = remoteTip();
  if (tip) git(['fetch', '--no-tags', '--depth=1', 'origin', tip]);
  const tmp = mkdtempSync(join(tmpdir(), 'dp-index-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(tmp, 'index') };
  try {
    if (tip) git(['read-tree', tip], { env });
    for (const screen of receipt.screens)
      for (const kind of IMAGE_KINDS) {
        const file = screen.files?.[kind];
        if (!file) continue;
        const blob = git(['hash-object', '-w', join(REPO_ROOT, file.path)]);
        git(
          [
            'update-index',
            '--add',
            '--cacheinfo',
            `100644,${blob},${file.path}`,
          ],
          { env }
        );
      }
    const tree = git(['write-tree'], { env });
    const message = `evidence: design-present ${receipt.set} gate ${receipt.gateVersion}${receipt.pr ? ` (PR #${receipt.pr})` : ''}`;
    const commit = git([
      'commit-tree',
      tree,
      ...(tip ? ['-p', tip] : []),
      '-m',
      message,
    ]);
    if (push)
      git(['push', 'origin', `${commit}:refs/heads/${EVIDENCE_BRANCH}`]);
    receipt.evidence = { branch: EVIDENCE_BRANCH, commit };
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt.evidence;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--manifest');
  const evidence = publishEvidence({
    manifestPath: resolve(args[i + 1]),
    push: !args.includes('--no-push'),
  });
  console.log(`evidence ${evidence.branch}@${evidence.commit}`);
}
