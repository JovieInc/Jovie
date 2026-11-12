import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// The renderer's DesktopUpdateControl is driven only by these forwards. The
// receiver name and indentation are left open (`.on(`) so a lazily required
// updater still satisfies the contract; the events, payloads and channels may
// not drift. electron-updater's `update-cancelled` and `login` are not
// forwarded: the app never cancels a download or answers a proxy login.
const FORWARDED_UPDATER_EVENTS = [
  'checking-for-update',
  'update-available',
  'update-not-available',
  'download-progress',
  'update-downloaded',
  'error',
];

function updaterListenerBody(mainSource, eventName) {
  const escaped = eventName.replaceAll('-', '\\-');
  const matches = [
    ...mainSource.matchAll(
      new RegExp(`\\.on\\(\\s*'${escaped}',[\\s\\S]*?\\n\\s*\\}\\);`, 'g')
    ),
  ];
  assert.equal(
    matches.length,
    1,
    `expected exactly one '${eventName}' updater listener`
  );
  return matches[0][0];
}

test('every updater event the renderer control needs is forwarded as a typed phase', async () => {
  const mainSource = await readFile(join(desktopRoot, 'src/main.ts'), 'utf8');

  for (const eventName of FORWARDED_UPDATER_EVENTS) {
    const body = updaterListenerBody(mainSource, eventName);
    if (eventName === 'error') {
      assert.match(body, /pushUpdateEvent\(updateErrorEvent\(error\)\)/);
    } else {
      assert.match(
        body,
        new RegExp(`pushUpdateEvent\\(\\{\\s*type: '${eventName}'`),
        `'${eventName}' must be pushed to the renderer`
      );
    }
  }

  // Determinate progress: all four numbers reach the renderer.
  const progress = updaterListenerBody(mainSource, 'download-progress');
  assert.match(progress, /percent: progress\.percent/);
  assert.match(progress, /transferredBytes: progress\.transferred/);
  assert.match(progress, /totalBytes: progress\.total/);
  assert.match(progress, /bytesPerSecond: progress\.bytesPerSecond/);

  // The version travels with the phases that name a build.
  assert.match(
    updaterListenerBody(mainSource, 'update-available'),
    /version: info\.version/
  );
  assert.match(
    updaterListenerBody(mainSource, 'update-downloaded'),
    /pushUpdateEvent\(\{ type: 'update-downloaded', version: info\.version \}\)/
  );

  // One reducer owns the event-to-phase mapping, and each phase is both
  // remembered for late subscribers and pushed to trusted app windows.
  assert.match(
    mainSource,
    /function pushUpdateEvent\(event: DesktopUpdateEvent\): void \{\s*emitDesktopUpdatePhase\(\s*reduceDesktopUpdateState\(event, DESKTOP_UPDATE_NOTES_URL\)\s*\);\s*\}/
  );
  assert.match(
    mainSource,
    /function emitDesktopUpdatePhase\(phase: DesktopUpdatePhase\): void \{\s*desktopUpdatePhase = phase;\s*sendToAppWindows\(DESKTOP_UPDATE_STATE_CHANNEL, phase\);\s*\}/
  );
  assert.match(
    mainSource,
    /ipcMain\.handle\(DESKTOP_UPDATE_GET_STATE_CHANNEL, event =>\s*isTrustedIpcSender\(event\) \? desktopUpdatePhase : null\s*\)/
  );
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
