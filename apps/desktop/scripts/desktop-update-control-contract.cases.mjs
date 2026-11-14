import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// Exercise the production event binding rather than its location or spelling.
// The startup contract also verifies that main binds it once before checking.
test('every updater event the renderer control needs is forwarded as a typed phase', async () => {
  const load = async name => {
    const result = await build({
      entryPoints: [join(desktopRoot, 'src', name)],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      write: false,
    });
    const module = { exports: {} };
    runInNewContext(result.outputFiles[0].text, { module, Error });
    return module.exports;
  };
  const { bindDesktopAutoUpdaterEvents } = await load(
    'desktop-auto-update-events.ts'
  );
  const { reduceDesktopUpdateState } = await load('desktop-auto-update.ts');
  const updater = new EventEmitter();
  const events = [];
  const phases = [];
  const notesUrl = 'https://example.test/changelog';
  bindDesktopAutoUpdaterEvents(updater, event => {
    events.push(event);
    phases.push(reduceDesktopUpdateState(event, notesUrl));
  });
  const inputs = [
    ['checking-for-update'],
    ['update-available', { version: '26.11.3', releaseDate: '2026-11-13' }],
    [
      'download-progress',
      { percent: 25, transferred: 10, total: 40, bytesPerSecond: 2 },
    ],
    ['update-downloaded', { version: '26.11.3' }],
    ['update-not-available'],
    ['error', new Error('Download failed')],
  ];
  assert.deepEqual(
    updater.eventNames().sort(),
    inputs.map(([name]) => name).sort()
  );
  for (const [name, payload] of inputs) {
    assert.equal(updater.listenerCount(name), 1);
    updater.emit(name, payload);
  }
  // Normalize VM object prototypes before comparing observable payloads.
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [
    { type: 'checking-for-update' },
    { type: 'update-available', version: '26.11.3', releaseDate: '2026-11-13' },
    {
      type: 'download-progress',
      percent: 25,
      transferredBytes: 10,
      totalBytes: 40,
      bytesPerSecond: 2,
    },
    { type: 'update-downloaded', version: '26.11.3' },
    { type: 'update-not-available' },
    { type: 'error', message: 'Download failed' },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(phases)), [
    { state: 'checking' },
    {
      state: 'available',
      version: '26.11.3',
      releaseDate: '2026-11-13',
      notesUrl,
    },
    {
      state: 'downloading',
      percent: 25,
      transferredBytes: 10,
      totalBytes: 40,
      bytesPerSecond: 2,
    },
    { state: 'ready', version: '26.11.3' },
    { state: 'not-available' },
    { state: 'error', message: 'Download failed', retryable: true },
  ]);
});

test('the renderer update bridge and the main process agree on every channel', async () => {
  const mainSource = await readFile(join(desktopRoot, 'src/main.ts'), 'utf8');
  const preloadSource = await readFile(
    join(desktopRoot, 'src/preload.ts'),
    'utf8'
  );

  for (const [constant, channel] of [
    ['DESKTOP_UPDATE_STATE_CHANNEL', 'desktop-update-state'],
    ['DESKTOP_UPDATE_GET_STATE_CHANNEL', 'desktop-update-get-state'],
    ['DESKTOP_UPDATE_CHECK_CHANNEL', 'desktop-update-check'],
    ['DESKTOP_UPDATE_DOWNLOAD_CHANNEL', 'desktop-update-download'],
    ['DESKTOP_UPDATE_INSTALL_CHANNEL', 'desktop-update-install'],
  ]) {
    const declaration = new RegExp(`const ${constant} = '${channel}';`);
    assert.match(mainSource, declaration);
    assert.match(preloadSource, declaration);
  }

  const bridge = preloadSource.match(
    /contextBridge\.exposeInMainWorld\('jovieDesktop', \{[\s\S]*?\n\}\);/
  )?.[0];
  assert.ok(bridge, 'missing jovieDesktop bridge');
  assert.match(
    bridge,
    /getState: \(\) => ipcRenderer\.invoke\(DESKTOP_UPDATE_GET_STATE_CHANNEL\)/
  );
  assert.match(
    bridge,
    /check: \(\) => ipcRenderer\.invoke\(DESKTOP_UPDATE_CHECK_CHANNEL\)/
  );
  assert.match(
    bridge,
    /download: \(\) => ipcRenderer\.invoke\(DESKTOP_UPDATE_DOWNLOAD_CHANNEL\)/
  );
  assert.match(
    bridge,
    /install: \(\) => ipcRenderer\.invoke\(DESKTOP_UPDATE_INSTALL_CHANNEL\)/
  );
  assert.match(
    bridge,
    /ipcRenderer\.on\(DESKTOP_UPDATE_STATE_CHANNEL, listener\)/
  );
  assert.match(
    bridge,
    /ipcRenderer\.removeListener\(DESKTOP_UPDATE_STATE_CHANNEL, listener\)/
  );
});

