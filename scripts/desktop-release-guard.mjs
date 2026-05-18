#!/usr/bin/env node

/**
 * Prevent desktop code from landing without release handling.
 *
 * The desktop release workflow only publishes a DMG when VERSION or the
 * workflow itself changes. If apps/desktop changes land without either, users
 * on the shipped app never receive the fix.
 */

import { execFileSync } from 'node:child_process';

const DESKTOP_PATH_PREFIX = 'apps/desktop/';
const RELEASE_HANDLING_PATHS = new Set([
  'VERSION',
  '.github/workflows/desktop-release.yml',
]);

function isDesktopReleaseImpactingFile(file) {
  if (!file.startsWith(DESKTOP_PATH_PREFIX)) {
    return false;
  }

  return !/^apps\/desktop\/scripts\/.+\.test\.mjs$/.test(file);
}

export function evaluateDesktopReleaseGuard(changedFiles) {
  const normalizedFiles = changedFiles
    .map(file => file.trim())
    .filter(Boolean)
    .map(file => file.replace(/\\/g, '/'));

  const desktopFiles = normalizedFiles.filter(isDesktopReleaseImpactingFile);
  const releaseHandlingFiles = normalizedFiles.filter(file =>
    RELEASE_HANDLING_PATHS.has(file)
  );

  return {
    changedFiles: normalizedFiles,
    desktopFiles,
    releaseHandlingFiles,
    passed: desktopFiles.length === 0 || releaseHandlingFiles.length > 0,
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
        `[desktop-release-guard] Desktop release handled by ${result.releaseHandlingFiles.join(', ')}.`
      );
    }
    return;
  }

  console.error(
    '[desktop-release-guard] apps/desktop changed without a DMG release trigger.'
  );
  console.error(
    'Change VERSION to publish a new desktop release, or update .github/workflows/desktop-release.yml with explicit release workflow handling.'
  );
  console.error('Desktop files:');
  for (const file of result.desktopFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
