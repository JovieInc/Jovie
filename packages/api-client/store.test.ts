import { mkdir, mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { credentialState } from './policy.ts';
import { defaultStateRoot, FileLedgerStore, hashCredential } from './store.ts';

const root = () => mkdtemp(join(tmpdir(), 'api-store-'));

describe('FileLedgerStore', () => {
  it('serializes concurrent read-modify-write transactions', async () => {
    const store = new FileLedgerStore(await root());
    await Promise.all(
      Array.from({ length: 25 }, () =>
        store.transact('github', ledger => {
          const state = credentialState(ledger, 'c', Date.now());
          state.lastWriteAt += 1;
        })
      )
    );
    expect((await store.read('github')).credentials.c?.lastWriteAt).toBe(25);
  });

  it('serializes across stores that share a dir (separate processes)', async () => {
    const dir = await root();
    const stores = Array.from(
      { length: 3 },
      () => new FileLedgerStore(dir, Date.now, { lockTimeoutMs: 60_000 })
    );
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        stores[i % 3].transact('github', ledger => {
          credentialState(ledger, 'c', Date.now()).lastWriteAt += 1;
        })
      )
    );
    expect((await stores[0].read('github')).credentials.c?.lastWriteAt).toBe(
      30
    );
  });

  it('on lock timeout returns the decision without clobbering the holder', async () => {
    const dir = await root();
    const store = new FileLedgerStore(dir, Date.now, { lockTimeoutMs: 50 });
    await store.transact('github', ledger => {
      credentialState(ledger, 'c', Date.now()).lastWriteAt = 7;
    });
    const lock = join(store.dir, 'github.lock.d');
    await mkdir(lock);
    await writeFile(join(lock, 'owner'), 'other-process');
    const seen = await store.transact('github', ledger => {
      const state = credentialState(ledger, 'c', Date.now());
      state.lastWriteAt = 999;
      return 'decided';
    });
    expect(seen).toBe('decided');
    expect((await store.read('github')).credentials.c?.lastWriteAt).toBe(7);
    expect(await readFile(join(lock, 'owner'), 'utf8')).toBe('other-process');
  });

  it('breaks a stale lock left by a crashed process', async () => {
    const dir = await root();
    const store = new FileLedgerStore(dir);
    const lock = join(store.dir, 'linear.lock.d');
    await mkdir(lock, { recursive: true });
    const old = new Date(Date.now() - 60_000);
    await utimes(lock, old, old);
    await store.transact('linear', ledger =>
      credentialState(ledger, 'k', Date.now())
    );
    expect(Object.keys((await store.read('linear')).credentials)).toEqual([
      'k',
    ]);
  });

  it('starts from an empty ledger when the file is torn or foreign', async () => {
    const store = new FileLedgerStore(await root());
    await mkdir(store.dir, { recursive: true });
    await writeFile(store.path('github'), '{"schema":');
    expect((await store.read('github')).credentials).toEqual({});
    await writeFile(
      store.path('github'),
      JSON.stringify({ schema: 'other', provider: 'github', credentials: {} })
    );
    expect((await store.read('github')).schema).toBe('jovie-api-ledger/v1');
    await store.transact('github', ledger =>
      credentialState(ledger, 'c', Date.now())
    );
    expect(
      JSON.parse(await readFile(store.path('github'), 'utf8')).credentials.c
    ).toBeDefined();
  });

  it('resolves the shared state root and hashes credentials without leaking them', () => {
    expect(defaultStateRoot({ JOVIE_API_STATE_DIR: '/x' })).toBe('/x');
    expect(defaultStateRoot({ LANES_STATE: '/lanes' })).toBe('/lanes');
    expect(defaultStateRoot({}, '/home/u')).toBe(
      '/home/u/.local/state/jovie-lanes'
    );
    const id = hashCredential(
      'https://api.linear.app/graphql',
      'lin_api_secret'
    );
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toContain('secret');
  });
});
