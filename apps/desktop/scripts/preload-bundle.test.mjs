import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { bundleDesktopPreload } from './bundle-preload.mjs';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test('sandboxed preload bundle exposes identity and app boot APIs', async t => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), 'jovie-preload-bundle-')
  );
  t.after(() => rm(temporaryDirectory, { force: true, recursive: true }));

  const entryPoint = join(temporaryDirectory, 'preload.ts');
  const outfile = join(temporaryDirectory, 'preload.js');
  await Promise.all([
    readFile(join(desktopRoot, 'src', 'preload.ts'), 'utf8').then(source =>
      writeFile(entryPoint, source)
    ),
    writeFile(
      join(temporaryDirectory, 'build-identity.generated.ts'),
      `export const BAKED_DESKTOP_BUILD_IDENTITY = {
  channel: 'local',
  version: '26.8.2',
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
  assert.match(dataset.desktopChannel, /^(local|staging|production)$/);
  assert.match(dataset.desktopVersion, /^\d+\.\d+\.\d+/);

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
