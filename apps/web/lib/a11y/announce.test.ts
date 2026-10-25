import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  announceOncePerEvent,
  announcePolite,
  registerPoliteAnnouncer,
  resetAnnouncedEventIds,
} from './announce';

describe('polite announcement seam', () => {
  afterEach(() => {
    registerPoliteAnnouncer(null);
    resetAnnouncedEventIds();
  });

  it('delivers messages to the registered app-level announcer', () => {
    const announcer = vi.fn();
    registerPoliteAnnouncer(announcer);

    announcePolite('Payment complete. Artist Presence is active.');

    expect(announcer).toHaveBeenCalledTimes(1);
    expect(announcer).toHaveBeenCalledWith(
      'Payment complete. Artist Presence is active.'
    );
  });

  it('stays silent until an app-level announcer registers (LiveAnnouncer seam)', () => {
    registerPoliteAnnouncer(null);

    expect(() => announcePolite('anything')).not.toThrow();
  });

  it('announces exactly once per checkout event id', () => {
    const announcer = vi.fn();
    registerPoliteAnnouncer(announcer);

    const first = announceOncePerEvent(
      'cs_test_123',
      'Payment complete. Artist Presence is active.'
    );
    const second = announceOncePerEvent(
      'cs_test_123',
      'Payment complete. Artist Presence is active.'
    );

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(announcer).toHaveBeenCalledTimes(1);
  });

  it('keeps event ids independent', () => {
    const announcer = vi.fn();
    registerPoliteAnnouncer(announcer);

    announceOncePerEvent('cs_one', 'one');
    announceOncePerEvent('cs_two', 'two');

    expect(announcer).toHaveBeenCalledTimes(2);
  });
});
