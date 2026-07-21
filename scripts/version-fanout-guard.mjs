#!/usr/bin/env node

/**
 * Version fan-out guard (main-only version stamping).
 *
 * Version stamping is a MAIN-ONLY / release-path concern. Feature branches and
 * their PRs must NOT bump the global version fan-out files, because concurrent
 * PRs all editing the same lines produce constant, low-value merge conflicts on:
 *   - VERSION
 *   - version.json
 *   - the `version` field of the root + workspace package.json files
 *   - dated release headings in CHANGELOG.md (e.g. `## [26.6.61] - 2026-06-28`)
 *
 * Feature branches MAY still append release notes under the `## [Unreleased]`
 * CHANGELOG section and MAY edit package.json for dependency/script changes — only
 * the `version` field is protected.
 *
 * The actual version stamp happens on the main/release path via
 * `scripts/version-stamp.mjs` after merge. See `.claude/rules/release.md`.
 *
 * Mirrors the structure of `scripts/desktop-release-guard.mjs`: a pure,
 * dependency-injected evaluator plus a thin git-backed CLI wrapper.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/** Branch names that ARE allowed to stamp versions (the release path). */
const STAMP_ALLOWED_BRANCHES = new Set(['main', 'master', 'production']);

/** Files whose any change is a fan-out write on a feature branch. */
const SCALAR_VERSION_FILES = new Set(['VERSION']);

/** Dated CHANGELOG release heading, e.g. `## [26.6.61] - 2026-06-28`. */
const DATED_RELEASE_HEADING =
  /^##\s*\[\d+\.\d+\.\d+(?:\.\d+)?\]\s*-\s*\d{4}-\d{2}-\d{2}\s*$/gm;

/**
 * Branches that should be exempt from the guard entirely (they legitimately
 * carry version bumps): the release path itself, and integration/train branches
 * that gather already-stamped work.
 */
