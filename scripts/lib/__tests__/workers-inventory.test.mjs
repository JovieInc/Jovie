import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryLedgerStore } from '../../../packages/api-client/store.ts';
import {
  compareWorkers,
  fetchDeployedWorkers,
  loadDeployedCanon,
  repoWorkerNames,
} from '../workers-inventory.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const canon = loadDeployedCanon(root);
const repoNames = repoWorkerNames(root);

describe('workers inventory', () => {
  it('committed canon is consistent with the repo (offline)', () => {
    expect(compareWorkers({ deployed: null, repoNames, canon })).toEqual([]);
    expect(repoNames.has('jovie-prod-liveness')).toBe(true);
    expect(repoNames.has('summer-store')).toBe(true);
  });

  it('negative control: a deployed Worker with no source and no debt entry fails', () => {
    const errors = compareWorkers({
      deployed: ['jovie-prod-liveness', 'rogue-worker'],
      repoNames,
      canon: { unversioned: [] },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/rogue-worker: deployed Worker has no source/);
  });

  it('ratchet: debt that gained source or was deleted must leave the list', () => {
    const errors = compareWorkers({
      deployed: ['jovie-prod-liveness'],
      repoNames,
      canon: {
        unversioned: [
          { name: 'jovie-prod-liveness', disposition: 'import the source now' },
          { name: 'gone', disposition: 'deleted already, drop me' },
        ],
      },
    });
    expect(errors.join('\n')).toMatch(/has source in git now/);
    expect(errors.join('\n')).toMatch(
      /gone: listed as unversioned but not deployed/
    );
  });

  it('an unreadable Cloudflare listing throws instead of reading green', async () => {
    await expect(
      fetchDeployedWorkers({
        accountId: 'a',
        token: 't',
        store: new MemoryLedgerStore(),
        fetchImpl: async () =>
          new Response(JSON.stringify({ success: false }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          }),
      })
    ).rejects.toThrow(/workers-list-unreadable:403/);
  });

  it('reads Worker ids from a successful account listing', async () => {
    const names = await fetchDeployedWorkers({
      accountId: 'a',
      token: 't',
      store: new MemoryLedgerStore(),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ success: true, result: [{ id: 'summer-store' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ),
    });
    expect(names).toEqual(['summer-store']);
  });
});
