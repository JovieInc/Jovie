#!/usr/bin/env node
/**
 * Validate packaged Electron app Info.plist metadata for each env variant.
 *
 * Checks CFBundleURLSchemes, CFBundleIdentifier, CFBundleName/DisplayName,
 * and that local/staging/production use isolated data containers (distinct
 * bundle ids).
 *
 * Usage:
 *   node apps/desktop/scripts/validate-packaged-info-plist.mjs \
 *     --app "/Applications/Jovie Local.app" \
 *     --app "/Applications/Jovie Staging.app" \
 *     --app "/Applications/Jovie.app"
 *
 * Or pass dist output dirs via --dist-dir apps/desktop/dist
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, '..');

/** @type {ReadonlyArray<{
 *   role: 'local' | 'staging' | 'production';
 *   appId: string;
 *   productName: string;
 *   scheme: string;
 *   nameMatchers: RegExp[];
 * }>} */
export const DESKTOP_VARIANT_EXPECTATIONS = [
  {
    role: 'local',
    appId: 'app.jov.ie.local',
    productName: 'Jovie Local',
    scheme: 'jovie-local',
    nameMatchers: [/Jovie Local/i],
  },
  {
    role: 'staging',
    appId: 'app.jov.ie.staging',
    productName: 'Jovie Staging',
    scheme: 'jovie-staging',
    nameMatchers: [/Jovie Staging/i],
  },
  {
    role: 'production',
    appId: 'app.jov.ie',
    productName: 'Jovie',
    scheme: 'jovie',
    nameMatchers: [/^Jovie\.app$/i, /^Jovie$/i],
  },
];

/**
 * @param {string} plistPath
 * @returns {string}
 */
export function readPlistXml(plistPath) {
  if (!existsSync(plistPath)) {
    throw new Error(`Info.plist missing: ${plistPath}`);
  }
  // Prefer plutil JSON for robust parsing; fall back to raw XML.
  try {
    return execFileSync('plutil', ['-convert', 'xml1', '-o', '-', plistPath], {
      encoding: 'utf8',
    });
  } catch {
    return readFileSync(plistPath, 'utf8');
  }
}

/**
 * @param {string} xml
 * @param {string} key
 * @returns {string | null}
 */
export function readPlistString(xml, key) {
  const re = new RegExp(
    `<key>${key}<\\/key>\\s*<string>([^<]*)<\\/string>`,
    'i'
  );
  return xml.match(re)?.[1]?.trim() ?? null;
}

/**
 * @param {string} xml
 * @returns {string[]}
 */
export function readPlistUrlSchemes(xml) {
  const schemes = [];
  const blockRe =
    /<key>CFBundleURLSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/gi;
  for (const match of xml.matchAll(blockRe)) {
    const inner = match[1] ?? '';
    for (const stringMatch of inner.matchAll(/<string>([^<]*)<\/string>/gi)) {
      const value = stringMatch[1]?.trim();
      if (value) schemes.push(value);
    }
  }
  return schemes;
}

/**
 * @param {string} appPath
 * @returns {string}
 */
export function resolveInfoPlistPath(appPath) {
  return path.join(appPath, 'Contents', 'Info.plist');
}

/**
 * @param {string} appPath
 * @param {(typeof DESKTOP_VARIANT_EXPECTATIONS)[number]} expectation
 */
