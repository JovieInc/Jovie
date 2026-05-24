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
import { fileURLToPath } from 'node:url';

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

const version = readRequiredFile(VERSION_FILE, 'VERSION file').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(
    `[sync-version] VERSION file is not a valid semver string: "${version}"`
  );
  process.exit(1);
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
  process.exit(0);
}

const previous = pkg.version;
pkg.version = version;
writeFileSync(PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(`[sync-version] ${previous} → ${version}`);
