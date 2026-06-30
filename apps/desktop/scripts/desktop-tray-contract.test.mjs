import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test('tray module exports required types and classes', async () => {
  const traySource = await readFile(join(desktopRoot, 'src/tray.ts'), 'utf8');

  assert.match(traySource, /export type TrayAppState = 'idle' \| 'active' \| 'unread' \| 'error';/);
  assert.match(traySource, /export class MenuBarTray/);
  assert.match(traySource, /export \{ isTrayAppState \}/);
  assert.match(traySource, /setState\(payload: TrayStatePayload\)/);
  assert.match(traySource, /destroy\(\)/);
});

test('main.ts wires tray IPC handler on darwin', async () => {
  const mainSource = await readFile(join(desktopRoot, 'src/main.ts'), 'utf8');

  assert.match(mainSource, /TRAY_SET_STATE_CHANNEL = 'tray-set-state'/);
  assert.match(mainSource, /TRAY_ACTION_CHANNEL = 'tray-action'/);
  // handler may be on next line: ipcMain.handle(\n  TRAY_SET_STATE_CHANNEL,
  assert.match(mainSource, /ipcMain\.handle\(\s*\n?\s*TRAY_SET_STATE_CHANNEL/);
  assert.match(mainSource, /process\.platform === 'darwin'/);
  assert.match(mainSource, /menuBarTray = new MenuBarTray\(/);
});

test('preload exposes setTrayState and onTrayAction on the bridge', async () => {
  const preloadSource = await readFile(join(desktopRoot, 'src/preload.ts'), 'utf8');

  assert.match(preloadSource, /TRAY_SET_STATE_CHANNEL = 'tray-set-state'/);
  assert.match(preloadSource, /TRAY_ACTION_CHANNEL = 'tray-action'/);
  assert.match(preloadSource, /setTrayState:/);
  assert.match(preloadSource, /onTrayAction:/);
  assert.match(preloadSource, /ipcRenderer\.invoke\(TRAY_SET_STATE_CHANNEL/);
  assert.match(preloadSource, /ipcRenderer\.on\(TRAY_ACTION_CHANNEL/);
});

test('tray IPC channels match between main and preload', async () => {
  const [mainSource, preloadSource] = await Promise.all([
    readFile(join(desktopRoot, 'src/main.ts'), 'utf8'),
    readFile(join(desktopRoot, 'src/preload.ts'), 'utf8'),
  ]);

  const extractChannel = (src, name) => {
    const m = src.match(new RegExp(`${name}\\s*=\\s*'([^']+)'`));
    return m?.[1];
  };

  const mainSetState = extractChannel(mainSource, 'TRAY_SET_STATE_CHANNEL');
  const preloadSetState = extractChannel(preloadSource, 'TRAY_SET_STATE_CHANNEL');
  const mainAction = extractChannel(mainSource, 'TRAY_ACTION_CHANNEL');
  const preloadAction = extractChannel(preloadSource, 'TRAY_ACTION_CHANNEL');

  assert.equal(mainSetState, preloadSetState, 'TRAY_SET_STATE_CHANNEL must match');
  assert.equal(mainAction, preloadAction, 'TRAY_ACTION_CHANNEL must match');
  assert.equal(mainSetState, 'tray-set-state');
  assert.equal(mainAction, 'tray-action');
});
