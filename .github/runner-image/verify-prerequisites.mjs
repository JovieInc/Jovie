#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(
  process.env.JOVIE_RUNNER_REPO_ROOT ?? resolve(scriptDir, '../..')
);
const requirementsPath = resolve(
  process.env.JOVIE_RUNNER_REQUIREMENTS_PATH ??
    resolve(scriptDir, 'prerequisites.json')
);
const markerPath = resolve(
  process.env.JOVIE_RUNNER_PREREQUISITES_MARKER ??
    '/opt/jovie-runner-prerequisites/manifest.json'
);

class RuntimePrerequisiteDriftError extends Error {}

// Runner image builder contract:
// 1. Install the exact lockfile with Node 22 and pnpm 9.15.4, then create the
//    integrity-checked installed-tree archive at installedTreeRoot.
// 2. Set PLAYWRIGHT_BROWSERS_PATH to playwrightBrowsersPath and run
//    `pnpm --filter=@jovie/web exec playwright install --with-deps chromium`.
// 3. Only after the installed tree and browser install succeed, create the marker directory and run
//    `node verify-prerequisites.mjs --write-marker <marker-path>`.
// The marker binds the image to the exact Node, pnpm, Playwright and lockfile.

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function normalizeVersion(version) {
  return version.trim().replace(/^v/, '');
}

function compareVersions(left, right) {
  const a = normalizeVersion(left).split('.').map(Number);
  const b = normalizeVersion(right).split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function currentPnpmVersion() {
  return normalizeVersion(
    execFileSync('pnpm', ['--version'], { encoding: 'utf8' })
  );
}

export function buildExpectedManifest() {
  const requirements = readJson(requirementsPath);
  const nodeVersion = normalizeVersion(process.version);
  const nodeMajor = Number(nodeVersion.split('.')[0]);

  if (
    nodeMajor !== requirements.nodeMajor ||
    compareVersions(nodeVersion, requirements.nodeMinimum) < 0
  ) {
    throw new RuntimePrerequisiteDriftError(
      `Node ${nodeVersion} does not satisfy ${requirements.nodeMinimum} <= Node < ${requirements.nodeMajor + 1}`
    );
  }

  const pnpmVersion = currentPnpmVersion();
  if (pnpmVersion !== requirements.pnpmVersion) {
    throw new RuntimePrerequisiteDriftError(
      `pnpm ${pnpmVersion} does not match required ${requirements.pnpmVersion}`
    );
  }

  const lockfileSha256 = sha256(resolve(repoRoot, 'pnpm-lock.yaml'));
  const installedTreeArchivePath = resolve(
    requirements.installedTreeRoot,
    `${lockfileSha256}.tar`
  );
  let installedTreeArchiveSha256 = '';
  const installedTreeArchiveChecksumPath = `${installedTreeArchivePath}.sha256`;
  if (existsSync(installedTreeArchiveChecksumPath)) {
    const checksum = readFileSync(installedTreeArchiveChecksumPath, 'utf8')
      .trim()
      .split(/\s+/);
    if (
      !/^[0-9a-f]{64}$/.test(checksum[0] ?? '') ||
      basename(checksum[1] ?? '') !== basename(installedTreeArchivePath)
    ) {
      throw new Error(
        `Installed-tree checksum is malformed at ${installedTreeArchiveChecksumPath}`
      );
    }
    [installedTreeArchiveSha256] = checksum;
  }

  return {
    schemaVersion: requirements.schemaVersion,
    nodeVersion,
    pnpmVersion,
    lockfileSha256,
    pnpmStorePath: requirements.pnpmStorePath,
    installedTreeArchivePath,
    installedTreeArchiveSha256,
    playwrightVersion: requirements.playwrightVersion,
    playwrightBrowsersPath: requirements.playwrightBrowsersPath,
    playwrightExecutables: requirements.playwrightExecutables,
  };
}

function differences(expected, actual) {
  const mismatches = [];
  for (const key of Object.keys(expected)) {
    if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key])) {
      mismatches.push(
        `${key}: expected ${JSON.stringify(expected[key])}, got ${JSON.stringify(actual[key])}`
      );
    }
  }
  return mismatches;
}

function validatePaths(manifest, component) {
  const missing = [];
  if (component === 'dependencies') {
    if (
      !existsSync(manifest.installedTreeArchivePath) ||
      !statSync(manifest.installedTreeArchivePath).isFile()
    ) {
      missing.push(manifest.installedTreeArchivePath);
    }
    if (!/^[0-9a-f]{64}$/.test(manifest.installedTreeArchiveSha256)) {
      missing.push(`${manifest.installedTreeArchivePath}.sha256`);
    }
  }
  if (component === 'playwright') {
    for (const executable of manifest.playwrightExecutables) {
      const executablePath = resolve(
        manifest.playwrightBrowsersPath,
        executable
      );
      if (
        !existsSync(executablePath) ||
        (statSync(executablePath).mode & 0o111) === 0
      ) {
        missing.push(executablePath);
      }
    }
  }
  return missing;
}

