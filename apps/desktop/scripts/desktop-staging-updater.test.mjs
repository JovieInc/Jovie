import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { AppUpdater } = require('electron-updater/out/AppUpdater');
const { Provider } = require('electron-updater/out/providers/Provider');
const { releaseIdentityMatchesPackage } = require('./apply-electron-fuses.cjs');

test('pinned updater and packaged staging identity stay fail-closed', async () => {
  const updater = new AppUpdater(null, {
    appUpdateConfigPath: '/tmp/app-update.yml',
    isPackaged: true,
    name: 'Jovie Staging',
    userDataPath: '/tmp',
    version: '26.8.1',
  });
  assert.deepEqual(
    await Promise.all(
      [
        '26.8.2-staging.1200.1',
        '26.8.1-staging.1200.1',
        '26.8.1+staging.1200.1',
      ].map(version => updater.isUpdateAvailable({ version }))
    ),
    [true, false, false]
  );
  const provider = new Provider({ executor: {}, platform: 'darwin' });
  assert.equal(provider.getCustomChannelName('staging'), 'staging-mac');
  updater.channel = 'staging';
  assert.equal(updater.allowDowngrade, true);
  const [config, main] = await Promise.all(
    ['../electron-builder.staging.yml', '../src/main.ts'].map(path =>
      readFile(new URL(path, import.meta.url), 'utf8')
    )
  );
  for (const pattern of [
    /provider:\s*generic/,
    /releases\/download\/desktop-staging/,
    /channel:\s*staging/,
  ])
    assert.match(config, pattern);
  assert.doesNotMatch(main, /autoUpdater\.channel\s*=/);
  assert.match(main, /autoUpdater\.allowDowngrade\s*=\s*false/);
  const matches = (channel, version, id, packagedVersion = version) =>
    releaseIdentityMatchesPackage(
      { channel, version },
      { id, version: packagedVersion }
    );
  assert.deepEqual(
    [
      matches('production', '26.8.1', 'app.jov.ie'),
      matches('production', '26.8.2-staging.1.1', 'app.jov.ie'),
      matches('staging', '26.8.2-staging.1.1', 'app.jov.ie.staging'),
      matches('staging', '26.8.2', 'app.jov.ie.staging'),
      matches('staging', '26.8.2-staging.1.1', 'app.jov.ie'),
      matches(
        'staging',
        '26.8.2-staging.1.1',
        'app.jov.ie.staging',
        '26.8.2-staging.1.2'
      ),
    ],
    [true, false, true, false, false, false]
  );
});
