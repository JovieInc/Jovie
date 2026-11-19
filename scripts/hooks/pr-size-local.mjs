#!/usr/bin/env node
/**
 * Pre-push PR Size Guard: the same verdict CI's required "PR Size Guard" check
 * would reach, before the remote sees the push.
 *
 * Nothing here re-implements policy. It composes the modules CI uses:
 *   - scripts/lib/pr-size-count.mjs      (numstat rows, renames once, binary 0)
 *   - scripts/lib/pr-size-exclusions.mjs (generated/lock/snapshot + tests/fixtures not counted)
 *   - scripts/lib/pr-size-guard-policy.mjs (standard cap, integration-train cap)
 *   - scripts/lib/pr-size-policy.json    (caps, opt-out labels, skip rules; same contents as the LATER .github/pr-size-policy.json once that workflow PR lands)
 *
 * Base: the PR's base branch when known (gh, 5s budget), else
 * JOVIE_PR_BASE, else origin/main. Diff is merge-base(base, HEAD)..HEAD, the
 * same range CI checks. Stacked branches: set JOVIE_PR_BASE=<parent branch>
 * or open the child PR against its parent first.
 *
 * Labels: read from the open PR when gh is available. Before a PR exists, a
 * planned approved codemod can declare JOVIE_PR_SIZE_LABEL=big-pr|codemod; the
 * hook then passes and warns that CI still requires the real label.
 *
 * Exit 0 pass, 1 over cap. Infrastructure problems (no origin/main, git error)
 * warn and exit 0: CI is the authoritative, fail-closed gate.
 * Bypass one push: git push --no-verify. Kill switch: JOVIE_PR_SIZE_LOCAL=0.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { countRows } from '../lib/pr-size-count.mjs';
import { filterCountedRows } from '../lib/pr-size-exclusions.mjs';
import { evaluatePrSizePolicy } from '../lib/pr-size-guard-policy.mjs';

const say = msg => console.error(`[pr-size/local] ${msg}`);

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** Open-PR metadata for this branch, or null. Never blocks longer than 5s. */
export function readOpenPr(cwd, run = spawnSync) {
  if (process.env.JOVIE_PR_SIZE_GH === '0') return null;
  const r = run(
    'gh',
    ['pr', 'view', '--json', 'number,baseRefName,labels,body,author'],
    { cwd, encoding: 'utf8', timeout: 5000 }
  );
  if (r.error || r.status !== 0 || !r.stdout) return null;
  try {
    const pr = JSON.parse(r.stdout);
    return {
      number: pr.number,
      base: pr.baseRefName,
      labels: (pr.labels ?? []).map(l => l.name),
      body: pr.body ?? '',
      author: pr.author?.login ?? '',
    };
  } catch {
    return null;
  }
}

export function loadPolicy(root) {
  // Prefer .github/ once the LATER workflow PR lands that file; until then the
  // hook reads scripts/lib so this PR does not touch .github/ (CODEOWNERS).
  const candidates = [
    join(root, '.github/pr-size-policy.json'),
    join(root, 'scripts/lib/pr-size-policy.json'),
  ];
  let lastErr;
  for (const p of candidates) {
    try {
      return JSON.parse(readFileSync(p, 'utf8'));
    } catch (err) {
      lastErr = err;
      if (err && err.code !== 'ENOENT') throw err;
    }
  }
  throw lastErr ?? new Error('pr-size-policy.json not found');
}

/**
 * Pure decision so tests can drive every branch.
 * @returns {{ code: 0|1, lines: string[] }}
 */
