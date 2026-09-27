import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockHandlePrintfulOrderEvent = vi.hoisted(() => vi.fn());
const mockVerifySignature = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
  eq: vi.fn((...conditions: unknown[]) => ({ type: 'eq', conditions })),
  isNull: vi.fn((column: unknown) => ({ type: 'isNull', column })),
  lt: vi.fn((...conditions: unknown[]) => ({ type: 'lt', conditions })),
  or: vi.fn((...conditions: unknown[]) => ({ type: 'or', conditions })),
}));

vi.mock('@/lib/env-server', () => ({
  env: { PRINTFUL_WEBHOOK_SECRET: 'pf_secret' },
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockDbInsert,
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema/suppression', () => ({
  webhookEvents: {
    id: 'id',
    provider: 'provider',
    eventType: 'event_type',
    eventId: 'event_id',
    payload: 'payload',
    processed: 'processed',
    processedAt: 'processed_at',
    error: 'error',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

vi.mock('@/lib/merch/orders', () => ({
  handlePrintfulOrderEvent: mockHandlePrintfulOrderEvent,
}));

vi.mock('@/lib/printful/client', () => ({
  verifyPrintfulWebhookSignature: mockVerifySignature,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: mockLogger,
}));

function makePayload() {
  return {
    type: 'order_updated',
    occurred_at: '2026-09-27T00:00:00Z',
    store_id: 1,
    data: { order: { id: 42 } },
  };
}

function makeRequest(body = JSON.stringify(makePayload())) {
  return new Request('https://example.com/api/webhooks/printful', {
    method: 'POST',
    headers: { 'x-pf-webhook-signature': 'sig' },
    body,
  }) as never;
}

/**
 * Queue-based db mock. `insert` returns the configured conflict result;
 * `select` returns the configured existing row; each `update` pops a
 * result off `updateResults` (used for the claim lease).
 */
interface DbScript {
  insertResult: Array<{ id: string }>;
  selectResult: Array<{ id: string; processed: boolean }>;
  updateResults: Array<Array<{ id: string }>>;
}

let script: DbScript;

function setupDb(overrides: Partial<DbScript> = {}) {
  script = {
    insertResult: [{ id: 'evt_1' }],
    selectResult: [],
    updateResults: [[{ id: 'evt_1' }]],
    ...overrides,
  };

  mockDbInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(script.insertResult),
      }),
    }),
  });

  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(script.selectResult),
      }),
    }),
  });

  mockDbUpdate.mockImplementation(() => {
    const rows = script.updateResults.shift() ?? [];
    const chain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(rows),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve),
    };
    return chain;
  });
}

async function callPost() {
  const { POST } = await import('@/app/api/webhooks/printful/route');
  return POST(makeRequest());
}

describe('POST /api/webhooks/printful', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockVerifySignature.mockReturnValue(true);
    mockHandlePrintfulOrderEvent.mockResolvedValue(undefined);
    setupDb();
  });

  it('rejects an invalid signature', async () => {
    mockVerifySignature.mockReturnValue(false);
    const res = await callPost();
    expect(res.status).toBe(400);
    expect(mockHandlePrintfulOrderEvent).not.toHaveBeenCalled();
  });

  it('processes a new event and marks it processed', async () => {
    const res = await callPost();
    expect(res.status).toBe(200);
    expect(mockHandlePrintfulOrderEvent).toHaveBeenCalledTimes(1);
    // claim update + processed update
    expect(mockDbUpdate).toHaveBeenCalledTimes(2);
  });

  it('ignores a duplicate delivery of an already-processed event', async () => {
    setupDb({
      insertResult: [],
      selectResult: [{ id: 'evt_1', processed: true }],
    });
    const res = await callPost();
    expect(res.status).toBe(200);
    expect(mockHandlePrintfulOrderEvent).not.toHaveBeenCalled();
  });

  it('replays a recorded-but-unprocessed event instead of dead-lettering it', async () => {
    setupDb({
      insertResult: [],
      selectResult: [{ id: 'evt_1', processed: false }],
      updateResults: [[{ id: 'evt_1' }]],
    });
    const res = await callPost();
    expect(res.status).toBe(200);
    expect(mockHandlePrintfulOrderEvent).toHaveBeenCalledTimes(1);
  });

  it('returns a retryable 503 when another delivery holds a fresh lease', async () => {
    setupDb({
      insertResult: [],
      selectResult: [{ id: 'evt_1', processed: false }],
      updateResults: [[]],
    });
    const res = await callPost();
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('5');
    expect(mockHandlePrintfulOrderEvent).not.toHaveBeenCalled();
  });

  it('releases the lease and returns 500 when the handler throws', async () => {
    mockHandlePrintfulOrderEvent.mockRejectedValue(new Error('db down'));
    const res = await callPost();
    expect(res.status).toBe(500);
    // claim update + release update
    expect(mockDbUpdate).toHaveBeenCalledTimes(2);
    expect(mockCaptureCriticalError).toHaveBeenCalled();
  });
});
