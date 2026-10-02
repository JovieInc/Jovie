import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GET_VISUAL_ACTIVITY_CHANNEL,
  trustedVisualActivityRequest,
} from '../src/visual-activity';

interface VisualAPI {
  getVisualActivity(): Promise<boolean>;
  onVisualActivity(callback: (active: boolean) => void): () => void;
}
const { exposed, listeners, ipc } = vi.hoisted(() => ({
  exposed: new Map<string, VisualAPI>(),
  listeners: new Map<string, (event: unknown, active: unknown) => void>(),
  ipc: { send: vi.fn(), invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}));
vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: VisualAPI) => exposed.set(name, api),
  },
  ipcRenderer: ipc,
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  exposed.clear();
  listeners.clear();
  ipc.on.mockImplementation((channel, listener) =>
    listeners.set(channel, listener)
  );
});

describe('visual activity bridge', () => {
  it('reads without payload and subscribes to booleans through the actual preload', async () => {
    await import('../src/preload');
    const api = exposed.get('electronAPI')!;
    ipc.invoke.mockResolvedValue(false);
    expect(await api.getVisualActivity()).toBe(false);
    expect(ipc.invoke).toHaveBeenCalledExactlyOnceWith(
      'desktop-get-visual-activity'
    );
    const callback = vi.fn();
    const dispose = api.onVisualActivity(callback);
    const listener = listeners.get('desktop-visual-activity')!;
    listener({}, false);
    listener({}, { active: true });
    listener({}, true);
    expect(callback.mock.calls).toEqual([[false], [true]]);
    dispose();
    expect(ipc.removeListener).toHaveBeenCalledWith(
      'desktop-visual-activity',
      listener
    );
  });

  it('executes the actual main handler against current, stale, child, and foreign frames', () => {
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
        .startsWith('ipcMain.handle(GET_VISUAL_ACTIVITY_CHANNEL,')
    );
    expect(registration).toBeDefined();
    const frame = {
      parent: null,
      detached: false,
      url: 'https://jov.ie/app/chat',
    };
    const contents = { id: 1, mainFrame: frame };
    const read = vi.fn(() => false);
    let handler: (event: object, ...args: unknown[]) => unknown = () =>
      undefined;
    const window = { isDestroyed: () => false, webContents: contents };
    runInNewContext(
      ts.transpileModule(registration!.getText(ast), {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
        },
      }).outputText,
      {
        GET_VISUAL_ACTIVITY_CHANNEL,
        APP_ORIGIN: 'https://jov.ie',
        trustedVisualActivityRequest,
        ipcMain: {
          handle: (_channel: string, callback: typeof handler) => {
            handler = callback;
          },
        },
        mainWindow: window,
        visualActivityReaders: new Map([[1, read]]),
      }
    );
    expect(handler({ sender: contents, senderFrame: frame })).toBe(false);
    read.mockClear();
    for (const event of [
      { sender: {}, senderFrame: frame },
      { sender: contents, senderFrame: null },
      { sender: contents, senderFrame: { ...frame } },
      { sender: contents, senderFrame: { ...frame, parent: {} } },
      { sender: contents, senderFrame: { ...frame, detached: true } },
    ])
      expect(handler(event)).toBeNull();
    expect(handler({ sender: contents, senderFrame: frame }, false)).toBeNull();
    frame.url = 'https://foreign.test/app/chat';
    expect(handler({ sender: contents, senderFrame: frame })).toBeNull();
    frame.url = 'https://jov.ie/app/chat';
    window.isDestroyed = () => true;
    expect(handler({ sender: contents, senderFrame: frame })).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
});
