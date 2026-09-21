import { beforeEach, describe, expect, it, vi } from 'vitest';

const trackServerEvent = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ ok: true, eventId: 'event-1' })
);

vi.mock('@/lib/server-analytics', () => ({ trackServerEvent }));

import { trackSubscribeAttempt, trackUnsubscribeAttempt } from './analytics';

describe('notification server analytics privacy boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records only normalized shape data before subscribe validation', async () => {
    await trackSubscribeAttempt({
      artist_id: 'attacker@example.com',
      channel: '1555121212',
      email: 'fan@example.com',
      phone: '+1 555 1212',
      source: 'attacker@example.com',
    });

    expect(trackServerEvent).toHaveBeenCalledWith(
      'notifications_subscribe_attempt',
      {
        channel: 'sms',
        email_length: 15,
        phone_length: 11,
      }
    );
  });

  it('omits raw identifiers and methods before unsubscribe validation', async () => {
    await trackUnsubscribeAttempt({
      artist_id: '11111111-1111-4111-8111-111111111111',
      channel: 'email',
      method: '1555121212',
    });

    expect(trackServerEvent).toHaveBeenCalledWith(
      'notifications_unsubscribe_attempt',
      { channel: 'email' }
    );
  });
});
