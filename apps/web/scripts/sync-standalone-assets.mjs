import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const standaloneOutputRoot = path.join(appRoot, '.next', 'standalone');
const standaloneRoot = path.join(standaloneOutputRoot, 'apps', 'web');
const standaloneNextRoot = path.join(standaloneRoot, '.next');

const copyTargets = [
  {
    label: 'standalone public assets',
    source: path.join(appRoot, 'public'),
    destination: path.join(standaloneRoot, 'public'),
  },
  {
    label: 'standalone static assets',
    source: path.join(appRoot, '.next', 'static'),
    destination: path.join(standaloneNextRoot, 'static'),
  },
];

if (!existsSync(standaloneRoot)) {
  throw new Error(
    `Standalone output not found at ${standaloneRoot}. Run "pnpm --filter @jovie/web build" first.`
  );
}

function countSymlinks(rootDir) {
  let total = 0;

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isSymbolicLink()) {
      total += 1;
      continue;
    }

    if (entry.isDirectory()) {
      total += countSymlinks(entryPath);
    }
  }

  return total;
}

function materializeSymlinks(rootDir) {
  let materialized = 0;

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isSymbolicLink()) {
      let resolvedPath;
      let resolvedStats;
      try {
        resolvedPath = realpathSync(entryPath);
        resolvedStats = lstatSync(resolvedPath);
      } catch {
        // Broken symlink (e.g. optional platform-specific native binary that
        // wasn't installed on this runner). Drop it so the standalone tree is
        // clean; the package is either not needed at runtime or will be
        // resolved against node_modules by Vercel's function packager.
        rmSync(entryPath, { force: true, recursive: true });
        continue;
      }

      rmSync(entryPath, { force: true, recursive: true });

      if (resolvedStats.isDirectory()) {
        cpSync(resolvedPath, entryPath, { recursive: true, dereference: true });
        materialized += 1 + materializeSymlinks(entryPath);
        continue;
      }

      copyFileSync(resolvedPath, entryPath);
      materialized += 1;
      continue;
    }

    if (entry.isDirectory()) {
      materialized += materializeSymlinks(entryPath);
    }
  }

  return materialized;
}

for (const target of copyTargets) {
  if (!existsSync(target.source)) {
    throw new Error(`Missing ${target.label} source at ${target.source}`);
  }

  rmSync(target.destination, { force: true, recursive: true });
  mkdirSync(path.dirname(target.destination), { recursive: true });
  cpSync(target.source, target.destination, { recursive: true });
}

const symlinkCount = countSymlinks(standaloneOutputRoot);

if (symlinkCount > 0) {
  const materializedCount = materializeSymlinks(standaloneOutputRoot);
  const remainingSymlinks = countSymlinks(standaloneOutputRoot);

  if (remainingSymlinks > 0) {
    throw new Error(
      `Standalone output still contains ${remainingSymlinks} symlinks after materialization.`
    );
  }

  console.log(
    `Synced standalone public/static assets and materialized ${materializedCount} standalone symlinks.`
  );
} else {
  console.log('Synced standalone public and static assets.');
}