function validateMarker(marker, schemaVersion) {
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) {
    throw new Error('Runner prerequisite marker must be a JSON object');
  }
  if (marker.schemaVersion !== schemaVersion) {
    throw new Error(
      `Runner prerequisite marker has invalid schema ${JSON.stringify(marker.schemaVersion)}; expected ${JSON.stringify(schemaVersion)}`
    );
  }
  for (const key of [
    'nodeVersion',
    'pnpmVersion',
    'lockfileSha256',
    'pnpmStorePath',
    'installedTreeArchivePath',
    'installedTreeArchiveSha256',
    'playwrightVersion',
    'playwrightBrowsersPath',
  ]) {
    if (typeof marker[key] !== 'string' || marker[key].length === 0) {
      throw new Error(`Runner prerequisite marker has invalid ${key}`);
    }
  }
  if (
    !Array.isArray(marker.playwrightExecutables) ||
    marker.playwrightExecutables.length === 0 ||
    marker.playwrightExecutables.some(
      executable => typeof executable !== 'string' || executable.length === 0
    )
  ) {
    throw new Error(
      'Runner prerequisite marker has invalid playwrightExecutables'
    );
  }
}

function emitOutput(key, value) {
  const line = `${key}=${value}`;
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    writeFileSync(outputPath, `${line}\n`, { flag: 'a' });
  } else {
    process.stdout.write(`${line}\n`);
  }
}

function emitColdFallback(warmKey, details) {
  emitOutput(warmKey, 'false');
  process.stderr.write(
    `Runner image prerequisite drift detected; using cold setup:\n- ${details.join('\n- ')}\n`
  );
}

function verify(component) {
  const warmKey =
    component === 'playwright' ? 'playwright_warm' : 'dependencies_warm';
  if (!existsSync(markerPath)) {
    emitOutput(warmKey, 'false');
    process.stdout.write(
      `Runner prerequisite marker not found at ${markerPath}; using cold setup.\n`
    );
    return;
  }

  let marker;
  try {
    marker = readJson(markerPath);
  } catch (error) {
    throw new Error(
      `Runner prerequisite marker is unreadable: ${error.message}`
    );
  }

  const requirements = readJson(requirementsPath);
  validateMarker(marker, requirements.schemaVersion);

  let expected;
  try {
    expected = buildExpectedManifest();
  } catch (error) {
    if (error instanceof RuntimePrerequisiteDriftError) {
      emitColdFallback(warmKey, [error.message]);
      return;
    }
    throw error;
  }
  const mismatches = differences(expected, marker);
  const missingPaths = validatePaths(marker, component);
  if (mismatches.length > 0 || missingPaths.length > 0) {
    const details = [
      ...mismatches,
      ...missingPaths.map(path => `missing baked path: ${path}`),
    ];
    emitColdFallback(warmKey, details);
    return;
  }

  emitOutput(warmKey, 'true');
  emitOutput('pnpm_store_path', marker.pnpmStorePath);
  emitOutput('installed_tree_archive_path', marker.installedTreeArchivePath);
  emitOutput(
    'installed_tree_archive_sha256',
    marker.installedTreeArchiveSha256
  );
  emitOutput('playwright_browsers_path', marker.playwrightBrowsersPath);
  process.stdout.write(
    `Runner image prerequisites match lockfile ${marker.lockfileSha256}.\n`
  );
}

function writeMarker(destination) {
  const manifest = buildExpectedManifest();
  const missingPaths = [
    ...validatePaths(manifest, 'dependencies'),
    ...validatePaths(manifest, 'playwright'),
  ];
  if (missingPaths.length > 0) {
    throw new Error(
      `Cannot mark an incomplete runner image:\n- ${missingPaths.join('\n- ')}`
    );
  }
  writeFileSync(resolve(destination), `${JSON.stringify(manifest, null, 2)}\n`);
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--write-marker' && args[1]) {
    writeMarker(args[1]);
    return;
  }
  const componentIndex = args.indexOf('--component');
  const component = args[componentIndex + 1];
  if (component !== 'dependencies' && component !== 'playwright') {
    throw new Error(
      'Usage: verify-prerequisites.mjs --component dependencies|playwright'
    );
  }
  verify(component);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
