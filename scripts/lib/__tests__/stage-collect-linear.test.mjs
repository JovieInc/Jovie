import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as linearApi from '../../../packages/api-client/linear.ts';
import {
  canonicalLinearIdentifier,
  collectLinearIssues,
  collectStageRaw,
  linearAdmit,
  sliceLinearIdentifiers,
} from '../stage-collect.mjs';

const T0 = Date.parse('2026-11-10T00:00:00Z');
beforeEach(() => vi.stubEnv('JOVIE_API_STATE', 'memory'));
afterEach(() => vi.unstubAllEnvs());

/** Fake clock: `advance` moves it forward (used by injected sleeps). */
function fakeClock(start = T0) {
  let at = start;
  return {
    now: () => at,
    advance: ms => {
      at += ms;
    },
  };
}

const linearResponse = body => ({
  status: 200,
  text: JSON.stringify(body),
});

const linearNode = (number, { hasNextPage = false, history = [] } = {}) => ({
  identifier: `JOV-${number}`,
  createdAt: '2026-11-01T00:00:00Z',
  startedAt: '2026-11-02T00:00:00Z',
  history: {
    pageInfo: { hasNextPage },
    nodes: history,
  },
});

describe('canonicalLinearIdentifier', () => {
  it('canonicalizes tolerant spellings to JOV-<positive int>', () => {
    expect(canonicalLinearIdentifier('jov-123')).toBe('JOV-123');
    expect(canonicalLinearIdentifier(' JOV_123 ')).toBe('JOV-123');
    expect(canonicalLinearIdentifier('JOV 123')).toBe('JOV-123');
    expect(canonicalLinearIdentifier('JOV-0')).toBeNull();
    expect(canonicalLinearIdentifier('JOV-')).toBeNull();
    expect(canonicalLinearIdentifier('JOV-abc')).toBeNull();
    expect(canonicalLinearIdentifier('PROV-12')).toBeNull();
    expect(canonicalLinearIdentifier('')).toBeNull();
    expect(canonicalLinearIdentifier(null)).toBeNull();
  });
});

describe('sliceLinearIdentifiers', () => {
  it('dedupes, prefers issues from more recently merged PRs, and caps', () => {
    const entries = [
      { identifier: 'jov-2', mergedAt: '2026-11-09T00:00:00Z' },
      { identifier: 'JOV-1', mergedAt: '2026-11-08T00:00:00Z' },
      { identifier: 'jov-1', mergedAt: '2026-11-10T00:00:00Z' }, // newer wins
      { identifier: 'garbage' },
      { identifier: 'JOV-0' },
    ];
    const slice = sliceLinearIdentifiers(entries, { maxIds: 2 });
    expect(slice.identifiers).toEqual(['JOV-1', 'JOV-2']); // JOV-1 merged latest
    expect(slice.capped).toBe(0); // 2 unique <= cap of 2
  });

  it('is deterministic on ties and caps 500 IDs to 10 batches', () => {
    const entries = Array.from({ length: 700 }, (_, i) => ({
      identifier: `JOV-${i + 1}`,
      mergedAt: new Date(T0 - i * 1000).toISOString(),
    }));
    const slice = sliceLinearIdentifiers(entries);
    expect(slice.identifiers).toHaveLength(500);
    expect(slice.capped).toBe(200);
    expect(slice.identifiers[0]).toBe('JOV-1'); // most recently merged first
    expect(slice.identifiers.at(-1)).toBe('JOV-500');
  });

  it('keeps plain-string entries (no mergedAt) in order', () => {
    expect(
      sliceLinearIdentifiers(['jov-9', 'JOV-9', 'jov-8']).identifiers
    ).toEqual(['JOV-9', 'JOV-8']);
    expect(sliceLinearIdentifiers(['jov-9', 'JOV-9', 'jov-8']).capped).toBe(0);
  });
});

