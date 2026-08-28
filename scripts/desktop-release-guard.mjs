#!/usr/bin/env node

/**
 * Prevent feature branches from creating competing desktop release state.
 *
 * Desktop changes land with implementation and verification evidence only.
 * The post-land release path owns VERSION, What's New, and the next DMG.
 * Explicit desktop-release workflow maintenance remains admissible.
 */

import { execFileSync } from 'node:child_process';

const DESKTOP_PATH_PREFIX = 'apps/desktop/';
const PRELAND_RELEASE_STATE_PATHS = new Set(['CHANGELOG.md', 'VERSION']);

function isDesktopReleaseImpactingFile(file) {
  if (!file.startsWith(DESKTOP_PATH_PREFIX)) {
    return false;
  }

  return !/^apps\/desktop\/scripts\/(?:.+\.test\.(mjs|ts|js)|smoke-.+\.mjs)$/.test(
    file
  );
}

export function evaluateDesktopReleaseGuard(changedFiles) {
  const normalizedFiles = changedFiles
    .map(file => file.trim())
    .filter(Boolean)
    .map(file => file.replace(/\\/g, '/'));

  const desktopFiles = normalizedFiles.filter(isDesktopReleaseImpactingFile);
  const prelandReleaseStateFiles = normalizedFiles.filter(file =>
    PRELAND_RELEASE_STATE_PATHS.has(file)
  );

  return {
    changedFiles: normalizedFiles,
    desktopFiles,
    prelandReleaseStateFiles,
    passed: desktopFiles.length === 0 || prelandReleaseStateFiles.length === 0,
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

function getChangedFiles(baseRef) {
  const mergeBase = git(['merge-base', baseRef, 'HEAD']);
  const committedOutput = git(['diff', '--name-only', mergeBase, 'HEAD']);
  const workingTreeOutput = git(['diff', '--name-only']);
  return [
    ...new Set(`${committedOutput}\n${workingTreeOutput}`.split('\n')),
  ].filter(Boolean);
}

function main() {
  const baseRef =
    getArgValue('--base') ||
    (process.env.GITHUB_BASE_REF
      ? `origin/${process.env.GITHUB_BASE_REF}`
      : 'origin/main');

  let changedFiles;
  try {
    changedFiles = getChangedFiles(baseRef);
  } catch (error) {
    console.error(
      `[desktop-release-guard] Could not determine changed files against ${baseRef}.`
    );
    if (error instanceof Error && error.message) {
      console.error(error.message);
    }
    process.exit(1);
  }

  const result = evaluateDesktopReleaseGuard(changedFiles);

  if (result.passed) {
    if (result.desktopFiles.length === 0) {
      console.log('[desktop-release-guard] No apps/desktop changes detected.');
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
