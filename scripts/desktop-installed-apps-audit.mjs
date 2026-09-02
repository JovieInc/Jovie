#!/usr/bin/env node
/**
 * Audit installed Jovie desktop shells under /Applications (macOS).
 *
 * Flags legacy bundle IDs, multiple concurrent processes, and CDP exposure.
 * See apps/desktop/SIGNING.md for the canonical build matrix.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const APPLICATIONS_DIR = '/Applications';
const BUILD_IDENTITY_RESOURCE_NAME = 'build-identity.json';
const FULL_SHA = /^[0-9a-f]{40}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const BUILD_IDENTITY_KEYS = new Set([
  'channel',
  'version',
  'sourceRevision',
  'builtAt',
]);

/** @type {Readonly<Record<string, { readonly role: string; readonly canonical: boolean }>>} */
export const KNOWN_DESKTOP_BUNDLE_IDS = {
  'app.jov.ie': {
    role: 'production',
    canonical: true,
  },
  'app.jov.ie.staging': {
    role: 'staging',
    canonical: false,
  },
  'app.jov.ie.local': {
    role: 'local-dev',
    canonical: false,
  },
};

/** @type {Readonly<Set<string>>} */
export const LEGACY_DESKTOP_BUNDLE_IDS = new Set(['ie.jov.Jovie']);

function isIsoTimestamp(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isDesktopBuildIdentityRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.length === BUILD_IDENTITY_KEYS.size &&
    keys.every(key => BUILD_IDENTITY_KEYS.has(key)) &&
    ['production', 'staging', 'local'].includes(value.channel) &&
    typeof value.version === 'string' &&
    SEMVER.test(value.version) &&
    (value.sourceRevision === null ||
      (typeof value.sourceRevision === 'string' &&
        FULL_SHA.test(value.sourceRevision))) &&
    (value.builtAt === null || isIsoTimestamp(value.builtAt))
  );
}

export function readDesktopBuildIdentity(appPath) {
  const identityPath = path.join(
    appPath,
    'Contents',
    'Resources',
    BUILD_IDENTITY_RESOURCE_NAME
  );
  try {
    const parsed = JSON.parse(readFileSync(identityPath, 'utf8'));
    if (!isDesktopBuildIdentityRecord(parsed)) {
      return { buildIdentity: null, buildIdentityError: 'invalid' };
    }
    return {
      buildIdentity: {
        channel: parsed.channel,
        version: parsed.version,
        sourceRevision: parsed.sourceRevision,
        builtAt: parsed.builtAt,
      },
      buildIdentityError: null,
    };
  } catch {
    return { buildIdentity: null, buildIdentityError: 'unavailable' };
  }
}

function buildIdentityHasReleaseProvenance(identity) {
  return (
    (identity.channel === 'production' || identity.channel === 'staging') &&
    SEMVER.test(identity.version) &&
    typeof identity.sourceRevision === 'string' &&
    FULL_SHA.test(identity.sourceRevision) &&
    isIsoTimestamp(identity.builtAt)
  );
}

/**
 * @param {string} applicationsDir
 * @returns {Array<{ readonly name: string; readonly path: string }>}
 */
