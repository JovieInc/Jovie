import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const standaloneRoot = path.join(appRoot, '.next', 'standalone', 'apps', 'web');
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

const standaloneRuntimeModuleNames = [
  'require-in-the-middle-a99415fa67232f7f',
  'import-in-the-middle-138cd032e4b029f3',
  'import-in-the-middle-6ecbfda1283b1532',
];

if (!existsSync(standaloneRoot)) {
  throw new Error(
    `Standalone output not found at ${standaloneRoot}. Run "pnpm --filter @jovie/web build" first.`
  );
}

for (const target of copyTargets) {
  if (!existsSync(target.source)) {
    throw new Error(`Missing ${target.label} source at ${target.source}`);
  }

  rmSync(target.destination, { force: true, recursive: true });
  mkdirSync(path.dirname(target.destination), { recursive: true });
  cpSync(target.source, target.destination, { recursive: true });
}

const standaloneNextNodeModules = path.join(standaloneNextRoot, 'node_modules');

for (const moduleName of standaloneRuntimeModuleNames) {
  const destination = path.join(standaloneNextNodeModules, moduleName);
  if (!existsSync(destination)) {
    continue;
  }

  const stat = lstatSync(destination);
  if (!stat.isSymbolicLink()) {
    continue;
  }

  const symlinkTarget = readlinkSync(destination);
  const resolvedSource = realpathSync(
    path.resolve(path.dirname(destination), symlinkTarget)
  );

  rmSync(destination, { force: true, recursive: true });
  cpSync(resolvedSource, destination, { recursive: true, dereference: true });
}

console.log('Synced standalone public and static assets.');
