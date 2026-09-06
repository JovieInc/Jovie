import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const mapPath = path.join(root, 'docs/design-system/component-ownership.json');

export function readOwnershipMap() {
  return JSON.parse(fs.readFileSync(mapPath, 'utf8'));
}

const duplicateNames = /\b(?:NavigationRail|ContentPlane|ResponsiveFrame|OverlayHost)\b/;

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

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

export function checkRepository() {
  readOwnershipMap();
  return walk(path.join(root, 'apps/web/app'))
    .filter(filePath => /\.(?:ts|tsx)$/.test(filePath))
    .flatMap(filePath => findOwnershipViolations(filePath, fs.readFileSync(filePath, 'utf8')));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const violations = checkRepository();
  if (violations.length > 0) {
    console.error(JSON.stringify({ schema: 'jovie.component-ownership/v1', violations }, null, 2));
    process.exitCode = 1;
  }
}