test('renderer restart, retry and download reach the updater behind sender and state guards', async () => {
  const mainSource = await readFile(join(desktopRoot, 'src/main.ts'), 'utf8');
  const handler = channel =>
    mainSource.match(
      new RegExp(
        `ipcMain\\.handle\\(${channel}, event => \\{[\\s\\S]*?\\n\\s*\\}\\);`
      )
    )?.[0] ?? '';

  // Restart: quitAndInstall only for a trusted sender with a staged build,
  // and the control learns why a refused restart cannot simply be retried.
  const install = handler('DESKTOP_UPDATE_INSTALL_CHANNEL');
  assert.match(
    install,
    /if \(!isTrustedIpcSender\(event\)\) return INVALID_IPC;[\s\S]*if \(!updateReadyToInstall\) \{\s*return \{ ok: false, reason: 'update-not-downloaded' \};\s*\}[\s\S]*\.quitAndInstall\(\);\s*return \{ ok: true \};/
  );

  // Retry: a renderer check is silent and reports an unsupported channel.
  const check = handler('DESKTOP_UPDATE_CHECK_CHANNEL');
  assert.match(
    check,
    /if \(!isTrustedIpcSender\(event\)\) return INVALID_IPC;[\s\S]*reason: 'unsupported'[\s\S]*runDesktopUpdateCheck\('silent'\);\s*return \{ ok: true \};/
  );

  // Download: never a second download while one is running or finished, and
  // a failed manual download surfaces as an error phase.
  const download = handler('DESKTOP_UPDATE_DOWNLOAD_CHANNEL');
  assert.match(
    download,
    /desktopUpdatePhase\.state === 'downloading' \|\|\s*desktopUpdatePhase\.state === 'ready'[\s\S]*return \{ ok: true \};/
  );
  assert.match(
    download,
    /\.downloadUpdate\(\)\s*\.catch\(error => pushUpdateEvent\(updateErrorEvent\(error\)\)\)/
  );
});

test('the web update control handles every phase the desktop reducer can emit', async () => {
  const desktopSource = await readFile(
    join(desktopRoot, 'src/desktop-auto-update.ts'),
    'utf8'
  );
  const webRoot = join(desktopRoot, '../web/lib/desktop');
  const webPhaseSource = await readFile(
    join(webRoot, 'desktop-updates.ts'),
    'utf8'
  );
  const controlSource = await readFile(
    join(webRoot, 'desktop-update-control-state.ts'),
    'utf8'
  );

  const phaseType = desktopSource.match(
    /export type DesktopUpdatePhase =[\s\S]*?;\n\n/
  )?.[0];
  assert.ok(phaseType, 'missing DesktopUpdatePhase');
  const phases = [...phaseType.matchAll(/state: '([a-z-]+)'/g)].map(
    match => match[1]
  );
  assert.deepEqual(phases, [
    'idle',
    'checking',
    'not-available',
    'available',
    'downloading',
    'ready',
    'error',
  ]);

  const webPhaseType = webPhaseSource.match(
    /export type DesktopUpdatePhase =[\s\S]*?;\n\n/
  )?.[0];
  assert.ok(webPhaseType, 'missing web DesktopUpdatePhase');
  assert.deepEqual(
    [...webPhaseType.matchAll(/state: '([a-z-]+)'/g)].map(match => match[1]),
    phases,
    'web and desktop phase unions must list the same states'
  );

  const reducePhase = controlSource.match(
    /function reducePhase\([\s\S]*?\n\}\n/
  )?.[0];
  assert.ok(reducePhase, 'missing reducePhase');
  for (const phase of [...phases, 'unsupported']) {
    assert.match(
      reducePhase,
      new RegExp(`case '${phase}':`),
      `control reducer must handle '${phase}'`
    );
  }
});
