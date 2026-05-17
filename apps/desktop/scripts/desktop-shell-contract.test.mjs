import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import { promisify } from 'node:util';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const execFileAsync = promisify(execFile);

test('desktop window enters the authenticated chat shell instead of the web root', async () => {
  const mainSource = await readFile(join(desktopRoot, 'src/main.ts'), 'utf8');

  assert.match(
    mainSource,
    /const APP_ENTRY_URL = buildAppUrl\('\/app\/chat'\);/
  );
  assert.match(mainSource, /url\.searchParams\.set\('runtime', 'electron'\);/);
  assert.match(
    mainSource,
    /const DESKTOP_USER_AGENT_PRODUCT = `JovieDesktop\/\$\{app\.getVersion\(\)\}`;/
  );
  assert.match(
    mainSource,
    /app\.setName\(APP_ENV === 'staging' \? 'Jovie Staging' : 'Jovie'\);/
  );
  assert.match(mainSource, /win\.webContents\.setUserAgent\(/);
  assert.match(
    mainSource,
    /function createWindow\(initialUrl = APP_ENTRY_URL\): BrowserWindow/
  );
  assert.doesNotMatch(
    mainSource,
    /function createWindow\(initialUrl = APP_URL\): BrowserWindow/
  );
});

test('desktop window fails into a branded Jovie recovery surface', async () => {
  const mainSource = await readFile(join(desktopRoot, 'src/main.ts'), 'utf8');

  assert.match(mainSource, /function buildDesktopLoadFailureUrl\(\): string/);
  assert.match(mainSource, /Jovie Desktop/);
  assert.match(mainSource, /Built for artists/);
  assert.match(mainSource, /Desktop shell runtime: Electron/);
  assert.match(mainSource, /data:text\/html;charset=utf-8/);
  assert.match(mainSource, /did-fail-load/);
  assert.match(mainSource, /NAVIGATION_ABORTED_ERROR_CODE/);
  assert.match(mainSource, /showDesktopLoadFailure\(win\)/);
});

test('preload marks the hosted app as Electron after the document root is ready', async () => {
  const preloadSource = await readFile(
    join(desktopRoot, 'src/preload.ts'),
    'utf8'
  );

  assert.match(preloadSource, /function installElectronRuntimeMarker\(\)/);
  assert.match(preloadSource, /new URL\(APP_URL\)\.origin/);
  assert.match(preloadSource, /markElectronRuntime\(\)/);
  assert.match(preloadSource, /DOMContentLoaded/);
  assert.match(preloadSource, /dataset\.desktopRuntime = 'electron'/);
});

test('desktop dev defaults to the local app shell and packaged builds keep production', async () => {
  const packageJson = await readFile(
    join(desktopRoot, 'package.json'),
    'utf8'
  );
  assert.match(
    packageJson,
    /"predev": "cross-env ELECTRON_ENV=local node scripts\/write-env\.mjs"/
  );

  const { stdout: localStdout } = await execFileAsync(
    process.execPath,
    [join(desktopRoot, 'scripts/write-env.mjs')],
    {
      cwd: desktopRoot,
      env: {
        ...process.env,
        ELECTRON_ENV: 'local',
        ELECTRON_APP_URL: 'http://127.0.0.1:3112/app/ignored',
      },
    }
  );
  const localEnv = await readFile(join(desktopRoot, 'src/env.generated.ts'), {
    encoding: 'utf8',
  });
  assert.match(localStdout, /APP_ENV='local'/);
  assert.match(localEnv, /APP_ENV: 'production' \| 'staging' \| 'local'/);
  assert.match(localEnv, /APP_URL = 'http:\/\/127\.0\.0\.1:3112'/);

  const { stdout: productionStdout } = await execFileAsync(
    process.execPath,
    [join(desktopRoot, 'scripts/write-env.mjs')],
    {
      cwd: desktopRoot,
      env: {
        ...process.env,
        ELECTRON_ENV: 'production',
      },
    }
  );
  const productionEnv = await readFile(
    join(desktopRoot, 'src/env.generated.ts'),
    'utf8'
  );
  assert.match(productionStdout, /APP_ENV='production'/);
  assert.match(productionEnv, /APP_URL = 'https:\/\/jov\.ie'/);
});

test('hosted web app has an early Electron runtime marker before first paint', async () => {
  const webRoot = join(desktopRoot, '..', 'web');
  const rootLayout = await readFile(join(webRoot, 'app/layout.tsx'), 'utf8');
  const runtimeInit = await readFile(
    join(webRoot, 'public/electron-runtime-init.js'),
    'utf8'
  );

  assert.match(rootLayout, /<script src='\/electron-runtime-init\.js' \/>/);
  assert.match(runtimeInit, /params\.get\('runtime'\) === 'electron'/);
  assert.match(runtimeInit, /JovieDesktop\\\//);
  assert.match(runtimeInit, /root\.dataset\.desktopRuntime = 'electron'/);
  assert.match(runtimeInit, /root\.dataset\.devChromeDisabled = '1'/);
});