export function decide({
  policy,
  rows,
  labels,
  body,
  branch,
  author,
  declared,
}) {
  const out = [];
  if (
    policy.skipHeadRefs.includes(branch) ||
    policy.skipAuthors.includes(author)
  ) {
    return {
      code: 0,
      lines: [`skipped: ${branch || author} is exempt in CI too`],
    };
  }
  const allLabels = [...labels];
  if (declared && !allLabels.includes(declared)) {
    if (!policy.optOutLabels.includes(declared)) {
      return {
        code: 1,
        lines: [
          `JOVIE_PR_SIZE_LABEL=${declared} is not an opt-out label (${policy.optOutLabels.join(', ')})`,
        ],
      };
    }
    out.push(
      `declared ${declared}: passing locally; CI still requires the real "${declared}" label on the PR`
    );
    allLabels.push(declared);
  }
  if (allLabels.some(l => policy.optOutLabels.includes(l))) {
    return { code: 0, lines: [...out, 'opt-out label present (same as CI)'] };
  }
  const counted = filterCountedRows(rows.join('\n'))
    .split('\n')
    .filter(Boolean);
  const total = counted.reduce((s, r) => s + Number(r.split('\t')[0]), 0);
  const result = evaluatePrSizePolicy({
    labels: allLabels,
    body,
    lines: total,
    files: counted.length,
    maxLines: policy.maxLines,
    maxFiles: policy.maxFiles,
  });
  out.push(
    `${result.passed ? 'ok' : 'BLOCKED'}: ${result.reason} (${total} lines / ${counted.length} files counted; cap ${result.capLines}/${result.capFiles}; tests, fixtures, generated and lock files excluded)`
  );
  if (!result.passed) {
    const top = counted
      .map(r => r.split('\t'))
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .slice(0, 8)
      .map(([n, p]) => `  ${n}\t${p}`);
    out.push('largest counted files:', ...top);
    out.push(
      'Split into stacked PRs (each child targets its parent) or independent siblings.',
      'Approved mechanical codemod? Add the "big-pr" or "codemod" label to the PR (or declare JOVIE_PR_SIZE_LABEL before the PR exists).',
      'One-off bypass: git push --no-verify (the required PR Size Guard check will still fail).'
    );
  }
  return { code: result.passed ? 0 : 1, lines: out };
}

export function main({ cwd = process.cwd(), env = process.env } = {}) {
  if (env.JOVIE_PR_SIZE_LOCAL === '0') {
    say('skipped (JOVIE_PR_SIZE_LOCAL=0); CI PR Size Guard still enforces');
    return 0;
  }
  const root = git(['rev-parse', '--show-toplevel'], cwd);
  if (!root) return 0;
  const branch = git(['branch', '--show-current'], root) ?? '';
  const pr = readOpenPr(root);
  const baseName = pr?.base ?? env.JOVIE_PR_BASE ?? 'main';
  const baseRef =
    git(
      ['rev-parse', '--verify', '--quiet', `origin/${baseName}^{commit}`],
      root
    ) ??
    git(['rev-parse', '--verify', '--quiet', `${baseName}^{commit}`], root);
  if (!baseRef) {
    say(
      `cannot resolve base "${baseName}"; fetch it to check locally (CI enforces)`
    );
    return 0;
  }
  const mergeBase = git(['merge-base', baseRef, 'HEAD'], root);
  if (!mergeBase) {
    say('no merge base with the PR base; skipping (CI enforces)');
    return 0;
  }
  let rows;
  try {
    rows = countRows(mergeBase, 'HEAD', root);
  } catch (error) {
    say(`git diff failed (${error.message}); skipping (CI enforces)`);
    return 0;
  }
  const { code, lines } = decide({
    policy: loadPolicy(root),
    rows,
    labels: pr?.labels ?? [],
    body: pr?.body ?? '',
    branch,
    author: pr?.author ?? '',
    declared: env.JOVIE_PR_SIZE_LABEL || '',
  });
  if (!pr && baseName === 'main' && code === 1) {
    lines.push(
      'No open PR found: counted against main. If this branch is stacked, set JOVIE_PR_BASE=<parent>.'
    );
  }
  for (const l of lines) say(l);
  return code;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main();
}
