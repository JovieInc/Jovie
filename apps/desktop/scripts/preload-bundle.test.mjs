import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { bundleDesktopPreload } from './bundle-preload.mjs';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function requiredModuleIds(source) {
  return [...source.matchAll(/require\(["']([^"']+)["']\)/g)].map(
    match => match[1]
  );
}

test('sandboxed preload bundle inlines local modules and exposes app boot APIs', async t => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), 'jovie-preload-bundle-')
  );
  t.after(() => rm(temporaryDirectory, { force: true, recursive: true }));

  const entryPoint = join(temporaryDirectory, 'preload.ts');
  const outfile = join(temporaryDirectory, 'preload.js');
  await Promise.all([
    writeFile(
      entryPoint,
      `import { contextBridge, ipcRenderer } from 'electron';
import { BAKED_DESKTOP_BUILD_IDENTITY } from './build-identity.generated';

const root = globalThis.document?.documentElement;
if (root) {
  root.dataset.desktopChannel = BAKED_DESKTOP_BUILD_IDENTITY.channel;
  root.dataset.desktopVersion = BAKED_DESKTOP_BUILD_IDENTITY.version;
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  electronVersion: process.versions.electron,
  getBuildIdentity: () => ipcRenderer.invoke('get-build-identity'),
  notifyAppBooted: () => {
    ipcRenderer.send('app-booted');
  },
});
`
    ),
    writeFile(
      join(temporaryDirectory, 'build-identity.generated.ts'),
      `export const BAKED_DESKTOP_BUILD_IDENTITY = {
  channel: 'local',
  version: '26.9.2',
  sourceRevision: null,
  builtAt: null,
} as const;
`
    ),
  ]);
  await bundleDesktopPreload({ entryPoint, outfile });

  const requiredModules = [];
  const exposedApis = new Map();
  const invokedChannels = [];
  const sentChannels = [];
  const dataset = {};
  const ipcRenderer = {
    invoke(channel) {
      invokedChannels.push(channel);
      return Promise.resolve(null);
    },
    on() {},
    removeListener() {},
    send(channel) {
      sentChannels.push(channel);
    },
  };

  const source = await readFile(outfile, 'utf8');
  assert.deepEqual([...new Set(requiredModuleIds(source))].sort(), [
    'electron',
  ]);
  assert.doesNotMatch(source, /require\(["']\.[/\\\\]/);

  vm.runInNewContext(
    source,
    {
      document: { documentElement: { dataset } },
      process: { platform: 'darwin', versions: { electron: '44.0.0' } },
      require(id) {
        requiredModules.push(id);
        if (id === 'electron') {
          return {
            contextBridge: {
              exposeInMainWorld(name, api) {
                exposedApis.set(name, api);
              },
            },
            ipcRenderer,
          };
        }
        throw new Error(`module not found: ${id}`);
      },
    },
    { filename: outfile }
  );

  assert.deepEqual(requiredModules, ['electron']);
  const electronApi = exposedApis.get('electronAPI');
  assert.ok(electronApi);
  assert.equal(electronApi.platform, 'darwin');
  assert.equal(electronApi.electronVersion, '44.0.0');
  assert.equal(typeof electronApi.getBuildIdentity, 'function');
  assert.equal(typeof electronApi.notifyAppBooted, 'function');
  assert.equal(dataset.desktopChannel, 'local');
  assert.equal(dataset.desktopVersion, '26.9.2');

  await electronApi.getBuildIdentity();
  electronApi.notifyAppBooted();
  assert.deepEqual(invokedChannels, ['get-build-identity']);
  assert.deepEqual(sentChannels, ['app-booted']);
});

test('every Electron launch and package path bundles the preload', async () => {
  const packageJson = JSON.parse(
    await readFile(join(desktopRoot, 'package.json'), 'utf8')
  );

  assert.equal(packageJson.scripts.compile, 'tsc && pnpm run bundle:preload');
  for (const scriptName of [
    'dev',
    'build:staging',
    'build:production',
    'package:staging',
    'package:production',
    'package:local',
  ]) {
    assert.match(packageJson.scripts[scriptName], /pnpm run compile/);
  }
});

test('the production bundle command writes a sandbox-compatible preload', async () => {
  const productionOutfile = join(desktopRoot, 'dist-electron', 'preload.js');
  await rm(productionOutfile, { force: true });

  await bundleDesktopPreload();

  const source = await readFile(productionOutfile, 'utf8');
  assert.deepEqual([...new Set(requiredModuleIds(source))].sort(), [
    'electron',
  ]);
  assert.doesNotMatch(source, /require\(["']\.[/\\\\]/);
  assert.match(source, /desktopRuntime/);
  assert.match(source, /notifyAppBooted/);
  assert.match(source, /getBuildIdentity/);
});