export function listJovieApplicationBundles(applicationsDir) {
  if (!existsSync(applicationsDir)) {
    return [];
  }

  return readdirSync(applicationsDir, { withFileTypes: true })
    .filter(
      entry =>
        entry.isDirectory() &&
        entry.name.endsWith('.app') &&
        /^Jovie/i.test(entry.name)
    )
    .map(entry => ({
      name: entry.name,
      path: path.join(applicationsDir, entry.name),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * @param {string} appPath
 * @param {{
 *   readonly runCodesign?: typeof spawnSync;
 *   readonly readVersion?: (appPath: string) => string | null;
 * }} dependencies
 * @returns {{ readonly identifier: string | null; readonly version: string | null }}
 */
export function readCodesignMetadata(
  appPath,
  { runCodesign = spawnSync, readVersion = readApplicationBundleVersion } = {}
) {
  try {
    const result = runCodesign('codesign', ['-dv', appPath], {
      encoding: 'utf8',
    });
    if (result.status !== 0 || result.error) {
      return { identifier: null, version: null };
    }

    // `codesign -d` writes display metadata to stderr even when it succeeds.
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const identifier = output.match(/Identifier=(.+)/)?.[1]?.trim() ?? null;
    return { identifier, version: readVersion(appPath) };
  } catch {
    return { identifier: null, version: null };
  }
}

/**
 * @param {string} appPath
 * @returns {string | null}
 */
export function readApplicationBundleVersion(appPath) {
  const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
  for (const key of ['CFBundleShortVersionString', 'CFBundleVersion']) {
    try {
      return execFileSync(
        'plutil',
        ['-extract', key, 'raw', '-o', '-', infoPlistPath],
        { encoding: 'utf8' }
      ).trim();
    } catch {
      // Try the fallback version key.
    }
  }
  return null;
}

/**
 * @returns {Array<{ readonly pid: string; readonly command: string }>}
 */
export function listRunningJovieProcesses() {
  try {
    const output = execFileSync('ps', ['-axo', 'pid=,command='], {
      encoding: 'utf8',
    });
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => commandRunsJovieDesktopShell(line))
      .map(line => {
        const match = line.match(/^(\d+)\s+(.+)$/);
        return {
          pid: match?.[1] ?? 'unknown',
          command: match?.[2] ?? line,
        };
      });
  } catch {
    return [];
  }
}

/**
 * Match the primary executable of a Jovie app bundle, excluding Electron
 * helpers and unrelated processes whose working path happens to contain Jovie.
 *
 * @param {string} command
 * @returns {boolean}
 */
export function commandRunsJovieDesktopShell(command) {
  return (
    !command.includes('/Contents/Frameworks/') &&
    /\/(Jovie[^/]*)\.app\/Contents\/MacOS\/\1(?:\s|$)/i.test(command)
  );
}

/**
 * @param {string} command
 * @returns {boolean}
 */
export function commandExposesRemoteDebugging(command) {
  return /--remote-debugging-port=\d+/.test(command);
}

/**
 * @param {{
 *   readonly bundles: ReadonlyArray<{
 *     readonly name: string;
 *     readonly path: string;
 *     readonly identifier: string | null;
 *     readonly version: string | null;
 *     readonly buildIdentity?: object | null;
 *     readonly buildIdentityError?: string | null;
 *   }>;
 *   readonly processes: ReadonlyArray<{ readonly pid: string; readonly command: string }>;
 * }} input
 * @returns {{ readonly findings: string[]; readonly ok: boolean }}
 */
export function evaluateDesktopInstalledAppsAudit(input) {
  const findings = [];

  const canonicalBundles = input.bundles.filter(
    bundle =>
      bundle.identifier &&
      KNOWN_DESKTOP_BUNDLE_IDS[bundle.identifier]?.canonical
  );
  if (canonicalBundles.length === 0) {
    findings.push(
      'No canonical production shell found (/Applications/Jovie.app, bundle id app.jov.ie).'
    );
  } else if (canonicalBundles.length > 1) {
    findings.push(
      `Multiple production shells detected: ${canonicalBundles.map(bundle => bundle.name).join(', ')}.`
    );
  }

  for (const bundle of input.bundles) {
    if (!bundle.identifier) {
      findings.push(`${bundle.name}: could not read codesign identifier.`);
      continue;
    }

    if (LEGACY_DESKTOP_BUNDLE_IDS.has(bundle.identifier)) {
      findings.push(
        `${bundle.name} uses legacy bundle id ${bundle.identifier}; delete it and use /Applications/Jovie.app (app.jov.ie).`
      );
      continue;
    }

    if (!KNOWN_DESKTOP_BUNDLE_IDS[bundle.identifier]) {
      findings.push(
        `${bundle.name} has unknown bundle id ${bundle.identifier}; verify before keeping it installed.`
      );
      continue;
    }

    if (!bundle.buildIdentity) {
      findings.push(
        `${bundle.name}: packaged build identity is ${bundle.buildIdentityError ?? 'unavailable'}; provenance is not verified.`
      );
      continue;
    }

    const identity = bundle.buildIdentity;
    if (bundle.version !== identity.version) {
      findings.push(
        `${bundle.name}: bundle version ${bundle.version ?? 'unknown'} does not match build identity ${identity.version}.`
      );
    }

    const expectedChannel =
      KNOWN_DESKTOP_BUNDLE_IDS[bundle.identifier].role === 'local-dev'
        ? 'local'
        : KNOWN_DESKTOP_BUNDLE_IDS[bundle.identifier].role;
    if (expectedChannel !== identity.channel) {
      findings.push(
        `${bundle.name}: bundle role ${expectedChannel} does not match build identity channel ${identity.channel}.`
      );
    }

    if (identity.channel === 'local') {
      if (identity.builtAt !== null) {
        findings.push(
          `${bundle.name}: local build identity should not include a build timestamp.`
        );
      }
    } else if (!buildIdentityHasReleaseProvenance(identity)) {
      findings.push(
        `${bundle.name}: build identity is incomplete; provenance is not verified.`
      );
    }
  }

  if (input.processes.length > 1) {
    findings.push(
      `${input.processes.length} Jovie desktop processes are running; keep only the shell you need (typically production OR staging/local for QA).`
    );
  }

  for (const processInfo of input.processes) {
    if (commandExposesRemoteDebugging(processInfo.command)) {
      findings.push(
        `PID ${processInfo.pid} exposes --remote-debugging-port; launch with JOVIE_DEV=1 only during local QA (loopback binding required).`
      );
    }
  }

  return { findings, ok: findings.length === 0 };
}

function formatReport({ bundles, processes, findings, ok }) {
  const lines = ['Jovie desktop /Applications audit', ''];

  if (bundles.length === 0) {
    lines.push('Installed bundles: none matching /Applications/Jovie*.app');
  } else {
    lines.push('Installed bundles:');
    for (const bundle of bundles) {
      const role =
        (bundle.identifier &&
          KNOWN_DESKTOP_BUNDLE_IDS[bundle.identifier]?.role) ||
        (bundle.identifier && LEGACY_DESKTOP_BUNDLE_IDS.has(bundle.identifier)
          ? 'legacy'
          : 'unknown');
      const canonical =
        bundle.identifier &&
        KNOWN_DESKTOP_BUNDLE_IDS[bundle.identifier]?.canonical
          ? 'canonical'
          : 'non-canonical';
      lines.push(
        `- ${bundle.name}: id=${bundle.identifier ?? 'unknown'} version=${bundle.version ?? 'unknown'} role=${role} (${canonical})`
      );
      lines.push(
        `  buildIdentity=${bundle.buildIdentity ? JSON.stringify(bundle.buildIdentity) : (bundle.buildIdentityError ?? 'unavailable')}`
      );
    }
  }

  lines.push('');
  if (processes.length === 0) {
    lines.push('Running processes: none');
  } else {
    lines.push('Running processes:');
    for (const processInfo of processes) {
      lines.push(`- pid=${processInfo.pid} ${processInfo.command}`);
    }
  }

  lines.push('');
  if (ok) {
    lines.push('Result: PASS — no issues detected.');
  } else {
    lines.push('Result: ATTENTION —');
    for (const finding of findings) {
      lines.push(`- ${finding}`);
    }
  }

  return lines.join('\n');
}

export function runDesktopInstalledAppsAudit({
  applicationsDir = APPLICATIONS_DIR,
  listBundles = listJovieApplicationBundles,
  readMetadata = readCodesignMetadata,
  readBuildIdentity = readDesktopBuildIdentity,
  listProcesses = listRunningJovieProcesses,
} = {}) {
  const bundles = listBundles(applicationsDir).map(bundle => ({
    ...bundle,
    ...readMetadata(bundle.path),
    ...readBuildIdentity(bundle.path),
  }));
  const processes = listProcesses();
  const { findings, ok } = evaluateDesktopInstalledAppsAudit({
    bundles,
    processes,
  });

  return {
    bundles,
    processes,
    findings,
    ok,
    report: formatReport({ bundles, processes, findings, ok }),
  };
}

function isMainModule() {
  const invoked = process.argv[1];
  return (
    invoked?.endsWith('desktop-installed-apps-audit.mjs') ||
    invoked?.endsWith('desktop-installed-apps-audit')
  );
}

if (isMainModule()) {
  const failOnFindings = process.argv.includes('--fail-on-findings');
  const result = runDesktopInstalledAppsAudit();
  console.log(result.report);
  if (failOnFindings && !result.ok) {
    process.exit(1);
  }
}