export function validatePackagedApp(appPath, expectation) {
  const findings = [];
  const plistPath = resolveInfoPlistPath(appPath);
  if (!existsSync(plistPath)) {
    return {
      ok: false,
      appPath,
      role: expectation.role,
      findings: [`missing Info.plist at ${plistPath}`],
    };
  }

  const xml = readPlistXml(plistPath);
  const identifier =
    readPlistString(xml, 'CFBundleIdentifier') ??
    readPlistString(xml, 'CFBundleID');
  const displayName =
    readPlistString(xml, 'CFBundleDisplayName') ??
    readPlistString(xml, 'CFBundleName');
  const schemes = readPlistUrlSchemes(xml);

  if (identifier !== expectation.appId) {
    findings.push(
      `CFBundleIdentifier expected ${expectation.appId}, got ${identifier ?? 'null'}`
    );
  }

  if (
    displayName &&
    displayName !== expectation.productName &&
    !expectation.nameMatchers.some(re => re.test(displayName))
  ) {
    findings.push(
      `app name expected ${expectation.productName}, got ${displayName}`
    );
  }

  if (!schemes.includes(expectation.scheme)) {
    findings.push(
      `CFBundleURLSchemes missing ${expectation.scheme} (found: ${schemes.join(', ') || 'none'})`
    );
  }

  // Isolated data container = distinct bundle id (already enforced above).
  // Also reject foreign schemes on the wrong variant.
  const foreignSchemes = DESKTOP_VARIANT_EXPECTATIONS.filter(
    variant => variant.role !== expectation.role
  ).map(variant => variant.scheme);
  for (const foreign of foreignSchemes) {
    if (schemes.includes(foreign)) {
      findings.push(
        `${expectation.role} app must not register foreign scheme ${foreign}`
      );
    }
  }

  return {
    ok: findings.length === 0,
    appPath,
    role: expectation.role,
    identifier,
    displayName,
    schemes,
    findings,
  };
}

/**
 * @param {string[]} appPaths
 */
export function validatePackagedApps(appPaths) {
  const results = [];
  const usedRoles = new Set();

  for (const appPath of appPaths) {
    const base = path.basename(appPath);
    const expectation =
      DESKTOP_VARIANT_EXPECTATIONS.find(variant =>
        variant.nameMatchers.some(re => re.test(base))
      ) ??
      DESKTOP_VARIANT_EXPECTATIONS.find(variant => {
        try {
          const xml = readPlistXml(resolveInfoPlistPath(appPath));
          const id = readPlistString(xml, 'CFBundleIdentifier');
          return id === variant.appId;
        } catch {
          return false;
        }
      });

    if (!expectation) {
      results.push({
        ok: false,
        appPath,
        role: 'unknown',
        findings: [`could not map ${base} to a desktop variant`],
      });
      continue;
    }

    usedRoles.add(expectation.role);
    results.push(validatePackagedApp(appPath, expectation));
  }

  // When all three variants are present, confirm isolated containers.
  if (usedRoles.size >= 2) {
    const ids = results.map(result => result.identifier).filter(Boolean);
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      results.push({
        ok: false,
        appPath: '(matrix)',
        role: 'matrix',
        findings: [
          'desktop variants must use distinct CFBundleIdentifier values',
        ],
      });
    }
  }

  return {
    ok: results.every(result => result.ok),
    results,
  };
}

/**
 * Discover .app bundles under dist or Applications.
 * @param {string[]} roots
 */
export function discoverAppBundles(roots) {
  const found = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const st = statSync(root);
    if (st.isDirectory() && root.endsWith('.app')) {
      found.push(root);
      continue;
    }
    if (!st.isDirectory()) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.endsWith('.app')) {
        found.push(path.join(root, entry.name));
      }
      // electron-builder mac unpack sometimes nests under mac/ or mac-universal/
      if (entry.isDirectory() && !entry.name.endsWith('.app')) {
        const nested = path.join(root, entry.name);
        try {
          for (const child of readdirSync(nested, { withFileTypes: true })) {
            if (child.isDirectory() && child.name.endsWith('.app')) {
              found.push(path.join(nested, child.name));
            }
          }
        } catch {
          // ignore unreadable nested dirs
        }
      }
    }
  }
  return [...new Set(found)].sort();
}

function parseArgs(argv) {
  const apps = [];
  const distDirs = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--app' && argv[i + 1]) {
      apps.push(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--dist-dir' && argv[i + 1]) {
      distDirs.push(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      return { help: true, apps, distDirs };
    }
  }
  return { help: false, apps, distDirs };
}

function main() {
  const { help, apps, distDirs } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(`Usage:
  node validate-packaged-info-plist.mjs --app /path/to/Jovie.app [--app ...]
  node validate-packaged-info-plist.mjs --dist-dir apps/desktop/dist`);
    process.exit(0);
  }

  const discovered = [
    ...apps,
    ...discoverAppBundles(
      distDirs.length > 0 ? distDirs : [path.join(desktopRoot, 'dist')]
    ),
  ];

  if (discovered.length === 0) {
    console.error(
      'No .app bundles found. Pass --app paths or package desktop builds first.'
    );
    process.exit(2);
  }

  const report = validatePackagedApps(discovered);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
