import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  trackServerEvent: vi.fn(),
  where: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: mocks.trackServerEvent,
}));

const { getLimitedDropReadModel, recordLimitedDropEvent } = await import(
  './limited-drop-funnel.server'
);

const EVENT_ID = '11111111-1111-4111-8111-111111111111';

function payload(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: 'limited-drop-funnel/v1',
    event_name: 'drop_purchase_completed',
    event_id: EVENT_ID,
    session_id: '22222222-2222-4222-8222-222222222222',
    artist_id: '33333333-3333-4333-8333-333333333333',
    asset_id: '44444444-4444-4444-8444-444444444444',
    drop_id: '55555555-5555-4555-8555-555555555555',
    page_id: 'drop_page',
    state: 'purchase',
    card_placement: 'drop_primary',
    share_id: 'share_launch',
    campaign_id: 'campaign_fall',
    experiment_id: 'experiment_completed_card',
    variant_id: 'variant_treatment',
    item_mode: 'active_drop',
    channel: null,
    terminal_reason: null,
    occurred_at: '2026-09-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('recordLimitedDropEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.where.mockResolvedValue([]);
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.trackServerEvent.mockResolvedValue({
      ok: true,
      eventId: 'ledger-event',
      deduplicated: false,
    });
  });

  it('records a validated canonical event with a retry-safe identity', async () => {
    await expect(recordLimitedDropEvent(payload())).resolves.toEqual({
      ok: true,
      eventId: 'ledger-event',
      deduplicated: false,
    });
    expect(mocks.trackServerEvent).toHaveBeenCalledWith(
      'drop_purchase_completed',
      expect.objectContaining({
        contract_version: 'limited-drop-funnel/v1',
        event_id: EVENT_ID,
        artist_id: '33333333-3333-4333-8333-333333333333',
      }),
      undefined,
      {
        eventIdentity: `limited-drop:${EVENT_ID}`,
        occurredAt: new Date('2026-09-10T12:00:00.000Z'),
      }
    );
    expect(mocks.trackServerEvent.mock.calls[0][1]).not.toHaveProperty(
      'occurred_at'
    );
  });

  it('rejects a payload carrying raw PII before it reaches the ledger', async () => {
    await expect(
      recordLimitedDropEvent(payload({ email: 'fan@example.com' }))
    ).resolves.toEqual({ ok: false, error: 'invalid_event' });
    expect(mocks.trackServerEvent).not.toHaveBeenCalled();
  });
});

describe('getLimitedDropReadModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.select.mockReturnValue({ from: mocks.from });
  });

  it('projects canonical ledger rows through the shared dashboard builder', async () => {
    const {
      event_name: _name,
      occurred_at: _occurred,
      ...properties
    } = payload();
    mocks.where.mockResolvedValue([
      {
        eventName: 'asset_page_viewed',
        properties: { ...properties, event_id: EVENT_ID },
        occurredAt: new Date('2026-09-10T12:00:00.000Z'),
        createdAt: new Date('2026-09-10T12:01:00.000Z'),
      },
      {
        eventName: 'drop_purchase_completed',
        properties: {
          ...properties,
          event_id: '66666666-6666-4666-8666-666666666666',
        },
        occurredAt: new Date('2026-09-10T12:02:00.000Z'),
        createdAt: new Date('2026-09-10T12:03:00.000Z'),
      },
    ]);

    const receipt = await getLimitedDropReadModel({
      artistId: '33333333-3333-4333-8333-333333333333',
      start: new Date('2026-09-01T00:00:00.000Z'),
      end: new Date('2026-09-15T00:00:00.000Z'),
      observedAt: new Date('2026-09-15T00:00:00.000Z'),
    });

    expect(receipt.source).toBe('server_analytics_events');
    expect(receipt.metrics.active_drop_purchase_rate).toMatchObject({
      numerator: 1,
      denominator: 1,
      rate_percent: 100,
    });
    expect(receipt.freshness.status).toBe('fresh');
  });
});
