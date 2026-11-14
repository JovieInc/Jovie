import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import ts from 'typescript';

const source = await readFile(
  new URL('../src/main.ts', import.meta.url),
  'utf8'
);
const ast = ts.createSourceFile(
  'main.ts',
  source,
  ts.ScriptTarget.Latest,
  true
);
const compile = text =>
  ts.transpileModule(text, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
const declaration = name => {
  const node = ast.statements.find(
    s => ts.isFunctionDeclaration(s) && s.name?.text === name
  );
  assert.ok(node, `${name} must remain in the real startup path`);
  return node.getText(ast);
};
const ready = ast.statements.find(s =>
  s.getText(ast).startsWith('app.whenReady().then(')
);
assert.ok(ready);

function startup(nightlyUpdateLaunch = false, extra = {}) {
  const calls = [];
  let callback;
  const context = {
    app: {
      whenReady: () => ({
        then: fn => {
          callback = fn;
        },
      }),
      setAboutPanelOptions() {},
      on() {},
      quit() {},
      exit() {},
      dock: { hide() {} },
    },
    session: {
      defaultSession: {
        preconnect: options =>
          calls.push(['preconnect', options.url, options.numSockets]),
      },
    },
    gotSingleInstanceLock: true,
    printBuildIdentityOnStart: false,
    nightlyUpdateLaunch,
    APP_ORIGIN: 'https://app.example',
    APP_URL: 'https://app.example',
    APP_ENTRY_URL: 'https://app.example/app/chat',
    desktopBuildIdentity: {},
    DESKTOP_BUILD_IDENTITY_UNAVAILABLE: 'unknown',
    persistDesktopBuildIdentityEvidence() {},
    getDesktopAppDisplayName() {},
    formatDesktopBuildIdentityDisplay() {},
    toDesktopBuildIdentityJson: () => '',
    console: { info() {} },
    process: { platform: 'darwin', argv: [], stdout: { write() {} } },
    preloadDesktopBootSplashWordmark: async () => {
      calls.push('splash');
    },
    configureDesktopWebAuthn: async () => {
      calls.push('webauthn');
    },
    hydrateWindowState: async () => {
      calls.push('state');
    },
    getAppIconPath() {},
    registerAuthReturnProtocol() {},
    refreshApplicationMenu() {},
    startDesktopAuthLoopbackServer: async () => ({}),
    authLoopbackPort: null,
    configureDesktopAutoUpdater() {},
    runDesktopUpdateCheck() {},
    setTimeout: () => ({ unref() {} }),
    NIGHTLY_UPDATE_TIMEOUT_MS: 100,
    startMainLivenessMonitor: () => calls.push('monitor'),
    createStartupMaintenanceGate() {},
    startupMaintenance: null,
    pendingAuthCompletion: null,
    pendingLegacyAuthReturnRoute: null,
    createWindow: () => calls.push('window'),
    menuBarTray: null,
    handleTrayAction() {},
    MenuBarTray: class {
      constructor() {
        calls.push('tray');
      }
    },
    scheduleNightlyUpdateLaunchAgent() {},
    scheduleDesktopAutoUpdate() {},
    scheduleHudBuildAutoReload() {},
    ...extra,
  };
  runInNewContext(compile(ready.getText(ast)), context);
  return { calls, run: () => callback() };
}

test('S1 preconnect is first on interactive startup and absent on nightly/diagnostic/non-owner launches', async () => {
  const normal = startup();
  await normal.run();
  assert.deepEqual(normal.calls[0], ['preconnect', 'https://app.example', 2]);
  const nightly = startup(true);
  await nightly.run();
  assert.deepEqual(nightly.calls, ['webauthn']);
  const nonOwner = startup(false, { gotSingleInstanceLock: false });
  await nonOwner.run();
  assert.deepEqual(nonOwner.calls, []);
  const diagnostic = startup(false, { printBuildIdentityOnStart: true });
  await diagnostic.run();
  assert.deepEqual(diagnostic.calls, []);
});

test('S3 native prerequisites run together and both finish before window then tray', async () => {
  const starts = [];
  let finishAuth;
  let finishState;
  const instance = startup(false, {
    configureDesktopWebAuthn: () => {
      assert.ok(instance.calls.includes('monitor'));
      starts.push('auth');
      return new Promise(resolve => {
        finishAuth = resolve;
      });
    },
    hydrateWindowState: () => {
      starts.push('state');
      return new Promise(resolve => {
        finishState = resolve;
      });
    },
  });
  const pending = instance.run();
  assert.deepEqual(starts, ['auth', 'state']);
  finishState();
  await Promise.resolve();
  assert.ok(!instance.calls.includes('window'));
  finishAuth();
  await pending;
  assert.deepEqual(instance.calls.slice(-2), ['window', 'tray']);
});

test('S2 updater loads on first supported check, configures once and retains event delivery', async () => {
  const imports = ast.statements.filter(
    s =>
      ts.isImportDeclaration(s) && s.moduleSpecifier.text === 'electron-updater'
  );
  assert.ok(
    imports.every(s => s.importClause?.isTypeOnly),
    'no eager updater import'
  );
  assert.ok(
    !ast.statements.some(s => s.getText(ast).startsWith('autoUpdater.on(')),
    'no eager listener registration'
  );
  let loads = 0;
  let checks = 0;
  let supported = false;
  const events = [];
  const effects = [];
  const updater = Object.assign(new EventEmitter(), {
    checkForUpdates: async () => {
      checks++;
    },
    checkForUpdatesAndNotify: async () => {
      checks++;
    },
  });
  const bindings = {};
  runInNewContext(
    compile(
      await readFile(
        new URL('../src/desktop-auto-update-events.ts', import.meta.url),
        'utf8'
      )
    ),
    { exports: bindings }
  );
  const context = {
    bindDesktopAutoUpdaterEvents: bindings.bindDesktopAutoUpdaterEvents,
    require: id => {
      assert.equal(id, 'electron-updater');
      loads++;
      return { autoUpdater: updater };
    },
    desktopUpdatesSupported: () => supported,
    APP_ENV: 'staging',
    startupMaintenance: null,
    pendingManualUpdateCheck: false,
    lastDesktopUpdateCheckMs: null,
    nightlyUpdateLaunch: false,
    updateReadyToInstall: false,
    pushUpdateEvent: event => events.push(event),
    refreshApplicationMenu() {},
    sendToAppWindows() {},
    UPDATE_AVAILABLE_CHANNEL: 'available',
    UPDATE_DOWNLOADED_CHANNEL: 'downloaded',
    installDownloadedUpdateIfIdle: () => effects.push('idle-install'),
    installNightlyDownloadedUpdate: () => effects.push('nightly-install'),
    showManualUpdateCheckFeedback: outcome => effects.push(outcome),
    app: { quit: () => effects.push('quit') },
  };
  runInNewContext(
    compile(
      `let autoUpdater;\n${['configureDesktopAutoUpdater', 'handleDesktopUpdateEvent', 'runDesktopUpdateCheck'].map(declaration).join('\n')}`
    ),
    context
  );
  assert.equal(loads, 0);
  context.runDesktopUpdateCheck('silent');
  assert.equal(loads, 0);
  supported = true;
  context.runDesktopUpdateCheck('silent');
  context.runDesktopUpdateCheck('notify');
  context.configureDesktopAutoUpdater();
  assert.equal(loads, 1);
  assert.equal(checks, 2);
  for (const name of [
    'checking-for-update',
    'update-available',
    'download-progress',
    'update-downloaded',
    'update-not-available',
    'error',
  ]) {
    assert.equal(updater.listenerCount(name), 1);
  }
  assert.equal(updater.allowPrerelease, true);
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.autoDownload, true);
  assert.equal(updater.autoInstallOnAppQuit, true);
  updater.emit('update-available', { version: '1.2.3' });
  updater.emit('update-downloaded', { version: '1.2.3' });
  assert.deepEqual(
    events.map(e => e.type),
    ['update-available', 'update-downloaded']
  );
  assert.equal(context.updateReadyToInstall, true);
  assert.deepEqual(effects, ['idle-install']);
  updater.emit('checking-for-update');
  updater.emit('download-progress', {
    percent: 25,
    transferred: 10,
    total: 40,
    bytesPerSecond: 2,
  });
  assert.equal(events.at(-1).transferredBytes, 10);
  assert.equal(events.at(-1).bytesPerSecond, 2);
  context.nightlyUpdateLaunch = true;
  updater.emit('update-downloaded', { version: '1.2.3' });
  updater.emit('update-not-available');
  updater.emit('error', 'unavailable');
  assert.equal(events.at(-1).message, 'unavailable');
  assert.deepEqual(effects, [
    'idle-install',
    'nightly-install',
    'not-available',
    'quit',
    'error',
    'quit',
  ]);
});

