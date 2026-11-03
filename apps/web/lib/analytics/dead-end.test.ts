import { beforeEach, describe, expect, it, vi } from 'vitest';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics', () => ({ track }));

import { resetDeadEndShownForTests, trackDeadEndShown } from './dead-end';

describe('trackDeadEndShown', () => {
  beforeEach(() => {
    track.mockClear();
    resetDeadEndShownForTests();
  });

  it('records a dead_end_shown event with surface and reason', () => {
    trackDeadEndShown('onboarding-turnstile', 'browser-unsupported');
    expect(track).toHaveBeenCalledWith(
      'dead_end_shown',
      expect.objectContaining({
        surface: 'onboarding-turnstile',
        reason: 'browser-unsupported',
      })
    );
  });

  it('records each surface and reason once per session', () => {
    trackDeadEndShown('a', 'b');
    trackDeadEndShown('a', 'b');
    trackDeadEndShown('a', 'c');
    expect(track).toHaveBeenCalledTimes(2);
  });
});
