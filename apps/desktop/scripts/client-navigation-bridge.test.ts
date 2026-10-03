import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exposed, listeners, ipc } = vi.hoisted(() => ({
  exposed: new Map<
    string,
    { onNavigate: (callback: (path: string) => void) => () => void }
  >(),
  listeners: new Map<string, (event: unknown, payload: unknown) => void>(),
  ipc: { send: vi.fn(), invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: never) => exposed.set(name, api),
  },
  ipcRenderer: ipc,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  exposed.clear();
  listeners.clear();
  ipc.on.mockImplementation((channel, listener) => {
    listeners.set(channel, listener);
  });
});

describe('native client navigation bridge', () => {
  it('announces readiness only while the real preload listener is installed', async () => {
    await import('../src/preload');
    const callback = vi.fn();
    const unsubscribe = exposed.get('electronAPI')!.onNavigate(callback);
    expect(listeners.has('desktop-client-navigation')).toBe(true);
    expect(ipc.send).toHaveBeenCalledExactlyOnceWith(
      'desktop-client-navigation-ready',
      true
    );
    const listener = listeners.get('desktop-client-navigation')!;
    listener({}, '/app/settings');
    listener({}, { path: '/app/settings' });
    expect(callback).toHaveBeenCalledExactlyOnceWith('/app/settings');
    unsubscribe();
    expect(ipc.removeListener).toHaveBeenCalledWith(
      'desktop-client-navigation',
      listener
    );
    expect(ipc.send).toHaveBeenLastCalledWith(
      'desktop-client-navigation-ready',
      false
    );
  });

  it('allows readiness only from the live trusted main frame', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8');
    const ast = ts.createSourceFile(
      'main.ts',
      source,
      ts.ScriptTarget.Latest,
      true
    );
    const registration = ast.statements.find(node =>
      node
        .getText(ast)
        .startsWith('ipcMain.on(CLIENT_NAVIGATION_READY_CHANNEL,')
    );
    expect(registration).toBeDefined();
    const frame = {
      parent: null,
      detached: false,
      url: 'https://jov.ie/app/chat',
    };
    const contents = { id: 1, mainFrame: frame };
    const ready = vi.fn();
    let handler: (event: object, value: unknown) => void = () => undefined;
    runInNewContext(
      ts.transpileModule(registration!.getText(ast), {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
        },
      }).outputText,
      {
        CLIENT_NAVIGATION_READY_CHANNEL: 'desktop-client-navigation-ready',
        APP_ORIGIN: 'https://jov.ie',
        ipcMain: {
          on: (_channel: string, callback: typeof handler) => {
            handler = callback;
          },
        },
        mainWindow: { isDestroyed: () => false, webContents: contents },
        desktopNavigation: { setReady: ready },
        getIpcSenderUrl: (event: { senderFrame: typeof frame }) =>
          event.senderFrame.url,
        parseUrl: (value: string) => new URL(value),
      }
    );
    handler({ sender: contents, senderFrame: frame }, true);
    handler({ sender: contents, senderFrame: frame }, false);
    expect(ready.mock.calls).toEqual([
      [1, true],
      [1, false],
    ]);
    ready.mockClear();
    for (const event of [
      { sender: {}, senderFrame: frame },
      { sender: contents, senderFrame: null },
      { sender: contents, senderFrame: { ...frame } },
      { sender: contents, senderFrame: { ...frame, parent: {} } },
      { sender: contents, senderFrame: { ...frame, detached: true } },
    ])
      handler(event, true);
    handler({ sender: contents, senderFrame: frame }, 'true');
    frame.url = 'https://evil.example/app/chat';
    handler({ sender: contents, senderFrame: frame }, true);
    expect(ready).not.toHaveBeenCalled();
  });
});
