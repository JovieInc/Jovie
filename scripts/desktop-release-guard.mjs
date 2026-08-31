#!/usr/bin/env node

/**
 * Prevent feature branches from creating competing desktop release state.
 *
 * Desktop changes land with implementation and verification evidence only.
 * The post-land release path owns VERSION, What's New, and the next DMG.
 * Explicit desktop-release workflow maintenance remains admissible.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isStampAllowedBranch } from './version-fanout-guard.mjs';
import {
  discoverVersionedManifests,
  promoteChangelog,
  setManifestVersion,
} from './version-stamp.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DESKTOP_PATH_PREFIX = 'apps/desktop/';
const DESKTOP_PACKAGE_PATH = 'apps/desktop/package.json';
const CHANGELOG_PATH = 'CHANGELOG.md';
const VERSION_PATH = 'VERSION';
const VERSION_JSON_PATH = 'version.json';
const PRELAND_RELEASE_STATE_PATHS = new Set([CHANGELOG_PATH, VERSION_PATH]);
const RELEASE_STAMP_SCALAR_PATHS = new Set([
  CHANGELOG_PATH,
  VERSION_PATH,
  VERSION_JSON_PATH,
]);

function isDesktopReleaseImpactingFile(file) {
  if (!file.startsWith(DESKTOP_PATH_PREFIX)) {
    return false;
  }

  return !/^apps\/desktop\/scripts\/(?:.+\.test\.(mjs|ts|js)|smoke-.+\.mjs)$/.test(
    file
  );
}

function normalizeFiles(files) {
  return (files ?? [])
    .map(file => file.trim())
    .filter(Boolean)
    .map(file => file.replace(/\\/g, '/'));
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

function firstDatedChangelogRelease(changelog) {
  const match = changelog?.match(
    /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/m
  );
  if (!match) {
    return null;
  }
  return { dateISO: match[2], version: match[1] };
}

function releaseStampContentViolations({
  versionedManifests,
  getBaseContent,
  getHeadContent,
}) {
  if (
    typeof getBaseContent !== 'function' ||
    typeof getHeadContent !== 'function'
  ) {
    return ['release stamp content evidence unavailable'];
  }

  const violations = [];
  const headVersion = getHeadContent(VERSION_PATH);
  const nextVersion = headVersion?.trim();
  if (!nextVersion) {
    violations.push(`${VERSION_PATH} missing stamped version`);
  }
  if (headVersion !== `${nextVersion}\n`) {
    violations.push(`${VERSION_PATH} must contain only the stamped version`);
  }

  const headVersionJson = getHeadContent(VERSION_JSON_PATH);
  if (parseJsonVersion(headVersionJson) !== nextVersion) {
    violations.push(`${VERSION_JSON_PATH} version does not match VERSION`);
  }
  if (
    headVersionJson !== `${JSON.stringify({ version: nextVersion }, null, 2)}\n`
  ) {
    violations.push(`${VERSION_JSON_PATH} must match version-stamp output`);
  }

  for (const manifest of versionedManifests) {
    const base = getBaseContent(manifest);
    const head = getHeadContent(manifest);
    if (base == null || head == null) {
      violations.push(`${manifest} content unavailable`);
      continue;
    }
    if (parseJsonVersion(head) !== nextVersion) {
      violations.push(`${manifest} version does not match VERSION`);
      continue;
    }
    try {
      if (setManifestVersion(base, nextVersion) !== head) {
        violations.push(`${manifest} changed more than the version field`);
      }
    } catch {
      violations.push(`${manifest} cannot be deterministically stamped`);
    }
  }

  const baseChangelog = getBaseContent(CHANGELOG_PATH);
  const headChangelog = getHeadContent(CHANGELOG_PATH);
  const release = firstDatedChangelogRelease(headChangelog);
  if (baseChangelog == null || headChangelog == null || release == null) {
    violations.push(`${CHANGELOG_PATH} promoted release evidence unavailable`);
  } else if (release.version !== nextVersion) {
    violations.push(`${CHANGELOG_PATH} release version does not match VERSION`);
  } else if (
    promoteChangelog(baseChangelog, nextVersion, release.dateISO) !==
    headChangelog
  ) {
    violations.push(`${CHANGELOG_PATH} must match version-stamp promotion`);
  }

  return violations;
}

function isCompleteReleaseStamp({
  normalizedFiles,
  versionedManifests,
  desktopFiles,
  getBaseContent,
  getHeadContent,
}) {
  const changed = new Set(normalizedFiles);
  const manifests = normalizeFiles(versionedManifests);
  const expected = new Set([...RELEASE_STAMP_SCALAR_PATHS, ...manifests]);
  const missing = [...expected].filter(file => !changed.has(file));
  const extra = normalizedFiles.filter(file => !expected.has(file));
  const pathPassed =
    manifests.length > 0 &&
    desktopFiles.length === 1 &&
    desktopFiles[0] === DESKTOP_PACKAGE_PATH &&
    missing.length === 0 &&
    extra.length === 0;
  const contentViolations = pathPassed
    ? releaseStampContentViolations({
        versionedManifests: manifests,
        getBaseContent,
        getHeadContent,
      })
    : [];

  return {
    contentViolations,
    extra,
    missing,
    passed: pathPassed && contentViolations.length === 0,
  };
}

export function evaluateDesktopReleaseGuard(input) {
  const options = Array.isArray(input)
    ? { changedFiles: input }
    : (input ?? {});
  const normalizedFiles = normalizeFiles(options.changedFiles);

  const desktopFiles = normalizedFiles.filter(isDesktopReleaseImpactingFile);
  const prelandReleaseStateFiles = normalizedFiles.filter(file =>
    PRELAND_RELEASE_STATE_PATHS.has(file)
  );
  const branch = typeof options.branch === 'string' ? options.branch : '';
  const releaseStamp = isCompleteReleaseStamp({
    normalizedFiles,
    versionedManifests: options.versionedManifests,
    desktopFiles,
    getBaseContent: options.getBaseContent,
    getHeadContent: options.getHeadContent,
  });
  const releaseStampAuthorized =
    isStampAllowedBranch(branch) && releaseStamp.passed;

  return {
    branch,
    changedFiles: normalizedFiles,
    desktopFiles,
    prelandReleaseStateFiles,
    releaseStampAuthorized,
    releaseStampContentViolations: releaseStamp.contentViolations,
    releaseStampExtraFiles: releaseStamp.extra,
    releaseStampMissingFiles: releaseStamp.missing,
    passed:
      desktopFiles.length === 0 ||
      prelandReleaseStateFiles.length === 0 ||
      releaseStampAuthorized,
  };
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
  if (process.env.GITHUB_HEAD_REF) {
    return process.env.GITHUB_HEAD_REF;
  }
  const fromCli = getArgValue('--branch');
  if (fromCli) {
    return fromCli;
  }
  if (process.env.GITHUB_REF_NAME) {
    return process.env.GITHUB_REF_NAME;
  }
  return tryGit(['rev-parse', '--abbrev-ref', 'HEAD']) ?? '';
}

function getChangedFiles(baseRef) {
  const mergeBase = git(['merge-base', baseRef, 'HEAD']);
  const committedOutput = git(['diff', '--name-only', mergeBase, 'HEAD']);
  const workingTreeOutput = git(['diff', '--name-only']);
  return {
    changedFiles: [
      ...new Set(`${committedOutput}\n${workingTreeOutput}`.split('\n')),
    ].filter(Boolean),
    mergeBase,
  };
}

function main() {
  const baseRef =
    getArgValue('--base') ||
    (process.env.GITHUB_BASE_REF
      ? `origin/${process.env.GITHUB_BASE_REF}`
      : 'origin/main');

  let diff;
  try {
    diff = getChangedFiles(baseRef);
  } catch (error) {
    console.error(
      `[desktop-release-guard] Could not determine changed files against ${baseRef}.`
    );
    if (error instanceof Error && error.message) {
      console.error(error.message);
    }
    process.exit(1);
  }

  const readAt = ref => path => tryGit(['show', `${ref}:${path}`]);
  const readWorkingTree = path => {
    try {
      return readFileSync(join(ROOT, path), 'utf-8');
    } catch {
      return readAt('HEAD')(path);
    }
  };
  const result = evaluateDesktopReleaseGuard({
    branch: resolveBranch(),
    changedFiles: diff.changedFiles,
    versionedManifests: discoverVersionedManifests(),
    getBaseContent: readAt(diff.mergeBase),
    getHeadContent: readWorkingTree,
  });

  if (result.passed) {
    if (result.desktopFiles.length === 0) {
      console.log('[desktop-release-guard] No apps/desktop changes detected.');
    } else if (result.releaseStampAuthorized) {
      console.log(
        '[desktop-release-guard] Release-path deterministic desktop version fan-out allowed.'
      );
    } else {
      console.log(
        '[desktop-release-guard] Desktop change defers release state to the post-land publisher.'
      );
    }
    return;
  }

  console.error(
    '[desktop-release-guard] apps/desktop changed with pre-land release state.'
  );
  console.error(
    "Remove CHANGELOG/VERSION artifacts. Record implementation evidence in Linear/the PR; the post-land release path owns What's New, VERSION, and DMG publication."
  );
  console.error('Pre-land release state:');
  for (const file of result.prelandReleaseStateFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
