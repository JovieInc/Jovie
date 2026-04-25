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
const repoRoot = path.resolve(appRoot, '..', '..');

const standaloneNextNodeModules = path.join(standaloneNextRoot, 'node_modules');

const standaloneJsdomDependencies = [
  '@asamuzakjp/css-color',
  '@csstools/color-helpers',
  '@csstools/css-calc',
  '@csstools/css-color-parser',
  '@csstools/css-parser-algorithms',
  '@csstools/css-tokenizer',
  'agent-base',
  'cssstyle',
  'data-urls',
  'decimal.js',
  'entities',
  'html-encoding-sniffer',
  'http-proxy-agent',
  'https-proxy-agent',
  'iconv-lite',
  'is-potential-custom-element-name',
  'lru-cache',
  'nwsapi',
  'parse5',
  'punycode',
  'rrweb-cssom',
  'safer-buffer',
  'saxes',
  'symbol-tree',
  'tough-cookie',
  'tr46',
  'w3c-xmlserializer',
  'webidl-conversions',
  'whatwg-encoding',
  'whatwg-mimetype',
  'whatwg-url',
  'ws',
  'xml-name-validator',
  'xmlchars',
];

function pnpmPackagePath(...segments) {
  return path.join(
    repoRoot,
    'node_modules',
    '.pnpm',
    'node_modules',
    ...segments
  );
}

function standaloneNextPackagePath(...segments) {
  return path.join(standaloneNextNodeModules, ...segments);
}

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
  {
    label: 'standalone Sentry debug dependency',
    source: pnpmPackagePath('debug'),
    destination: standaloneNextPackagePath('debug'),
  },
  {
    label: 'standalone Sentry ms dependency',
    source: pnpmPackagePath('ms'),
    destination: standaloneNextPackagePath('ms'),
  },
  {
    label: 'standalone Sentry module-details dependency',
    source: pnpmPackagePath('module-details-from-path'),
    destination: standaloneNextPackagePath('module-details-from-path'),
  },
  ...standaloneJsdomDependencies.map(dependency => ({
    label: `standalone jsdom ${dependency} dependency`,
    source: pnpmPackagePath(dependency),
    destination: standaloneNextPackagePath(dependency),
  })),
  {
    label: 'standalone jsdom tldts transitive dependency',
    source: pnpmPackagePath('tldts'),
    destination: standaloneNextPackagePath('tldts'),
  },
  {
    label: 'standalone jsdom tldts-core transitive dependency',
    source: pnpmPackagePath('tldts-core'),
    destination: standaloneNextPackagePath('tldts-core'),
  },
  {
    label: 'standalone SWC helper dependency',
    source: pnpmPackagePath('@swc', 'helpers'),
    destination: path.join(standaloneRoot, 'node_modules', '@swc', 'helpers'),
  },
  {
    label: 'standalone Next env dependency',
    source: pnpmPackagePath('@next', 'env'),
    destination: path.join(standaloneRoot, 'node_modules', '@next', 'env'),
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
