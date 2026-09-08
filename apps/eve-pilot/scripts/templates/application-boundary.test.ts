import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertRuntimeEnvironment,
  summerStoreToken,
} from '../agent/lib/application-boundary';
import { APPLICATION_IDENTITY as identity } from '../agent/runtime-identity';
import {
  assertEvePilotFactoryLock,
  bindEvePilotIdentity,
  eveIdentityForChannel,
  eveIdentityForRuntime,
  eveIdentityIdForChannel,
  photonIdentityFromEnvironment,
} from '../agent/select-identity';

describe('fixed application domain', () => {
  beforeEach(() => {
    for (const name of Object.keys(process.env)) {
      if (
        /^(GBRAIN_|SUMMER_|OVIE_|EVE_IDENTITY|DATABASE_URL|NEON_|BLOB_READ_WRITE_TOKEN|EVE_CORE_CHAT_AUTH_TOKEN)/u.test(
          name
        )
      )
        vi.stubEnv(name, '');
    }
  });
  it('rejects opposite identity and credential injection', () => {
    const other = identity === 'summer' ? 'jovie' : 'summer';
    expect(() => bindEvePilotIdentity(other)).toThrow('cross-domain');
    expect(() => assertRuntimeEnvironment({ EVE_IDENTITY: other })).toThrow(
      'cross-domain'
    );
    const credential =
      identity === 'summer' ? 'DATABASE_URL' : 'SUMMER_BLOB_READ_WRITE_TOKEN';
    expect(() =>
      assertRuntimeEnvironment({ [credential]: 'forbidden' })
    ).toThrow('credential');
    expect(() => assertRuntimeEnvironment({ [credential]: '' })).not.toThrow();
    expect(() =>
      assertRuntimeEnvironment({ EVE_IDENTITY: identity })
    ).not.toThrow();
    expect(photonIdentityFromEnvironment({})).toBe(identity);
    expect(eveIdentityForRuntime().pack.id).toBe(identity);
    expect(eveIdentityForChannel().pack.id).toBe(identity);
    expect(eveIdentityIdForChannel('photon', {})).toBe(identity);
    expect(() =>
      eveIdentityIdForChannel(
        identity === 'summer' ? 'jovie-core-chat' : 'telegram',
        {}
      )
    ).toThrow();
    expect(
      eveIdentityIdForChannel(
        identity === 'summer' ? 'ovie-summer-shadow' : 'jovie-core-chat',
        {}
      )
    ).toBe(identity);
  });
  it('denies privileged tools and memory independent of instructions', () => {
    const turn = bindEvePilotIdentity(identity);
    expect(turn.instructions.length).toBeGreaterThan(50);
    for (const capability of [
      'privileged-gbrain-write',
      'symphony-heal',
      'gbrain-read',
      'ingest-ack',
    ] as const)
      expect(() => turn.require(capability)).toThrow();
    if (identity === 'summer')
      expect(() => turn.require('symphony-bounded-dispatch')).not.toThrow();
    else expect(() => turn.require('symphony-bounded-dispatch')).toThrow();
    expect(() => assertEvePilotFactoryLock(turn)).not.toThrow();
    expect(() =>
      assertEvePilotFactoryLock({
        ...turn,
        pack: { ...turn.pack, canHealSymphony: true },
      } as never)
    ).toThrow();
    expect(() =>
      assertEvePilotFactoryLock({
        ...turn,
        pack: { ...turn.pack, canPrivilegedWriteGbrain: true },
      } as never)
    ).toThrow();
  });
  it('requires Summer-specific storage and refuses ambient fallback', () => {
    expect(() => summerStoreToken({})).toThrow();
    if (identity === 'summer') {
      expect(() =>
        summerStoreToken({ BLOB_READ_WRITE_TOKEN: 'product-token' })
      ).toThrow('credential');
      expect(
        summerStoreToken({ SUMMER_BLOB_READ_WRITE_TOKEN: ' own-store ' })
      ).toBe('own-store');
    } else
      expect(() =>
        summerStoreToken({ BLOB_READ_WRITE_TOKEN: 'product-token' })
      ).toThrow('company storage denied');
  });
  it('discovers only domain-owned routes and tools in the real pinned Eve compiler', () => {
    mkdirSync('.eve/cache', { recursive: true });
    writeFileSync(
      '.eve/cache/model-catalog.json',
      JSON.stringify({
        kind: 'eve-model-catalog-cache',
        version: 2,
        fetchedAt: new Date().toISOString(),
        providerAliases: {},
        models: [
          {
            slug: 'zai/glm-5.3-flash',
            providers: [
              {
                provider: 'zai',
                providerModelId: 'glm-5.3-flash',
                contextWindowTokens: 1048576,
                maxOutputTokens: 1048576,
              },
            ],
          },
        ],
      })
    );
    const output = execFileSync(
      process.execPath,
      [resolve('node_modules/eve/bin/eve.js'), 'info', '--json'],
      {
        encoding: 'utf8',
        env: { PATH: process.env.PATH },
        timeout: 60000,
      }
    );
    const info = JSON.parse(output.slice(output.indexOf('{')));
    expect(info.status).toBe('ready');
    expect(info.diagnostics.errors).toBe(0);
    // Eve info reports static tools only. The product manifest is resolved at
    // session/turn start and its actual availability is tested in the tool suite.
    expect(info.tools).toEqual([]);
    const routes = info.channels.map(
      (route: { urlPath: string }) => route.urlPath
    );
    if (identity === 'summer')
      expect(
        routes.some((route: string) => route.startsWith('/eve/v1/session'))
      ).toBe(false);
    else {
      expect(routes.some((route: string) => route.includes('summer'))).toBe(
        false
      );
      expect(info.schedules).toEqual([]);
    }
    expect(readFileSync('agent/instructions.md', 'utf8')).toBe(
      readFileSync(`identities/${identity}/instructions.md`, 'utf8')
    );
  }, 65000);
});
