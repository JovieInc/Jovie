import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
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

const optionalCopyTargets = [
  {
    label: 'standalone generated Next module aliases',
    source: path.join(appRoot, '.next', 'node_modules'),
    destination: path.join(standaloneNextRoot, 'node_modules'),
  },
];

const standaloneRuntimePackages = [
  '@next/env',
  '@swc/helpers',
  'require-in-the-middle',
];
const copiedRuntimePackages = new Set();

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
      const resolvedPath = realpathSync(entryPath);
      const resolvedStats = lstatSync(resolvedPath);

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

function copyRuntimePackageToStandalone(
  packageName,
  resolveFrom = path.dirname(require.resolve('next/package.json'))
) {
  if (copiedRuntimePackages.has(packageName)) {
    return;
  }

  const packageJsonPath = require.resolve(`${packageName}/package.json`, {
    paths: [resolveFrom, path.dirname(require.resolve('next/package.json'))],
  });
  const packageRoot = path.dirname(packageJsonPath);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const destination = path.join(
    standaloneRoot,
    'node_modules',
    ...packageName.split('/')
  );

  rmSync(destination, { force: true, recursive: true });
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(packageRoot, destination, { recursive: true, dereference: true });
  copiedRuntimePackages.add(packageName);

  for (const dependencyName of Object.keys(packageJson.dependencies ?? {})) {
    copyRuntimePackageToStandalone(dependencyName, packageRoot);
  }
}

for (const target of copyTargets) {
  if (!existsSync(target.source)) {
    throw new Error(`Missing ${target.label} source at ${target.source}`);
  }

  rmSync(target.destination, { force: true, recursive: true });
  mkdirSync(path.dirname(target.destination), { recursive: true });
  cpSync(target.source, target.destination, { recursive: true });
}

for (const target of optionalCopyTargets) {
  if (!existsSync(target.source)) {
    continue;
  }

  rmSync(target.destination, { force: true, recursive: true });
  mkdirSync(path.dirname(target.destination), { recursive: true });
  cpSync(target.source, target.destination, { recursive: true });
}

for (const packageName of standaloneRuntimePackages) {
  copyRuntimePackageToStandalone(packageName);
}

/**
 * Turbopack's standalone bundle externalizes some packages with a content
 * hash (e.g. `@sentry/nextjs-223beba69777d308`). Node's runtime require can't
 * resolve those hashed names, so every server response that touches the
 * affected chunk crashes with `Cannot find module '<pkg>-<hash>'`. This
 * appears intermittently after dependency bumps shift the bundle layout.
 *
 * Scan the standalone chunks for those references and stub each hashed name
 * with a tiny re-export package, so Node finds it at runtime.
 *
 * Returns the number of stubs created.
 */
function createHashedExternalStubs(rootDir) {
  const chunksDir = path.join(rootDir, '.next', 'server', 'chunks');
  if (!existsSync(chunksDir)) return 0;

  const referenced = new Set();
  // Match strings like `"@scope/pkg-<hex>"` or `"pkg-<hex>"` where <hex> is 12+ hex chars
  // (Turbopack content hashes are 16 hex chars, but we widen the lower bound).
  const ref = /"((?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*-[0-9a-f]{12,40})"/gi;
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(js|mjs|cjs)$/.test(entry.name)) continue;
      const content = readFileSync(full, 'utf8');
      let m;
      while ((m = ref.exec(content))) {
        const id = m[1];
        // Skip ids that happen to look hashed but aren't a node package
        if (id.startsWith('chunks-') || id.startsWith('static-')) continue;
        referenced.add(id);
      }
    }
  }
  walk(chunksDir);

  if (referenced.size === 0) return 0;

  const nodeModulesRoot = path.join(rootDir, 'node_modules');
  mkdirSync(nodeModulesRoot, { recursive: true });

  let created = 0;
  for (const id of referenced) {
    // Strip the trailing -<hex> to recover the real package name.
    const realName = id.replace(/-[0-9a-f]{12,40}$/i, '');
    if (!realName || realName === id) continue;
    // Verify the real package actually exists in standalone node_modules; if not skip.
    const realPath = path.join(nodeModulesRoot, ...realName.split('/'));
    if (!existsSync(realPath)) continue;

    const stubPath = path.join(nodeModulesRoot, ...id.split('/'));
    if (existsSync(stubPath)) continue;
    mkdirSync(stubPath, { recursive: true });

    const stubPkgJson = {
      name: id,
      version: '0.0.0-stub',
      main: 'index.js',
    };
    writeFileSync(
      path.join(stubPath, 'package.json'),
      JSON.stringify(stubPkgJson, null, 2)
    );
    writeFileSync(
      path.join(stubPath, 'index.js'),
      `module.exports = require(${JSON.stringify(realName)});\n`
    );
    created += 1;
  }
  return created;
}

const stubsCreated = createHashedExternalStubs(standaloneRoot);
if (stubsCreated > 0) {
  console.log(
    `✅ Created ${stubsCreated} hashed-external stub(s) in standalone node_modules`
  );
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
