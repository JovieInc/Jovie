#!/usr/bin/env node
/**
 * Syncs apps/desktop/package.json version with the repo-root VERSION file.
 *
 * electron-builder reads the app version from this package.json. Without this
 * sync, every build ships as 0.1.0 and electron-updater cannot compare
 * versions, so auto-update silently does nothing.
 *
 * Runs as a prebuild hook for build:staging and build:production.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

const VERSION_FILE = join(REPO_ROOT, 'VERSION');
const PACKAGE_JSON = join(__dirname, '..', 'package.json');

function fail(message, error) {
  console.error(message);
  if (error instanceof Error) {
    console.error(`[sync-version] ${error.message}`);
  }
  process.exit(1);
}

function readRequiredFile(filePath, description) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(
      `[sync-version] Could not read ${description} at ${filePath}. ` +
        'Create the file or run the desktop prebuild step from the repo root.',
      error
    );
  }
}

export function resolveDesktopVersion({
  desktopVersion,
  electronEnv,
  repoVersion,
}) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(repoVersion);
  if (!match) {
    throw new Error(
      `[sync-version] VERSION file is not a valid semver string: "${repoVersion}"`
    );
  }
  if (!desktopVersion && electronEnv !== 'staging') {
    return repoVersion;
  }
  if (!desktopVersion) {
    throw new Error(
      '[sync-version] DESKTOP_VERSION is required for staging builds.'
    );
  }
  if (electronEnv !== 'staging') {
    throw new Error(
      '[sync-version] DESKTOP_VERSION override is allowed only for staging builds.'
    );
  }
  const [, major, minor, patch] = match;
  const expectedCore = `${major}.${minor}.${Number(patch) + 1}`;
  const escapedCore = expectedCore.replaceAll('.', '\\.');
  const stagingPattern = new RegExp(
    `^${escapedCore}-staging\\.[1-9][0-9]*\\.[1-9][0-9]*$`
  );
  if (!stagingPattern.test(desktopVersion)) {
    throw new Error(
      `[sync-version] DESKTOP_VERSION must be a ${expectedCore}-staging.<run>.<attempt> prerelease.`
    );
  }
  return desktopVersion;
}

export function deriveStagingReleaseVersion(baseVersion, runId, runAttempt) {
  if (!/^[1-9][0-9]*$/.test(runId) || !/^[1-9][0-9]*$/.test(runAttempt)) {
    throw new Error(
      '[sync-version] GitHub run coordinates must be positive integers.'
    );
  }
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(baseVersion);
  if (!match) {
    throw new Error('[sync-version] Base desktop version is not valid semver.');
  }
  const nextPatch = Number(match[3]) + 1;
  if (!Number.isSafeInteger(nextPatch)) {
    throw new Error('[sync-version] Desktop patch version overflowed.');
  }
  return `${match[1]}.${match[2]}.${nextPatch}-staging.${runId}.${runAttempt}`;
}

function main() {
  const repoVersion = readRequiredFile(VERSION_FILE, 'VERSION file').trim();
  if (process.argv[2] === '--staging-version') {
    console.log(
      deriveStagingReleaseVersion(repoVersion, process.argv[3], process.argv[4])
    );
    return;
  }
  let version;
  try {
    version = resolveDesktopVersion({
      desktopVersion: process.env.DESKTOP_VERSION,
      electronEnv: process.env.ELECTRON_ENV,
      repoVersion,
    });
  } catch (error) {
    fail('[sync-version] Could not resolve the desktop build version.', error);
  }

  const packageJson = readRequiredFile(PACKAGE_JSON, 'desktop package.json');
  let pkg;
  try {
    pkg = JSON.parse(packageJson);
  } catch (error) {
    fail(
      `[sync-version] Could not parse desktop package.json at ${PACKAGE_JSON}.`,
      error
    );
  }

  if (pkg.version === version) {
    console.log(`[sync-version] package.json already at ${version}`);
    return;
  }

  const previous = pkg.version;
  pkg.version = version;
  writeFileSync(PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  console.log(`[sync-version] ${previous} → ${version}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
