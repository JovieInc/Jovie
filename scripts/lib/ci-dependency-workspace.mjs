import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WORKSPACE_RECEIPT_SCHEMA = 'jovie-ci-dependency-workspace/v1';
export const WORKSPACE_RECEIPT_PATH =
  'node_modules/.cache/jovie-ci/dependency-workspace.json';

const ROOT_INPUTS = [
  '.npmrc',
  '.nvmrc',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
];
const WORKSPACE_ROOTS = ['apps', 'packages', 'workers'];
const REQUIRED_FILES = [
  'node_modules/.modules.yaml',
  'node_modules/.pnpm/lock.yaml',
  'node_modules/.bin/tsx',
];

function listFiles(root, directory) {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(root, path) : [path];
  });
}

export function dependencyInputPaths(root) {
  const paths = [...ROOT_INPUTS];
  for (const workspaceRoot of WORKSPACE_ROOTS) {
    const absolute = join(root, workspaceRoot);
    if (!existsSync(absolute)) continue;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = join(workspaceRoot, entry.name, 'package.json');
      if (existsSync(join(root, manifest))) paths.push(manifest);
    }
  }
  paths.push(...listFiles(root, 'patches'));
  return paths.sort();
}

export function dependencyInputDigest(root) {
  const hash = createHash('sha256');
  for (const path of dependencyInputPaths(root)) {
    hash.update(path);
    hash.update('\0');
    hash.update(readFileSync(join(root, path)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function expectedPnpmVersion(root) {
  const packageManager = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8')
  ).packageManager;
  const match = /^pnpm@(.+)$/.exec(packageManager ?? '');
  if (!match) throw new Error('package.json must pin packageManager to pnpm');
  return match[1];
}

function expectedNodeVersion(root) {
  return readFileSync(join(root, '.nvmrc'), 'utf8').trim();
}

function assertInstalledTree(root) {
  for (const path of REQUIRED_FILES) {
    if (!statSync(join(root, path), { throwIfNoEntry: false })?.isFile()) {
      throw new Error('dependency workspace is missing file ' + path);
    }
  }
  if (!existsSync(join(root, 'apps/web/node_modules/next'))) {
    throw new Error(
      'dependency workspace is missing apps/web/node_modules/next'
    );
  }
  const sourceLock = readFileSync(join(root, 'pnpm-lock.yaml'));
  const installedLock = readFileSync(
    join(root, 'node_modules/.pnpm/lock.yaml')
  );
  if (!sourceLock.equals(installedLock)) {
    throw new Error('installed dependency lock does not match pnpm-lock.yaml');
  }
}

export function prepareDependencyWorkspace(
  root,
  {
    arch = process.arch,
    nodeVersion = process.version.slice(1),
    platform = process.platform,
    pnpmVersion,
  } = {}
) {
  assertInstalledTree(root);
  const receipt = {
    schema: WORKSPACE_RECEIPT_SCHEMA,
    dependencyInputDigest: dependencyInputDigest(root),
    nodeVersion,
    pnpmVersion,
    platform,
    arch,
  };
  const receiptPath = join(root, WORKSPACE_RECEIPT_PATH);
  mkdirSync(dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

export function validateDependencyWorkspace(
  root,
  {
    arch = process.arch,
    nodeVersion = process.version.slice(1),
    platform = process.platform,
    pnpmVersion,
  } = {}
) {
  assertInstalledTree(root);
  const receipt = JSON.parse(
    readFileSync(join(root, WORKSPACE_RECEIPT_PATH), 'utf8')
  );
  const expected = {
    schema: WORKSPACE_RECEIPT_SCHEMA,
    dependencyInputDigest: dependencyInputDigest(root),
    nodeVersion,
    pnpmVersion,
    platform,
    arch,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(receipt[key]) !== JSON.stringify(value)) {
      throw new Error('dependency workspace receipt mismatch: ' + key);
    }
  }
  return receipt;
}

function runtimeVersions(root) {
  const nodeVersion = process.version.slice(1);
  const pnpmVersion = execFileSync('pnpm', ['--version'], {
    encoding: 'utf8',
  }).trim();
  if (nodeVersion !== expectedNodeVersion(root)) {
    throw new Error('Node ' + nodeVersion + ' does not match .nvmrc');
  }
  if (pnpmVersion !== expectedPnpmVersion(root)) {
    throw new Error('pnpm ' + pnpmVersion + ' does not match packageManager');
  }
  return { nodeVersion, pnpmVersion };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const command = process.argv[2];
  try {
    const versions = runtimeVersions(root);
    const receipt =
      command === 'prepare'
        ? prepareDependencyWorkspace(root, versions)
        : command === 'validate'
          ? validateDependencyWorkspace(root, versions)
          : null;
    if (!receipt) throw new Error('expected prepare or validate');
    const receiptPath = relative(root, join(root, WORKSPACE_RECEIPT_PATH));
    process.stdout.write(
      `${command}d dependency workspace ${receiptPath} (${receipt.dependencyInputDigest})\n`
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}