test('S4 real bundled preload owns fullscreen before hydration and ignores stale snapshots', async () => {
  const bundle = await build({
    entryPoints: [new URL('../src/preload.ts', import.meta.url).pathname],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  });
  for (const rootInitiallyPresent of [true, false]) {
    let resolveSnapshot;
    let observeRoot;
    let disconnected = false;
    const calls = [];
    const listeners = new Map();
    const document = {
      documentElement: rootInitiallyPresent ? { dataset: {} } : null,
      addEventListener() {},
    };
    const context = {
      exports: {},
      process: { platform: 'darwin', versions: { electron: '44' } },
      document,
      MutationObserver: class {
        constructor(callback) {
          observeRoot = callback;
        }
        observe() {}
        disconnect() {
          disconnected = true;
        }
      },
      require: () => ({
        contextBridge: { exposeInMainWorld: name => calls.push(name) },
        ipcRenderer: {
          on: (name, callback) => {
            listeners.set(name, callback);
            calls.push(name);
          },
          invoke: name => {
            calls.push(name);
            return new Promise(resolve => {
              resolveSnapshot = resolve;
            });
          },
        },
      }),
    };
    runInNewContext(bundle.outputFiles[0].text, context);
    assert.deepEqual(calls.slice(0, 2), [
      'desktop-full-screen-changed',
      'desktop-get-full-screen-state',
    ]);
    listeners.get('desktop-full-screen-changed')({}, true);
    if (!rootInitiallyPresent) {
      document.documentElement = { dataset: {} };
      observeRoot();
      assert.equal(disconnected, true);
    }
    assert.equal(document.documentElement.dataset.electronFullscreen, 'true');
    assert.equal(
      document.documentElement.dataset.electronFullscreenManaged,
      'preload'
    );
    resolveSnapshot(false);
    await Promise.resolve();
    assert.equal(document.documentElement.dataset.electronFullscreen, 'true');
    listeners.get('desktop-full-screen-changed')({}, 'invalid');
    assert.equal(document.documentElement.dataset.electronFullscreen, 'true');
    listeners.get('desktop-full-screen-changed')({}, false);
    assert.equal(document.documentElement.dataset.electronFullscreen, 'false');
  }
});

