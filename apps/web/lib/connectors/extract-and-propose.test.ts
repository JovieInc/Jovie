import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GOOGLE_OAUTH_SCOPE } from './registry';

const m = vi.hoisted(() => ({
  rows: [] as { id: string; providerAccountId: string; scopes: string[] }[],
  predicates: [] as unknown[],
  insert: vi.fn(),
  list: vi.fn(),
  message: vi.fn(),
  enrich: vi.fn(),
  token: vi.fn(),
  lock: vi.fn(),
  store: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (predicate: unknown) => {
          m.predicates.push(predicate);
          return { orderBy: async () => m.rows };
        },
      }),
    }),
    insert: () => ({
      values: (row: unknown) => ({
        onConflictDoNothing: () => m.insert(row),
      }),
    }),
  },
}));
vi.mock('@/lib/connectors/enrichment', () => ({
  runConnectorEnrichment: m.enrich,
}));
vi.mock('@/lib/connectors/gmail/client', () => ({
  buildGmailOpportunityQuery: () => 'booking',
  listGmailMessages: m.list,
  getGmailMessage: m.message,
  getHeader: () => 'metadata',
}));
vi.mock('@/lib/connectors/token-vault', () => ({
  loadDecryptedToken: m.token,
  withRefreshLock: m.lock,
  storeTokens: m.store,
}));
vi.mock('@/lib/http/server-fetch', () => ({ serverFetch: m.fetch }));
vi.mock('@/lib/env-server', () => ({
  env: {
    GOOGLE_OAUTH_CLIENT_ID: 'fixture-client',
    GOOGLE_OAUTH_CLIENT_SECRET: 'fixture-secret',
  },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

import { extractAndPropose } from './extract-and-propose';

const expired = {
  accessToken: 'expired',
  refreshToken: 'refresh',
  expiresAt: new Date(0),
};
beforeEach(() => {
  vi.resetAllMocks();
  m.predicates.length = 0;
  m.rows = [
    {
      id: 'gmail-1',
      providerAccountId: 'fixture@example.test',
      scopes: [GOOGLE_OAUTH_SCOPE.gmailReadonly],
    },
  ];
  m.token.mockResolvedValue({
    ...expired,
    accessToken: 'fresh',
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  m.lock.mockImplementation(async (_id: string, run: () => Promise<unknown>) =>
    run()
  );
  m.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ access_token: 'refreshed', expires_in: 3600 }),
  });
  m.list.mockResolvedValue({ messages: [] });
  m.enrich.mockResolvedValue({ totalSuggestionsCreated: 2 });
});

describe('Gmail read execution contract', () => {
  it('checks registry permission before opening the vault or reading provider data', async () => {
    m.rows[0].scopes = [GOOGLE_OAUTH_SCOPE.userinfoEmail];
    expect(await extractAndPropose('customer')).toBe(0);
    expect(m.token).not.toHaveBeenCalled();
    expect(m.list).not.toHaveBeenCalled();
    expect(m.enrich).not.toHaveBeenCalled();
  });

  it.each(['customer', 'company'])(
    'uses the same scoped path for %s',
    async userId => {
      expect(await extractAndPropose(userId)).toBe(2);
      const query = new PgDialect().sqlToQuery(m.predicates[0] as never);
      expect(query.params).toEqual([userId, 'gmail', 'connected']);
      expect(query.sql).toContain('"connector_accounts"."user_id"');
      expect(m.token).toHaveBeenCalledWith('gmail-1');
      expect(m.list).toHaveBeenCalledWith('fresh', 'booking', 50);
      expect(m.enrich).toHaveBeenCalledWith(userId, {
        gmailAccountId: 'gmail-1',
      });
      expect(m.fetch).not.toHaveBeenCalled();
    }
  );

  it('refreshes expired access once through the existing vault lock', async () => {
    m.token.mockResolvedValue(expired);
    await extractAndPropose('customer');
    expect(m.lock).toHaveBeenCalledWith('gmail-1', expect.any(Function));
    expect(m.fetch).toHaveBeenCalledTimes(1);
    expect(m.store).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorAccountId: 'gmail-1',
        accessToken: 'refreshed',
      })
    );
    expect(m.list).toHaveBeenCalledWith('refreshed', 'booking', 50);
  });

  it.each(['missing', 'revoked', 'unrefreshable'] as const)(
    'does not ingest with %s access',
    async state => {
      m.token.mockResolvedValue(
        state === 'missing'
          ? null
          : {
              ...expired,
              refreshToken: state === 'unrefreshable' ? null : 'refresh',
            }
      );
      m.fetch.mockResolvedValue({ ok: false, status: 400 });
      expect(await extractAndPropose('customer')).toBe(0);
      expect(m.list).not.toHaveBeenCalled();
      expect(m.enrich).not.toHaveBeenCalled();
      expect(m.store).not.toHaveBeenCalled();
    }
  );

  it('does not retry a busy refresh or swallow a provider failure', async () => {
    m.token.mockResolvedValue(expired);
    m.lock.mockRejectedValueOnce(new Error('refresh busy'));
    await expect(extractAndPropose('customer')).rejects.toThrow('refresh busy');
    expect(m.fetch).not.toHaveBeenCalled();
    expect(m.list).not.toHaveBeenCalled();
    m.list.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(extractAndPropose('customer')).rejects.toThrow(
      'provider unavailable'
    );
    expect(m.list).toHaveBeenCalledTimes(1);
    expect(m.enrich).not.toHaveBeenCalled();
  });

  it('reuses a concurrent refresh instead of spending another provider call', async () => {
    m.token.mockResolvedValueOnce(expired);
    await extractAndPropose('customer');
    expect(m.lock).toHaveBeenCalledTimes(1);
    expect(m.fetch).not.toHaveBeenCalled();
    expect(m.store).not.toHaveBeenCalled();
    expect(m.list).toHaveBeenCalledWith('fresh', 'booking', 50);
  });

  it('does no provider work when no owned connected account exists', async () => {
    m.rows = [];
    expect(await extractAndPropose('other-user')).toBe(0);
    expect(m.token).not.toHaveBeenCalled();
    expect(m.list).not.toHaveBeenCalled();
  });

  it('bounds metadata reads and keeps repeated imports on the conflict-safe account key', async () => {
    m.list.mockResolvedValue({
      messages: Array.from({ length: 50 }, (_, i) => ({ id: String(i) })),
    });
    m.message.mockImplementation(async (_token: string, id: string) => ({
      id,
      snippet: 'x'.repeat(250),
    }));
    const stored = new Set<string>();
    m.insert.mockImplementation(
      async (row: {
        connectorAccountId: string;
        providerId: string;
        payload: { snippet: string };
      }) => {
        stored.add(`${row.connectorAccountId}:${row.providerId}`);
        expect(row.connectorAccountId).toBe('gmail-1');
        expect(row.payload.snippet).toHaveLength(200);
        expect(row.payload).not.toHaveProperty('body');
      }
    );
    await extractAndPropose('customer');
    await extractAndPropose('customer');
    expect(m.list).toHaveBeenCalledTimes(2);
    expect(m.message).toHaveBeenCalledTimes(40);
    expect(stored.size).toBe(20);
    expect(m.fetch).not.toHaveBeenCalled();
  });
});
