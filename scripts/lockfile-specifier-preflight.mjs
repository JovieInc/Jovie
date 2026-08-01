import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
];

function yamlScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed);
  }
  return trimmed;
}

export function parseImporterSpecifiers(lockfile) {
  const lines = lockfile.split(/\r?\n/);
  const importersIndex = lines.findIndex(line => line === 'importers:');
  if (importersIndex === -1)
    throw new Error('pnpm-lock.yaml is missing importers:');

  const importers = new Map();
  let importer;
  let section;
  let dependency;
  for (const line of lines.slice(importersIndex + 1)) {
    if (line && !/^\s/.test(line)) break;
    const importerMatch = line.match(/^  (?! )(.+):(?:\s*\{\})?\s*$/);
    if (importerMatch) {
      importer = yamlScalar(importerMatch[1]);
      importers.set(importer, {});
      section = undefined;
      dependency = undefined;
      continue;
    }
    const sectionMatch = line.match(
      /^    (dependencies|devDependencies|optionalDependencies|peerDependencies):\s*$/
    );
    if (sectionMatch && importer) {
      section = sectionMatch[1];
      dependency = undefined;
      continue;
    }
    const dependencyMatch = line.match(/^      (.+):\s*$/);
    if (dependencyMatch && importer && section) {
      dependency = yamlScalar(dependencyMatch[1]);
      continue;
    }
    const specifierMatch = line.match(/^        specifier:\s*(.+)$/);
    if (specifierMatch && importer && section && dependency) {
      importers.get(importer)[`${section}:${dependency}`] = yamlScalar(
        specifierMatch[1]
      );
    }
  }
  return importers;
}

function workspacePackagePaths(root) {
  const included = new Set(['.']);
  const excluded = new Set();
  const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  for (const match of workspace.matchAll(/^\s*-\s*['"]([^'"]+)['"]\s*$/gm)) {
    const raw = match[1];
    const negated = raw.startsWith('!');
    const pattern = negated ? raw.slice(1) : raw;

    if (pattern.endsWith('/*')) {
      const parent = pattern.slice(0, -2);
      for (const entry of readdirSync(join(root, parent)).sort()) {
        const candidate = join(root, parent, entry);
        if (
          statSync(candidate).isDirectory() &&
          statSync(join(candidate, 'package.json'), { throwIfNoEntry: false })
        ) {
          const rel = relative(root, candidate);
          if (negated) excluded.add(rel);
          else included.add(rel);
        }
      }
      continue;
    }

    // Exact package path (used by pnpm exclusions like !apps/eve-pilot).
    if (negated) {
      excluded.add(pattern);
      continue;
    }

    throw new Error(`Unsupported workspace pattern: ${raw}`);
  }

  for (const path of excluded) included.delete(path);
  return [...included].sort();
}

export function compareWorkspaceSpecifiers({
  root,
  manifestByPath = undefined,
  lockfile,
}) {
  const manifests =
    manifestByPath ??
    new Map(
      workspacePackagePaths(root).map(packagePath => [
        packagePath,
        JSON.parse(
          readFileSync(join(root, packagePath, 'package.json'), 'utf8')
        ),
      ])
    );
  const importers = parseImporterSpecifiers(lockfile);
  const overrides = manifests.get('.')?.pnpm?.overrides ?? {};
  const mismatches = [];
  for (const [packagePath, manifest] of manifests) {
    const importer = importers.get(packagePath);
    if (!importer) {
      mismatches.push({
        packagePath,
        key: '<importer>',
        expected: 'present',
        actual: 'missing',
      });
      continue;
    }
    for (const section of DEPENDENCY_SECTIONS) {
      for (const [name, expected] of Object.entries(manifest[section] ?? {})) {
        const key = `${section}:${name}`;
        const effectiveExpected = overrides[name] ?? expected;
        const actual = importer[key];
        if (actual === undefined) {
          mismatches.push({
            packagePath,
            key,
            expected: effectiveExpected,
            actual: 'missing',
          });
        } else if (actual !== effectiveExpected) {
          mismatches.push({
            packagePath,
            key,
            expected: effectiveExpected,
            actual,
          });
        }
      }
    }
  }
  return mismatches;
}

export function formatMismatches(mismatches) {
  return [
    'Lockfile importer specifier preflight failed:',
    ...mismatches.map(
      ({ packagePath, key, expected, actual }) =>
        `- ${packagePath}: ${key} (manifest=${JSON.stringify(expected)}, lockfile=${JSON.stringify(actual)})`
    ),
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = resolve(process.env.JOVIE_REPO_ROOT ?? process.cwd());
  const mismatches = compareWorkspaceSpecifiers({
    root,
    lockfile: readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'),
  });
  if (mismatches.length) {
    console.error(formatMismatches(mismatches));
    process.exitCode = 1;
  } else {
    console.log('Lockfile importer specifier preflight passed.');
  }
}
