#!/usr/bin/env node
/**
 * Audit installed Jovie desktop shells under /Applications (macOS).
 *
 * Flags legacy bundle IDs, multiple concurrent processes, and CDP exposure.
 * See apps/desktop/SIGNING.md for the canonical build matrix.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const APPLICATIONS_DIR = '/Applications';
export const DESKTOP_UPDATE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export const STAGING_DESKTOP_RELEASE_TAG = 'desktop-staging';
const GITHUB_API = 'https://api.github.com';
const GITHUB_REPO = 'JovieInc/Jovie';

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

/** @param {string} appPath */
export function readBundleShortVersion(appPath) {
  try {
    return execFileSync(
      'plutil',
      [
        '-extract',
        'CFBundleShortVersionString',
        'raw',
        path.join(appPath, 'Contents/Info.plist'),
      ],
      { encoding: 'utf8' }
    ).trim();
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   readonly channel: string;
 *   readonly installedVersion: string | null;
 *   readonly latestVersion: string | null;
 *   readonly latestPublishedAt: string | null;
 *   readonly now?: Date;
 *   readonly staleAfterMs?: number;
 * }} input
 */
export function evaluateDesktopUpdateFreshness(input) {
  const installed = input.installedVersion?.trim() || null;
  const channel = input.channel;
  if (!installed) {
    return { channel, status: 'not-installed', red: false, reason: null };
  }
  if (!input.latestVersion || !input.latestPublishedAt) {
    return {
      channel,
      status: 'unknown',
      red: true,
      reason: `${channel}: latest shipped version is unknown.`,
    };
  }
  if (installed === input.latestVersion) {
    return { channel, status: 'current', red: false, reason: null };
  }
  const publishedAt = new Date(input.latestPublishedAt);
  if (Number.isNaN(publishedAt.getTime())) {
    return {
      channel,
      status: 'unknown',
      red: true,
      reason: `${channel}: latest published_at is invalid.`,
    };
  }
  const lagMs = (input.now ?? new Date()).getTime() - publishedAt.getTime();
  const staleAfterMs = input.staleAfterMs ?? DESKTOP_UPDATE_STALE_AFTER_MS;
  if (lagMs <= staleAfterMs) {
    return {
      channel,
      status: 'updating',
      red: false,
      reason: `${channel}: installed ${installed} is behind ${input.latestVersion} for less than 24h.`,
    };
  }
  return {
    channel,
    status: 'stale',
    red: true,
    reason: `${channel}: installed ${installed} is behind ${input.latestVersion} for more than 24h.`,
  };
}

/** @returns {Promise<{ readonly name?: unknown; readonly published_at?: unknown }>} */
async function githubJson(url, fetchImpl = fetch) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'jovie-desktop-update-freshness',
  };
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub ${response.status} for ${url}`);
  return /** @type {Promise<{ readonly name?: unknown; readonly published_at?: unknown }>} */ (
    response.json()
  );
}

function shippedVersion(release, prefix) {
  const name = typeof release?.name === 'string' ? release.name : null;
  return {
    version: prefix && name ? name.replace(prefix, '') : name,
    publishedAt:
      typeof release?.published_at === 'string' ? release.published_at : null,
  };
}

export async function fetchShippedDesktopVersions(fetchImpl = fetch) {
  const production = await githubJson(
    `${GITHUB_API}/repos/${GITHUB_REPO}/releases/latest`,
    fetchImpl
  );
  const staging = await githubJson(
    `${GITHUB_API}/repos/${GITHUB_REPO}/releases/tags/${STAGING_DESKTOP_RELEASE_TAG}`,
    fetchImpl
  ).catch(() => null);
  return {
    production: shippedVersion(production),
    staging: shippedVersion(staging, /^Desktop staging\s+/i),
  };
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

async function maybeEvaluateFreshness(result) {
  const shipped = await fetchShippedDesktopVersions();
  const freshness = result.bundles.flatMap(bundle => {
    const role =
      bundle.identifier && KNOWN_DESKTOP_BUNDLE_IDS[bundle.identifier]?.role;
    if (role !== 'production' && role !== 'staging') return [];
    const latest = shipped[role];
    return [
      evaluateDesktopUpdateFreshness({
        channel: role,
        installedVersion: readBundleShortVersion(bundle.path) || bundle.version,
        latestVersion: latest.version,
        latestPublishedAt: latest.publishedAt,
      }),
    ];
  });
  const red = freshness.filter(item => item.red);
  const hermesHome = process.env.HERMES_HOME;
  if (hermesHome) {
    const statePath = path.join(
      hermesHome,
      'state',
      'desktop-update-freshness.json'
    );
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(
      statePath,
      `${JSON.stringify({ generatedAt: new Date().toISOString(), red: red.length > 0, channels: freshness })}\n`
    );
  }
  const rows = freshness.map(
    item =>
      `- ${item.channel}: ${item.status}${item.reason ? ` (${item.reason})` : ''}`
  );
  return {
    report: `\nUpdate freshness:\n${rows.join('\n') || '- no production or staging shells installed'}`,
    red,
  };
}

if (isMainModule()) {
  const result = runDesktopInstalledAppsAudit();
  console.log(result.report);
  const run = async () => {
    if (process.argv.includes('--freshness')) {
      const evaluated = await maybeEvaluateFreshness(result);
      console.log(evaluated.report);
      if (process.argv.includes('--fail-on-stale') && evaluated.red.length) {
        process.exit(1);
      }
    }
    if (process.argv.includes('--fail-on-findings') && !result.ok) {
      process.exit(1);
    }
  };
  run().catch(error => {
    console.error(
      `[desktop-installed-apps-audit] ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  });
}
