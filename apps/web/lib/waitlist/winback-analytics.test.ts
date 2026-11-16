import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ trackServerEvent: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: mocks.trackServerEvent,
}));

const { trackWinbackEvent, WINBACK_ANALYTICS_EVENTS } = await import(
  './winback-analytics'
);

describe('trackWinbackEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trackServerEvent.mockResolvedValue({ ok: true, eventId: 'event-1' });
  });

  it.each(WINBACK_ANALYTICS_EVENTS)(
    'forwards %s to the server ledger',
    async event => {
      const properties = {
        entry_id: '11111111-1111-4111-8111-111111111111',
        capability_key: 'release_pages',
        batch_id: 'batch-1',
        template_version: 'winback-v1',
        winback_cohort: 'waitlisted',
      };

      await trackWinbackEvent(event, properties);

      expect(mocks.trackServerEvent).toHaveBeenCalledExactlyOnceWith(
        event,
        properties
      );
    }
  );

  it('rejects an event outside the winback contract', async () => {
    await trackWinbackEvent('release_deleted' as never, {});

    expect(mocks.trackServerEvent).not.toHaveBeenCalled();
  });

  it('waits for the ledger delivery', async () => {
    const failure = new Error('ledger unavailable');
    mocks.trackServerEvent.mockRejectedValue(failure);

    await expect(trackWinbackEvent('winback_sent', {})).rejects.toBe(failure);
  });
});