export function isStampAllowedBranch(branch) {
  if (!branch) {
    // No branch context (e.g. direct push event) — treat as the release path.
    return true;
  }
  const normalized = branch.replace(/^origin\//, '').trim();
  if (STAMP_ALLOWED_BRANCHES.has(normalized)) {
    return true;
  }
  // Merge-queue synthetic heads (gh-readonly-queue/<base>/pr-<n>-<sha>) carry
  // the combined main+PR tree with no source-branch context. The pull_request
  // lane already enforces the guard on the source branch, so a queued PR's
  // fan-out writes were validated before enrollment — do not re-classify the
  // queue branch as a feature branch (GH-14658: version-stamp PRs could never
  // pass the merge queue).
  if (normalized.startsWith('gh-readonly-queue/')) {
    return true;
  }
  // Integration / train branches roll up already-stamped commits.
  return /^(integration|train|release|hotfix)\//.test(normalized);
}

function parseJsonVersion(raw) {
  if (raw == null) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.version === 'string' ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

function datedHeadings(changelog) {
  if (!changelog) {
    return new Set();
  }
  return new Set(changelog.match(DATED_RELEASE_HEADING) ?? []);
}

/**
 * Evaluate whether a changeset writes the version fan-out on a non-release branch.
 *
 * @param {object} input
 * @param {string} input.branch - current head branch (e.g. `tim/jov-1234`)
 * @param {string[]} input.changedFiles - repo-relative changed file paths
 * @param {string[]} input.versionedManifests - repo-relative package.json paths to check
 * @param {(path: string) => string | undefined} input.getBaseContent - file content at the base ref
 * @param {(path: string) => string | undefined} input.getHeadContent - file content at HEAD
 * @returns {{ branch: string, enforced: boolean, violations: string[], passed: boolean }}
 */
export function evaluateVersionFanoutGuard({
  branch,
  changedFiles,
  versionedManifests,
  getBaseContent,
  getHeadContent,
}) {
  const normalizedFiles = (changedFiles ?? [])
    .map(file => file.trim())
    .filter(Boolean)
    .map(file => file.replace(/\\/g, '/'));

  const enforced = !isStampAllowedBranch(branch);

  if (!enforced) {
    return {
      branch: branch ?? '',
      enforced: false,
      violations: [],
      passed: true,
    };
  }

  const changed = new Set(normalizedFiles);
  const manifests = new Set(versionedManifests ?? []);
  const violations = [];

  for (const file of normalizedFiles) {
    // 1. Scalar version files: any change is a fan-out write.
    if (SCALAR_VERSION_FILES.has(file)) {
      violations.push(`${file} (version file edited on a feature branch)`);
      continue;
    }

    // 2. version.json: only flag when the version field actually changed.
    if (file === 'version.json') {
      const before = parseJsonVersion(getBaseContent(file));
      const after = parseJsonVersion(getHeadContent(file));
      if (before !== after) {
        violations.push(
          `version.json (version ${before ?? '∅'} → ${after ?? '∅'} on a feature branch)`
        );
      }
      continue;
    }

    // 3. package.json manifests: only the `version` field is protected.
    if (manifests.has(file)) {
      const before = parseJsonVersion(getBaseContent(file));
      const after = parseJsonVersion(getHeadContent(file));
      if (before !== after) {
        violations.push(
          `${file} (version ${before ?? '∅'} → ${after ?? '∅'} on a feature branch)`
        );
      }
      continue;
    }

    // 4. CHANGELOG.md: dated release headings are stamping; [Unreleased] is fine.
    if (file === 'CHANGELOG.md') {
      const before = datedHeadings(getBaseContent(file));
      const after = datedHeadings(getHeadContent(file));
      const added = [...after].filter(heading => !before.has(heading));
      if (added.length > 0) {
        violations.push(
          `CHANGELOG.md (new dated release heading(s) ${added.join(', ')} — add notes under "## [Unreleased]" instead)`
        );
      }
      continue;
    }
  }

  // `changed` is intentionally available for future per-path checks.
  void changed;

  return {
    branch: branch ?? '',
    enforced: true,
    violations,
    passed: violations.length === 0,
  };
}

/** Discover root + workspace package.json files that carry a version field. */
export function discoverVersionedManifests(root = ROOT) {
  const manifests = ['package.json'];
  for (const scope of ['apps', 'packages']) {
    const scopeDir = join(root, scope);
    if (!existsSync(scopeDir)) {
      continue;
    }
    for (const entry of readdirSync(scopeDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const rel = `${scope}/${entry.name}/package.json`;
      if (existsSync(join(root, rel))) {
        manifests.push(rel);
      }
    }
  }
  return manifests.sort();
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] || null;
}

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryGit(args) {
  try {
    return git(args);
  } catch {
    return undefined;
  }
}

function resolveBranch() {
  // PR context first (GitHub Actions sets GITHUB_HEAD_REF on pull_request).
  if (process.env.GITHUB_HEAD_REF) {
    return process.env.GITHUB_HEAD_REF;
  }
  const fromCli = getArgValue('--branch');
  if (fromCli) {
    return fromCli;
  }
  // Push context: checkout often leaves HEAD detached, so prefer the event ref.
  if (process.env.GITHUB_REF_NAME) {
    return process.env.GITHUB_REF_NAME;
  }
  return tryGit(['rev-parse', '--abbrev-ref', 'HEAD']) ?? '';
}

function main() {
  const baseRef =
    getArgValue('--base') ||
    (process.env.GITHUB_BASE_REF
      ? `origin/${process.env.GITHUB_BASE_REF}`
      : 'origin/main');

  const branch = resolveBranch();

  if (isStampAllowedBranch(branch)) {
    console.log(
      `[version-fanout-guard] Branch "${branch || '(push)'}" is a release/integration path — version stamping allowed.`
    );
    return;
  }

  let mergeBase;
  let changedFiles;
  try {
    mergeBase = git(['merge-base', baseRef, 'HEAD']);
    const committed = git(['diff', '--name-only', mergeBase, 'HEAD']);
    const workingTree = git(['diff', '--name-only']);
    changedFiles = [
      ...new Set(`${committed}\n${workingTree}`.split('\n')),
    ].filter(Boolean);
  } catch (error) {
    console.error(
      `[version-fanout-guard] Could not determine changed files against ${baseRef}.`
    );
    if (error instanceof Error && error.message) {
      console.error(error.message);
    }
    process.exit(1);
  }

  const versionedManifests = discoverVersionedManifests();

  const readAt = ref => path => tryGit(['show', `${ref}:${path}`]);
  const readWorkingTree = path => {
    try {
      return readFileSync(join(ROOT, path), 'utf-8');
    } catch {
      return readAt('HEAD')(path);
    }
  };

  const result = evaluateVersionFanoutGuard({
    branch,
    changedFiles,
    versionedManifests,
    getBaseContent: readAt(mergeBase),
    getHeadContent: readWorkingTree,
  });

  if (result.passed) {
    console.log(
      `[version-fanout-guard] No version fan-out writes on feature branch "${branch}".`
    );
    return;
  }

  console.error(
    '[version-fanout-guard] Feature branch modifies main-only version fan-out files.'
  );
  console.error(
    'Version stamping is main-only. Revert these changes; the release path stamps them after merge.'
  );
  console.error(
    'Add release notes under "## [Unreleased]" in CHANGELOG.md instead.'
  );
  console.error(
    'See .claude/rules/release.md → "Version Stamping (main-only)".'
  );
  console.error('Violations:');
  for (const violation of result.violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