test('S5 titlebar warms only in Electron and rejected warmup preserves the render loader', async () => {
  const slot = await readFile(
    new URL(
      '../../web/components/organisms/DesktopTitlebarSlot.tsx',
      import.meta.url
    ),
    'utf8'
  );
  for (const electron of [false, true]) {
    for (const rejectWarmup of [false, true]) {
      let loads = 0;
      const titlebar = () => null;
      const exports = {};
      runInNewContext(compile(slot), {
        exports,
        require: id => {
          if (id === 'next/dynamic') return { default: loader => loader };
          if (id === '@/lib/desktop/electron-runtime')
            return {
              isElectronRuntime: () => electron,
              useIsElectronRuntime: () => electron,
            };
          if (id === '@/components/organisms/DesktopTitlebar') {
            loads++;
            if (rejectWarmup && loads === 1)
              throw new Error('titlebar warmup unavailable');
            return { DesktopTitlebar: titlebar };
          }
          if (id === 'react/jsx-runtime') return { jsx: type => ({ type }) };
          throw new Error(`unexpected import ${id}`);
        },
      });
      // Flush the real import rejection, including any unhandled rejection.
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(loads, electron ? 1 : 0);
      const rendered = exports.DesktopTitlebarSlot();
      if (electron) {
        assert.equal(await rendered.type(), titlebar);
        assert.equal(loads, 2);
      } else assert.equal(rendered, null);
    }
  }
});

test('S4 initial fullscreen snapshots apply without an event; failed or invalid reads retain live updates', async () => {
  const bundle = await build({
    entryPoints: [new URL('../src/preload.ts', import.meta.url).pathname],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  });
  for (const value of [true, false, null, new Error('IPC unavailable')]) {
    const document = { documentElement: { dataset: {} } };
    const listeners = new Map();
    runInNewContext(bundle.outputFiles[0].text, {
      exports: {},
      document,
      process: { platform: 'darwin', versions: { electron: '44' } },
      require: () => ({
        contextBridge: { exposeInMainWorld() {} },
        ipcRenderer: {
          on: (channel, listener) => listeners.set(channel, listener),
          invoke: () =>
            value instanceof Error
              ? Promise.reject(value)
              : Promise.resolve(value),
        },
      }),
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(
      document.documentElement.dataset.electronFullscreen,
      typeof value === 'boolean' ? String(value) : undefined
    );
    listeners.get('desktop-full-screen-changed')({}, true);
    assert.equal(document.documentElement.dataset.electronFullscreen, 'true');
  }
});
