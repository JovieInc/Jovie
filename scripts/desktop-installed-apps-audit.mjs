#!/usr/bin/env node
/**
 * Audit installed Jovie desktop shells under /Applications (macOS).
 *
 * Flags legacy bundle IDs, multiple concurrent processes, and CDP exposure.
 * See apps/desktop/SIGNING.md for the canonical build matrix.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const APPLICATIONS_DIR = '/Applications';

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
 * @returns {{ readonly identifier: string | null; readonly version: string | null }}
 */
export function readCodesignMetadata(appPath) {
  try {
    const output = execFileSync('codesign', ['-dv', appPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const identifier = output.match(/Identifier=(.+)/)?.[1]?.trim() ?? null;
    const version =
      output.match(/Info\.plist version=(.+)/)?.[1]?.trim() ?? null;
    return { identifier, version };
  } catch {
    return { identifier: null, version: null };
  }
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
      .filter(
        line =>
          /\/Jovie/i.test(line) &&
          !/grep|desktop-installed-apps-audit/.test(line)
      )
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
  listProcesses = listRunningJovieProcesses,
} = {}) {
  const bundles = listBundles(applicationsDir).map(bundle => ({
    ...bundle,
    ...readMetadata(bundle.path),
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
