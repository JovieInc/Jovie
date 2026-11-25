import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_STALE_AFTER_SECONDS,
  resolveStaleAfterSeconds,
} from './production-continuity.mjs';

describe('resolveStaleAfterSeconds (weekly measured limit from the lanes feed)', () => {
  const feed = ageS => async () => ({
    ok: true,
    json: async () => ({
      deployHealth: { limits: { 'JovieInc/Jovie': { ageS } } },
    }),
  });
  const base = {
    limitsUrl: 'https://feed.test/lanes.json',
    repository: 'JovieInc/Jovie',
  };

  it('uses the feed limit when sane and the fallback otherwise', async () => {
    assert.equal(
      await resolveStaleAfterSeconds({ ...base, fetchImpl: feed(9000) }),
      9000
    );
    for (const bad of [10, 999_999, null, 'x'])
      assert.equal(
        await resolveStaleAfterSeconds({ ...base, fetchImpl: feed(bad) }),
        DEFAULT_STALE_AFTER_SECONDS
      );
    assert.equal(
      await resolveStaleAfterSeconds({
        ...base,
        fetchImpl: async () => ({ ok: false }),
      }),
      DEFAULT_STALE_AFTER_SECONDS
    );
    assert.equal(
      await resolveStaleAfterSeconds({
        ...base,
        fetchImpl: async () => {
          throw new Error('down');
        },
      }),
      DEFAULT_STALE_AFTER_SECONDS
    );
    assert.equal(
      await resolveStaleAfterSeconds({ repository: 'JovieInc/Jovie' }),
      DEFAULT_STALE_AFTER_SECONDS
    );
  });
});
