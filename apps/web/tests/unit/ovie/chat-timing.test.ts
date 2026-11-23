import { describe, expect, it } from 'vitest';
import {
  createOvieTurnTiming,
  ovieServerTiming,
  ovieTimingLogLine,
} from '@/lib/ovie/chat-timing';

function clock(...times: number[]) {
  let index = 0;
  return () => times[Math.min(index++, times.length - 1)] ?? 0;
}

describe('ovie turn timing', () => {
  it('measures each hop from the previous boundary', () => {
    // start, auth end, preflight end, fetch start, connect, first token
    const timing = createOvieTurnTiming(clock(0, 12, 40, 55, 130, 210));
    timing.endHop('auth');
    timing.endHop('preflight');
    timing.markSummerFetchStart();
    timing.markSummerConnect();
    timing.markFirstToken();
    expect(timing.snapshot()).toEqual({
      auth: 12,
      preflight: 28,
      session: 15,
      summer_connect: 75,
      summer_first_token: 155,
    });
  });

  it('formats a Server-Timing header from known hops only', () => {
    expect(ovieServerTiming({ auth: 12, preflight: 28.5 })).toBe(
      'auth;dur=12, preflight;dur=28.5'
    );
    expect(ovieServerTiming({})).toBe('');
  });

  it('logs fixed tokens and numbers only', () => {
    expect(ovieTimingLogLine({ auth: 1, summer_first_token: 9 })).toBe(
      'ovie_turn_timing auth_ms=1 preflight_ms=-1 session_ms=-1 summer_connect_ms=-1 summer_first_token_ms=9'
    );
  });
});
