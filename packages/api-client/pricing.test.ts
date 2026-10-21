import { describe, expect, it } from 'vitest';

import { BudgetExhaustedError, createApiClient } from './client.ts';
import {
  BlockedProviderError,
  callableSpec,
  providerForUrl,
} from './contract.ts';
import {
  CredentialUnavailableError,
  resolveCredential,
} from './credentials.ts';
import { FakeClock } from './fake-provider.ts';
import { credentialState, emptyLedger, pruneLedger, utcDay } from './policy.ts';
import { MemoryLedgerStore } from './store.ts';

const EXA = 'https://api.exa.ai/search';

function priced(statuses: number[], cap: number | null = 1) {
  const clock = new FakeClock();
  const calls: string[] = [];
  const events: Record<string, unknown>[] = [];
  const store = new MemoryLedgerStore();
  const fetch = (async (url: URL | string) => {
    calls.push(String(url));
    const status = statuses.shift() ?? 200;
    return new Response(status === 200 ? '{"ok":true}' : '{}', {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  const client = createApiClient({
    provider: 'exa',
    credential: 'cred-a',
    store,
    fetch,
    now: clock.read,
    sleep: clock.sleep,
    random: () => 0.5,
    log: e => events.push(e),
    dailySpendCapUsd: cap ?? undefined,
  });
  return { clock, calls, events, store, client };
}

const spent = async (store: MemoryLedgerStore) =>
  (await store.read('exa')).credentials['cred-a']?.spend?.usd ?? 0;

describe('blocked providers', () => {
  it('registers composio so the guard sees it, but the client refuses it', () => {
    expect(providerForUrl('https://backend.composio.dev/api/v3/tools')).toBe(
      'composio'
    );
    expect(() => callableSpec('composio')).toThrow(BlockedProviderError);
    expect(() =>
      createApiClient({ provider: 'composio', credential: 'x' })
    ).toThrow(/composio is blocked: Composio Instant bills per call/);
  });
});

describe('per-call price and the daily spend cap', () => {
  it('reserves each priced call and fails closed at the cap without a network call', async () => {
    const { client, calls, store, events } = priced([], 0.25);
    await client.request({ url: EXA, method: 'POST', priceUsd: 0.1 });
    await client.request({ url: EXA, method: 'POST', priceUsd: 0.1 });
    expect(await spent(store)).toBeCloseTo(0.2);
    const denied = client.request({ url: EXA, method: 'POST', priceUsd: 0.1 });
    await expect(denied).rejects.toBeInstanceOf(BudgetExhaustedError);
    await expect(denied).rejects.toMatchObject({
      kind: 'budget_exhausted',
      status: 402,
      capUsd: 0.25,
      exitCode: 75,
    });
    expect(calls).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({
      schema: 'jovie.api-client.spend/v1',
      outcome: 'budget_exhausted',
    });
  });

  it('refuses a priced call when no cap is configured', async () => {
    const { client, calls } = priced([], null);
    await expect(
      client.request({ url: EXA, method: 'POST', priceUsd: 0.01 })
    ).rejects.toThrow(/no daily spend cap configured/);
    expect(calls).toHaveLength(0);
  });

  it('refunds failed calls and stops on a provider 402 without retrying', async () => {
    const { client, calls, store } = priced([400, 402]);
    const bad = await client.request({
      url: EXA,
      method: 'POST',
      priceUsd: 0.5,
    });
    expect(bad.status).toBe(400);
    expect(await spent(store)).toBe(0);
    await expect(
      client.request({ url: EXA, method: 'POST', priceUsd: 0.5 })
    ).rejects.toMatchObject({ kind: 'budget_exhausted', status: 402 });
    expect(calls).toHaveLength(2);
    expect(await spent(store)).toBe(0);
  });

  it('keeps an idle credential that spent today so the cap does not reset', () => {
    const ledger = emptyLedger('exa');
    const now = Date.UTC(2026, 9, 21, 12);
    credentialState(ledger, 'spender', now).spend = {
      day: utcDay(now),
      usd: 0.3,
    };
    credentialState(ledger, 'idle', now);
    pruneLedger(ledger, now + 3 * 3_600_000);
    expect(Object.keys(ledger.credentials)).toEqual(['spender']);
    pruneLedger(ledger, now + 13 * 3_600_000); // next UTC day
    expect(Object.keys(ledger.credentials)).toEqual([]);
  });
});

describe('credential order', () => {
  it('prefers own, logs every fallback, and never uses pooled unless allowed', async () => {
    const events: Record<string, unknown>[] = [];
    const log = (e: Record<string, unknown>) => events.push(e);
    expect(
      await resolveCredential(
        'exa',
        { own: () => 'mine', shared: () => 'team' },
        { log }
      )
    ).toEqual({ tier: 'own', value: 'mine' });
    expect(events).toEqual([]);
    expect(
      await resolveCredential(
        'exa',
        { own: () => null, shared: async () => 'team' },
        { log }
      )
    ).toEqual({ tier: 'shared', value: 'team' });
    expect(events.at(-1)).toMatchObject({
      tier: 'shared',
      skipped: ['own'],
      outcome: 'fallback',
    });
    await expect(
      resolveCredential('exa', { own: () => '', pooled: () => 'pool' }, { log })
    ).rejects.toBeInstanceOf(CredentialUnavailableError);
    expect(events.at(-1)).toMatchObject({
      tried: ['own'],
      outcome: 'unavailable',
    });
    expect(
      await resolveCredential(
        'exa',
        { own: () => undefined, pooled: () => 'pool' },
        { log, allowPooled: true }
      )
    ).toEqual({ tier: 'pooled', value: 'pool' });
  });
});
