import fs from 'node:fs';
import path from 'node:path';

function resolveRepoRoot() {
  const fromUrl = path.resolve(new URL('.', import.meta.url).pathname, '..');
  let current = process.cwd();
  const candidates = [fromUrl, current];
  for (let i = 0; i < 6; i += 1) {
    candidates.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return (
    candidates.find(candidate =>
      fs.existsSync(
        path.join(candidate, 'docs/design-system/component-ownership.json')
      )
    ) ?? fromUrl
  );
}

const root = resolveRepoRoot();
const mapPath = path.join(root, 'docs/design-system/component-ownership.json');

const duplicateNames =
  /\b(?:NavigationRail|ContentPlane|ResponsiveFrame|OverlayHost)\b/;
const duplicateChromeConstructors =
  /\bfunction (?:Button|HeaderNav|MarketingFooter|InputAuraFrame|ArtistProfilePhoneFrame|Logo)\b/;
const skippedChromeName =
  /\.(?:test|spec|stories)\.|-fixture|\.fixture|fixtures[/\\]|__tests__[/\\]/;
const scannedChromeExt = /\.(?:css|ts|tsx)$/;

export function readOwnershipMap() {
  return JSON.parse(fs.readFileSync(mapPath, 'utf8'));
}

export function findOwnershipViolations(filePath, source) {
  const normalized = filePath.split(path.sep).join('/');
  if (!normalized.startsWith('apps/web/app/')) return [];
  if (!/\.(?:ts|tsx)$/.test(normalized)) return [];
  if (!duplicateNames.test(source)) return [];
  return [
    {
      filePath: normalized,
      reason: 'route-local shell primitive; import the canonical owner instead',
    },
  ];
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function chromeFamilies(map) {
  return Object.entries(map.families ?? {}).flatMap(([family, entry]) => {
    const internals = [...(entry.internals ?? [])];
    const prefixes = entry.internalPrefixes ?? [];
    if (internals.length === 0 && prefixes.length === 0) return [];
    return [
      {
        family,
        internals,
        prefixes,
        ownerFiles: new Set([entry.owner, ...(entry.ownerFiles ?? [])]),
      },
    ];
  });
}

function shouldSkipChromeFile(normalized) {
  if (!scannedChromeExt.test(normalized)) return true;
  if (skippedChromeName.test(normalized)) return true;
  return false;
}

function classTokenPattern(token) {
  return new RegExp(`(?:^|[^A-Za-z0-9_-])${token}(?:[^A-Za-z0-9_-]|$)`);
}

function matchingInternals(source, family) {
  const hits = new Set();
  for (const internal of family.internals) {
    if (classTokenPattern(internal).test(source)) hits.add(internal);
  }
  for (const prefix of family.prefixes) {
    const matches = source.match(new RegExp(`${prefix}[A-Za-z0-9-]+`, 'g'));
    for (const match of matches ?? []) hits.add(match);
  }
  return [...hits];
}

export function findChromeOverrideViolations(
  filePath,
  source,
  map = readOwnershipMap()
) {
  const normalized = normalizePath(filePath);
  if (shouldSkipChromeFile(normalized)) return [];

  const violations = [];
  if (
    normalized.startsWith('apps/web/app/') &&
    /\.(?:ts|tsx)$/.test(normalized) &&
    duplicateChromeConstructors.test(source)
  ) {
    violations.push({
      filePath: normalized,
      family: 'shared-chrome',
      internal: 'local-constructor',
      reason:
        'route-local chrome constructor; import the canonical owner instead',
    });
  }

  for (const family of chromeFamilies(map)) {
    if (family.ownerFiles.has(normalized)) continue;
    for (const internal of matchingInternals(source, family)) {
      violations.push({
        filePath: normalized,
        family: family.family,
        internal,
        reason: `descendant or copied ${family.family} internal; use the owner variant instead`,
      });
    }
  }
  return violations;
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name === '.next') return [];
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

export function checkRepository() {
  readOwnershipMap();
  return walk(path.join(root, 'apps/web/app'))
    .filter(filePath => /\.(?:ts|tsx)$/.test(filePath))
    .flatMap(filePath =>
      findOwnershipViolations(filePath, fs.readFileSync(filePath, 'utf8'))
    );
}

export function chromeAllowlistKey(violation) {
  return `${violation.filePath}:${violation.internal}`;
}

export function checkChromeRepository(map = readOwnershipMap()) {
  const allow = new Set(map.chromePierceAllowlist ?? []);
  const roots = [
    path.join(root, 'apps/web/app'),
    path.join(root, 'apps/web/components'),
    path.join(root, 'packages/ui'),
  ];
  return roots
    .flatMap(directory => walk(directory))
    .flatMap(filePath =>
      findChromeOverrideViolations(
        path.relative(root, filePath),
        fs.readFileSync(filePath, 'utf8'),
        map
      )
    )
    .filter(violation => !allow.has(chromeAllowlistKey(violation)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const violations = [...checkRepository(), ...checkChromeRepository()];
  if (violations.length > 0) {
    console.error(
      JSON.stringify(
        { schema: 'jovie.component-ownership/v1', violations },
        null,
        2
      )
    );
    process.exitCode = 1;
  }
}