describe('linearAdmit (shed retry)', () => {
  const shed = retryAt => ({
    kind: 'shed',
    retryAt,
    message: 'linear shed: report shed (budget-reserve:requests)',
  });

  it('stops when the shed reset is beyond the remaining wait budget', async () => {
    const clock = fakeClock();
    const sleeps = [];
    let calls = 0;
    await expect(
      linearAdmit(
        () => {
          calls += 1;
          throw shed(T0 + 80_000); // beyond the 75s budget
        },
        {
          deadline: T0 + 75_000,
          now: clock.now,
          sleep: async () => sleeps.push(1),
        }
      )
    ).rejects.toMatchObject({ kind: 'shed' });
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]); // no sleep-then-retry-early
  });

  it('stops on missing, NaN, or past retryAt', async () => {
    for (const retryAt of [null, undefined, Number.NaN, T0 - 1]) {
      const clock = fakeClock();
      const sleeps = [];
      let calls = 0;
      await expect(
        linearAdmit(
          () => {
            calls += 1;
            throw shed(retryAt);
          },
          {
            deadline: T0 + 75_000,
            now: clock.now,
            sleep: async ms => sleeps.push(ms),
          }
        )
      ).rejects.toMatchObject({ kind: 'shed' });
      expect(calls).toBe(1);
      expect(sleeps).toEqual([]);
    }
  });

  it('retries at exactly retryAt within the budget and succeeds', async () => {
    const clock = fakeClock();
    let calls = 0;
    const result = await linearAdmit(
      () => {
        calls += 1;
        if (calls === 1) throw shed(T0 + 30_000);
        return 'ok';
      },
      {
        deadline: T0 + 75_000,
        now: clock.now,
        sleep: async ms => clock.advance(ms),
      }
    );
    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  it('caps admission calls at three and does not retry non-shed errors', async () => {
    const clock = fakeClock();
    let calls = 0;
    await expect(
      linearAdmit(
        () => {
          calls += 1;
          throw shed(T0 + calls * 10_000); // each reset lands in the future
        },
        {
          deadline: T0 + 75_000,
          now: clock.now,
          sleep: async ms => clock.advance(ms),
        }
      )
    ).rejects.toMatchObject({ kind: 'shed' });
    expect(calls).toBe(3);

    let early = 0;
    await expect(
      linearAdmit(
        () => {
          early += 1;
          throw new Error('boom'); // transport/client error: never retried here
        },
        { deadline: T0 + 75_000, now: clock.now, sleep: async () => {} }
      )
    ).rejects.toThrow('boom');
    expect(early).toBe(1);
  });
});

