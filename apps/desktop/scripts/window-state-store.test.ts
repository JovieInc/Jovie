import { expect, test, vi } from 'vitest';
import { createWindowStateStore } from '../src/window-state-store.ts';

const PRIMARY = { x: 0, y: 0, width: 1920, height: 1080 };

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

test('rapid resize keeps latest state when older writes finish later', async () => {
  const writes: string[] = [];
  const first = deferred<void>();
  const second = deferred<void>();
  let writeCount = 0;

  const store = createWindowStateStore({
    filePath: '/tmp/jovie-window-state.json',
    io: {
      readFile: async () => {
        throw new Error('missing');
      },
      writeFile: async (_path, data) => {
        writeCount += 1;
        writes.push(data);
        if (writeCount === 1) await first.promise;
        else await second.promise;
      },
    },
  });

  store.scheduleSave({ x: 10, y: 10, width: 900, height: 700 });
  store.scheduleSave({ x: 20, y: 20, width: 1000, height: 720 });
  store.scheduleSave({ x: 40, y: 50, width: 1100, height: 800 });

  first.resolve();
  await Promise.resolve();
  second.resolve();
  await vi.waitFor(() => {
    expect(store.needsFlush()).toBe(false);
  });

  expect(JSON.parse(writes[writes.length - 1] ?? '{}')).toEqual({
    x: 40,
    y: 50,
    width: 1100,
    height: 800,
  });
  expect(store.peek()).toEqual({
    x: 40,
    y: 50,
    width: 1100,
    height: 800,
  });
});

test('disk failure during save is nonfatal and leaves latest in memory', async () => {
  const store = createWindowStateStore({
    filePath: '/tmp/jovie-window-state.json',
    io: {
      readFile: async () => JSON.stringify({ width: 900, height: 700 }),
      writeFile: async () => {
        throw new Error('EACCES');
      },
    },
  });

  await expect(store.load({ displayBounds: PRIMARY })).resolves.toMatchObject({
    width: 900,
    height: 700,
  });
  store.scheduleSave({ x: 8, y: 8, width: 1000, height: 800 });
  await vi.waitFor(() => {
    expect(store.needsFlush()).toBe(false);
  });
  expect(store.peek()).toEqual({
    x: 8,
    y: 8,
    width: 1000,
    height: 800,
  });
});

test('bounded shutdown flush does not hang on a stalled write', async () => {
  const store = createWindowStateStore({
    filePath: '/tmp/jovie-window-state.json',
    io: {
      readFile: async () => {
        throw new Error('missing');
      },
      writeFile: () => new Promise(() => undefined),
    },
  });

  store.scheduleSave({ x: 1, y: 2, width: 900, height: 700 });
  const started = Date.now();
  await store.flushOnShutdown(40);
  expect(Date.now() - started).toBeLessThan(400);
  expect(store.peek()).toEqual({
    x: 1,
    y: 2,
    width: 900,
    height: 700,
  });
});

test('corrupt and missing files fall back to defaults', async () => {
  const missing = createWindowStateStore({
    filePath: '/tmp/missing-window-state.json',
    io: {
      readFile: async () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
      writeFile: async () => undefined,
    },
  });
  const corrupt = createWindowStateStore({
    filePath: '/tmp/corrupt-window-state.json',
    io: {
      readFile: async () => '{not-json',
      writeFile: async () => undefined,
    },
  });

  await expect(missing.load({ displayBounds: PRIMARY })).resolves.toEqual({
    width: 1280,
    height: 800,
  });
  await expect(corrupt.load({ displayBounds: PRIMARY })).resolves.toEqual({
    width: 1280,
    height: 800,
  });
});
