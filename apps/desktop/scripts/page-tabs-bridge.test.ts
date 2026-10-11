import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { parsePageTabsBounds, parsePageTabsCommand } from '../src/page-tabs';

function fixture() {
  const source = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8');
  const ast = ts.createSourceFile(
    'main.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  );
  const names = [
    'function trustedPageTabRequest(',
    'ipcMain.on(PAGE_TABS_BOUNDS_CHANNEL,',
    "ipcMain.handle('desktop-page-tabs-appearance-get',",
    'ipcMain.handle(PAGE_TABS_GET_CHANNEL,',
    'ipcMain.handle(PAGE_TABS_COMMAND_CHANNEL,',
  ];
  const selected = names.map(
    name =>
      ast.statements.find(node =>
        node.getText(ast).replace(/\s/g, '').startsWith(name.replace(/\s/g, ''))
      )!
  );
  expect(selected.every(Boolean)).toBe(true);
  const frame = { detached: false, url: 'https://jov.ie/app/chat' };
  const page = { mainFrame: frame, getZoomFactor: () => 1 };
  const otherPage = { ...page };
  const chromeFrame = {
    detached: false,
    url: 'file:///bundle/page-tabs/index.html',
  };
  const chrome = {
    setBounds: vi.fn(),
    webContents: {
      mainFrame: chromeFrame,
      isDestroyed: () => false,
      send: vi.fn(),
      focus: vi.fn(),
      setZoomFactor: vi.fn(),
    },
  };
  const window = {
    isDestroyed: () => false,
    getContentSize: () => [1200, 800],
  };
  const state = {
    activeId: 1,
    tabs: [{ id: 1, title: 'Chat', loading: false }],
  };
  const tabs = { state: () => state, command: vi.fn(async () => true) };
  const handlers = new Map<string, (...args: any[]) => any>();
  let handoff = false;
  let exitPending = false;
  runInNewContext(
    ts.transpileModule(selected.map(node => node.getText(ast)).join('\n'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      PAGE_TABS_BOUNDS_CHANNEL: 'bounds',
      PAGE_TABS_GET_CHANNEL: 'get',
      PAGE_TABS_COMMAND_CHANNEL: 'command',
      PAGE_TABS_APPEARANCE_CHANNEL: 'appearance',
      PAGE_TABS_CHROME_URL: chromeFrame.url,
      APP_ORIGIN: 'https://jov.ie',
      mainWindow: window,
      get pageExitPending() {
        return exitPending;
      },
      windowPageTabs: new Map([[window, tabs]]),
      windowTabsChrome: new Map([[window, chrome]]),
      windowTabsAppearance: new Map(),
      ipcMain: {
        on: (name: string, handler: (...args: any[]) => any) =>
          handlers.set(name, handler),
        handle: (name: string, handler: (...args: any[]) => any) =>
          handlers.set(name, handler),
      },
      isMainPageContents: (sender: unknown) =>
        sender === page || sender === otherPage,
      isTrustedIpcSender: (event: { senderFrame: typeof frame }) =>
        new URL(event.senderFrame.url).origin === 'https://jov.ie',
      getIpcSenderUrl: (event: { senderFrame: typeof frame }) =>
        event.senderFrame.url,
      getWindowContents: () => page,
      isAuthHandoffOpen: () => handoff,
      parseUrl: (value: string) => new URL(value),
      parsePageTabsCommand,
      parsePageTabsBounds,
    }
  );
  return {
    handlers,
    frame,
    page,
    otherPage,
    chromeFrame,
    chrome,
    tabs,
    state,
    setExitPending: (pending: boolean) => {
      exitPending = pending;
    },
    setHandoff: () => {
      handoff = true;
    },
  };
}

describe('actual native page-tab IPC registrations', () => {
  it('admits only an owned live main frame or the owned exact local chrome', async () => {
    const f = fixture();
    const get = f.handlers.get('get')!;
    const command = f.handlers.get('command')!;
    const pageEvent = { sender: f.page, senderFrame: f.frame };
    const chromeEvent = {
      sender: f.chrome.webContents,
      senderFrame: f.chromeFrame,
    };
    expect(get(pageEvent)).toEqual(f.state);
    expect(get(chromeEvent)).toEqual(f.state);
    for (const event of [
      { sender: {}, senderFrame: f.frame },
      { ...pageEvent, senderFrame: null },
      { ...pageEvent, senderFrame: { ...f.frame } },
      { ...pageEvent, senderFrame: { ...f.frame, detached: true } },
      { ...chromeEvent, senderFrame: { ...f.chromeFrame } },
    ]) {
      expect(get(event)).toBeNull();
      expect(await command(event, { type: 'create' })).toBe(false);
    }
    expect(get(pageEvent, 'extra')).toBeNull();
    for (const request of [
      null,
      {},
      { type: 'select', id: -1 },
      { type: 'create', extra: true },
    ])
      expect(await command(pageEvent, request)).toBe(false);
    expect(await command(pageEvent, { type: 'create' }, 'extra')).toBe(false);
    f.frame.url = 'https://evil.example/app/chat';
    expect(get(pageEvent)).toBeNull();
    f.chromeFrame.url += '?forged';
    expect(get(chromeEvent)).toBeNull();
    expect(f.tabs.command).not.toHaveBeenCalled();
  });
  it('blocks commands mid-auth and restores tab keyboard focus only for successful chrome selection', async () => {
    const f = fixture();
    const command = f.handlers.get('command')!;
    const event = { sender: f.chrome.webContents, senderFrame: f.chromeFrame };
    expect(await command(event, { type: 'select', id: 1 })).toBe(true);
    expect(f.chrome.webContents.focus).toHaveBeenCalledOnce();
    f.chrome.webContents.focus.mockClear();
    await command(event, { type: 'create' });
    expect(f.chrome.webContents.focus).not.toHaveBeenCalled();
    f.tabs.command.mockResolvedValueOnce(false);
    await command(event, { type: 'close', id: 1 });
    expect(f.chrome.webContents.focus).not.toHaveBeenCalled();
    f.setHandoff();
    expect(await command(event, { type: 'create' })).toBe(false);
    expect(f.tabs.command).toHaveBeenCalledTimes(3);
  });
  it('accepts geometry and appearance only from the selected document', () => {
    const f = fixture();
    const bounds = f.handlers.get('bounds')!;
    const value = {
      x: 60,
      y: 8,
      width: 1132,
      height: 32,
      dark: true,
      ov: false,
    };
    const event = { sender: f.page, senderFrame: f.frame };
    for (const invalid of [
      { sender: f.otherPage, senderFrame: f.frame },
      { sender: f.chrome.webContents, senderFrame: f.chromeFrame },
      { ...event, senderFrame: null },
      { ...event, senderFrame: { ...f.frame } },
    ])
      bounds(invalid, value);
    bounds(event, { ...value, height: 500 });
    expect(f.chrome.setBounds).not.toHaveBeenCalled();
    bounds(event, value);
    expect(f.chrome.setBounds).toHaveBeenCalledExactlyOnceWith({
      x: 80,
      y: 8,
      width: 1112,
      height: 32,
    });
    expect(f.handlers.get('desktop-page-tabs-appearance-get')!(event)).toEqual({
      dark: true,
      ov: false,
    });
    expect(
      f.handlers.get('desktop-page-tabs-appearance-get')!(event, 'extra')
    ).toBeNull();
  });
});

it('keeps commands from changing pages while a window or quit confirmation is pending', async () => {
  const f = fixture();
  const command = f.handlers.get('command')!;
  const event = { sender: f.page, senderFrame: f.frame };
  f.setExitPending(true);
  expect(await command(event, { type: 'create' })).toBe(false);
  expect(f.tabs.command).not.toHaveBeenCalled();
  f.setExitPending(false);
  expect(await command(event, { type: 'create' })).toBe(true);
});