describe('collectLinearIssues', () => {
  const identifiersFor = numbers =>
    numbers.map(n => ({
      identifier: `JOV-${n}`,
      mergedAt: '2026-11-09T00:00:00Z',
    }));

  it('collects issues, counts missing nodes, and flags truncated histories', async () => {
    const batches = [];
    const request = async ({ numbers }) => {
      batches.push(numbers);
      if (numbers[0] === 1)
        return linearResponse({
          data: {
            issues: {
              nodes: [
                linearNode(1, {
                  history: [
                    {
                      createdAt: '2026-11-01T01:00:00Z',
                      fromState: { type: 'backlog' },
                      toState: { type: 'started' },
                    },
                  ],
                }),
                linearNode(2, { hasNextPage: true }),
              ],
            },
          },
        });
      return linearResponse({ data: { issues: { nodes: [] } } });
    };
    const result = await collectLinearIssues({
      apiKey: 'k',
      identifiers: identifiersFor([1, 2, 3]),
      request,
    });
    expect(batches).toEqual([[1, 2, 3]]); // 50 per batch max
    expect(result.counts).toMatchObject({
      requested: 3,
      fetched: 2,
      missing: 1, // JOV-3 not returned
      failed: 0,
      historyTruncated: 1,
      capped: 0,
    });
    const issue = result.issues['JOV-2'];
    expect(issue.historyTruncated).toBe(true);
    expect(issue.initialType).toBeNull(); // untrustworthy when history is paginated away
    expect(result.issues['JOV-1'].initialType).toBe('backlog');
  });

  it('keeps batch-1 results when batch 2 fails and reports partial', async () => {
    const request = async ({ numbers }) => {
      if (numbers[0] === 51)
        throw {
          kind: 'shed',
          retryAt: T0 + 90_000,
          message: 'shed past budget',
        };
      return linearResponse({
        data: { issues: { nodes: numbers.map(n => linearNode(n)) } },
      });
    };
    const identifiers = [
      ...identifiersFor(Array.from({ length: 50 }, (_, i) => i + 1)),
      ...identifiersFor([51]),
    ];
    const result = await collectLinearIssues({
      apiKey: 'k',
      identifiers,
      request,
    });
    expect(Object.keys(result.issues)).toHaveLength(50);
    expect(result.counts).toMatchObject({
      requested: 51,
      fetched: 50,
      failed: 1,
    });
    expect(result.error).toContain('shed');
  });

  it('enforces one global wait budget across batches', async () => {
    const clock = fakeClock();
    const sleeps = [];
    let batches = 0;
    const request = async () => {
      batches += 1;
      if (batches === 1) throw { kind: 'shed', retryAt: T0 + 60_000 }; // consumes most of the budget
      throw { kind: 'shed', retryAt: T0 + 90_000 }; // reset is past the remaining budget
    };
    const result = await collectLinearIssues({
      apiKey: 'k',
      identifiers: identifiersFor([1, 2]),
      request,
      now: clock.now,
      sleep: async ms => {
        sleeps.push(ms);
        clock.advance(ms);
      },
    });
    expect(result.issues).toEqual({});
    expect(result.counts.failed).toBe(1);
    // One bounded wait (60s) happened; the second batch's reset fell outside
    // the shared 75s budget, so no second wait was attempted.
    expect(sleeps).toEqual([60_000]);
  });

  it('canonicalizes duplicate identifiers across PRs and marks capped slices', async () => {
    const batches = [];
    const request = async ({ numbers }) => {
      batches.push(numbers);
      return linearResponse({
        data: { issues: { nodes: numbers.map(n => linearNode(n)) } },
      });
    };
    const identifiers = [
      ...identifiersFor([1, 2]),
      { identifier: 'jov-1', mergedAt: '2026-11-10T00:00:00Z' }, // duplicate
      ...identifiersFor(Array.from({ length: 550 }, (_, i) => i + 3)),
    ];
    const result = await collectLinearIssues({
      apiKey: 'k',
      identifiers,
      request,
    });
    // 550 unique + JOV-1 + JOV-2 = 552 unique, capped at 500.
    expect(result.counts.requested).toBe(500);
    expect(result.counts.capped).toBe(52);
    expect(batches).toHaveLength(10);
    expect(result.issues['JOV-1']).toBeDefined();
  });

  it('records unavailable instead of throwing when admission never succeeds', async () => {
    const result = await collectLinearIssues({
      apiKey: 'k',
      identifiers: identifiersFor([1]),
      request: async () => {
        throw {
          kind: 'shed',
          retryAt: null,
          message: 'linear shed: report shed (budget-reserve:requests)',
        };
      },
    });
    expect(result.issues).toEqual({});
    expect(result.counts).toMatchObject({ fetched: 0, failed: 1 });
    expect(result.error).toContain('shed');
  });
});

describe('Linear transport failures', () => {
  it('records a rate-limited Linear read without spending retry budget', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 429 }));
    await expect(
      collectLinearIssues({
        fetchImpl,
        apiKey: 'stage-collector-test',
        identifiers: ['JOV-1'],
      })
    ).resolves.toMatchObject({
      issues: {},
      counts: { requested: 1, fetched: 0, failed: 1, admittedBatches: 0 },
      error: expect.stringContaining('secondary'),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('stage collector retry clock', () => {
  it('uses elapsed time for admission even when the report window is fixed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const client = linearApi.createLinearClient({
      identity: 'clock-test',
      authorization: () => 'clock-test',
      legacyStateRoot: null,
    });
    let calls = 0;
    vi.spyOn(client.client, 'request').mockImplementation(async () => {
      calls += 1;
      if (calls < 3) throw { kind: 'shed', retryAt: T0 + calls * 30_000 };
      throw new Error('admissions finished');
    });
    vi.spyOn(linearApi, 'createLinearClient').mockReturnValue(client);
    let completed = false;
    try {
      const result = collectStageRaw({
        gh: args =>
          args[1] === 'graphql'
            ? JSON.stringify({
                data: { search: { nodes: [{ number: 1, title: 'JOV-1' }] } },
              })
            : '[]',
        env: { LINEAR_API_KEY: 'clock-test' },
        manifest: { sources: {} },
        now: T0 - 1,
        days: 1,
      }).then(value => {
        completed = true;
        return value;
      });
      await vi.advanceTimersByTimeAsync(75_000);
      expect(completed).toBe(true);
      expect(calls).toBe(3);
      expect((await result).sources['linear-history']).toMatchObject({
        ok: false,
        partial: true,
        counts: { failed: 1 },
      });
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });
});
