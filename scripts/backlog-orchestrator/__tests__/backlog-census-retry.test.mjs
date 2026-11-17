import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  COOLDOWN_MAX_WAIT_MS,
  censusFailureFields,
  censusFailureReceipt,
  censusRetryDelay,
  discoverCensusWithRetry,
  RETRY_TOTAL_WAIT_MS,
  TRANSIENT_RETRY_DELAYS_MS,
} from '../backlog-census-retry.mjs';
import { LinearTransportError } from '../linear-client.mjs';
import { assessBacklogSweep as sweepWithRealModule } from '../triage-event-assess.mjs';

const NOW_MS = Date.parse('2026-11-13T19:25:00.000Z');

/** @param {number} resetAt */
function cooldownError(resetAt) {
  // Mirrors the enforced-backoff throw in linear-client.mjs: the published
  // reset lives in metadata, so activeLinearCooldown can recover it.
  return new LinearTransportError('Linear credential budget is cooling down', {
    code: 'RATE_LIMITED',
    attempts: 0,
    metadata: { resetAt, retryable: false },
  });
}

/** @param {string} code */
function transportError(code) {
  return new LinearTransportError(
    `Linear GraphQL request failed (${code.toLowerCase()}, attempts=3)`,
    {
      code,
      attempts: 3,
      metadata: { retryable: false },
    }
  );
}

test('a transient census miss retries inside the sweep budget and then succeeds', async () => {
  /** @type {number[]} */
  const waits = [];
  /** @type {number[]} */
  const calls = [];
  const census = await sweepWithRealModule(/** @type {any} */ ({}), undefined, {
    now: () => NOW_MS,
    timeBudgetMs: 185_000,
    discover: async () => {
      calls.push(1);
      if (calls.length === 1) throw cooldownError(NOW_MS + 5_000);
      return [];
    },
    sleepImpl: async ms => waits.push(ms),
  });
  assert.equal(census.failed, 0);
  assert.equal(census.inventoryUnknown, undefined);
  assert.deepEqual(calls, [1, 1]);
  assert.ok(waits.every(wait => wait <= COOLDOWN_MAX_WAIT_MS));
});

test('an active cooldown whose reset fits the budget waits out the published reset', async () => {
  const waits = [];
  let calls = 0;
  const census = await sweepWithRealModule(/** @type {any} */ ({}), undefined, {
    now: () => NOW_MS,
    timeBudgetMs: 185_000,
    discover: async () => {
      calls += 1;
      if (calls <= 2) throw cooldownError(NOW_MS + 30_000);
      return [];
    },
    sleepImpl: async ms => waits.push(ms),
  });
  assert.equal(census.failed, 0);
  assert.deepEqual(waits, [31_000, 31_000]);
});

test('an active published cooldown defers the census like the Triage catch-up', async () => {
  let calls = 0;
  const receipt = await sweepWithRealModule(
    /** @type {any} */ ({}),
    undefined,
    {
      now: () => NOW_MS,
      timeBudgetMs: 185_000,
      discover: async () => {
        calls += 1;
        // Beyond the in-sweep cooldown cap: waiting it out belongs to the
        // next tick, so the receipt defers with the published reset, exactly
        // like the Triage catch-up defers on the same credential condition.
        throw cooldownError(NOW_MS + 10 * 60_000);
      },
      sleepImpl: async () => assert.fail('must not sleep on a deferred census'),
    }
  );
  assert.equal(receipt.failed, 0);
  assert.equal(receipt.inventoryUnknown, true);
  assert.equal(receipt.census.status, 'deferred');
  assert.equal(receipt.census.reason, 'RATE_LIMITED');
  assert.equal(receipt.census.resetAt, NOW_MS + 10 * 60_000);
  assert.equal(
    receipt.census.retryAt,
    new Date(NOW_MS + 10 * 60_000).toISOString()
  );
  const row = receipt.results[0];
  assert.equal(row.disposition, 'census-deferred');
  assert.equal(row.reason, 'backlog-catch-up-census-deferred');
  assert.equal(row.resetAt, receipt.census.resetAt);
  assert.equal(row.retryAt, receipt.census.retryAt);
  assert.ok(
    !JSON.stringify(receipt).includes('postgres') &&
      !JSON.stringify(receipt).includes('Authorization')
  );
  assert.equal(calls, 1);
});

test('a persistent non-cooldown miss still fails visibly with its cause', async () => {
  let calls = 0;
  const waits = [];
  const receipt = await sweepWithRealModule(
    /** @type {any} */ ({}),
    undefined,
    {
      now: () => NOW_MS,
      timeBudgetMs: 185_000,
      discover: async () => {
        calls += 1;
        throw transportError('SERVER');
      },
      sleepImpl: async ms => waits.push(ms),
    }
  );
  assert.equal(receipt.failed, 1);
  assert.equal(receipt.inventoryUnknown, true);
  const row = receipt.results[0];
  assert.equal(row.reason, 'backlog-catch-up-census-unavailable');
  assert.match(String(row.error), /server/);
  assert.equal(row.cooldown, undefined);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [2_000, 8_000]);
});

test('non-retryable census failures fail fast without sleeping', async () => {
  for (const code of ['AUTH', 'HTTP', 'SCHEMA', 'API']) {
    let calls = 0;
    const receipt = await sweepWithRealModule(
      /** @type {any} */ ({}),
      undefined,
      {
        now: () => NOW_MS,
        timeBudgetMs: 185_000,
        discover: async () => {
          calls += 1;
          throw transportError(code);
        },
        sleepImpl: async () => assert.fail(`must not retry ${code}`),
      }
    );
    assert.equal(receipt.failed, 1);
    assert.equal(calls, 1, code);
    assert.match(
      String(receipt.results[0].error),
      new RegExp(code.toLowerCase())
    );
  }
});

test('a plain non-transport error is surfaced, not retried', async () => {
  let calls = 0;
  const receipt = await sweepWithRealModule(
    /** @type {any} */ ({}),
    undefined,
    {
      now: () => NOW_MS,
      timeBudgetMs: 185_000,
      discover: async () => {
        calls += 1;
        throw new TypeError('backlog-cohort-page-unreadable');
      },
      sleepImpl: async () => assert.fail('must not sleep'),
    }
  );
  assert.equal(receipt.failed, 1);
  assert.equal(receipt.results[0].error, 'backlog-cohort-page-unreadable');
  assert.equal(calls, 1);
});

test('retries never exceed the sweep budget or the total retry wait', async () => {
  // A budget already consumed by earlier work leaves no room to wait.
  assert.equal(
    censusRetryDelay(cooldownError(NOW_MS + 5_000), {
      attempt: 0,
      nowMs: NOW_MS,
      remainingMs: 0,
    }),
    null
  );
  // A reset just past the in-sweep cooldown cap is left to the next tick.
  assert.equal(
    censusRetryDelay(cooldownError(NOW_MS + COOLDOWN_MAX_WAIT_MS + 5_000), {
      attempt: 0,
      nowMs: NOW_MS,
      remainingMs: RETRY_TOTAL_WAIT_MS,
    }),
    null
  );
  // The attempt cap bounds total added wall clock even under repeated
  // short resets.
  assert.equal(
    censusRetryDelay(cooldownError(NOW_MS + 1_000), {
      attempt: TRANSIENT_RETRY_DELAYS_MS.length,
      nowMs: NOW_MS,
      remainingMs: RETRY_TOTAL_WAIT_MS,
    }),
    null
  );
  // Expired cooldowns do not authorize a wait.
  assert.equal(
    censusRetryDelay(cooldownError(NOW_MS - 1_000), {
      attempt: 0,
      nowMs: NOW_MS,
      remainingMs: RETRY_TOTAL_WAIT_MS,
    }),
    null
  );
  // Transient transport waits only when the delay fits the remaining budget.
  assert.deepEqual(
    censusRetryDelay(transportError('TIMEOUT'), {
      attempt: 0,
      nowMs: NOW_MS,
      remainingMs: TRANSIENT_RETRY_DELAYS_MS[0],
    }),
    { waitMs: TRANSIENT_RETRY_DELAYS_MS[0] }
  );
  assert.equal(
    censusRetryDelay(transportError('NETWORK'), {
      attempt: 1,
      nowMs: NOW_MS,
      remainingMs: TRANSIENT_RETRY_DELAYS_MS[1] - 1,
    }),
    null
  );
});

test('census failure fields carry the message and cooldown reset, never a body', () => {
  const fields = censusFailureFields(
    Object.assign(
      new Error('Linear GraphQL request failed (rate_limited, attempts=5)'),
      { body: 'PRIVATE' }
    ),
    NOW_MS
  );
  assert.equal(
    fields.error,
    'Linear GraphQL request failed (rate_limited, attempts=5)'
  );
  assert.equal(fields.cooldown, undefined);
  assert.ok(!JSON.stringify(fields).includes('PRIVATE'));
  const cooldown = censusFailureFields(cooldownError(NOW_MS + 2_000), NOW_MS);
  assert.equal(cooldown.cooldown.resetAt, NOW_MS + 2_000);
  assert.equal(
    cooldown.cooldown.retryAt,
    new Date(NOW_MS + 2_000).toISOString()
  );
});

test('discoverCensusWithRetry passes options through and returns discovery rows', async () => {
  const options = Object.freeze({ probe: 1 });
  const rows = [{ id: 'a' }];
  const seen = [];
  const result = await discoverCensusWithRetry(
    async (client, opts) => {
      seen.push([client, opts]);
      return rows;
    },
    { probe: 'client' },
    options,
    {
      started: NOW_MS,
      timeBudgetMs: 185_000,
      now: () => NOW_MS,
      sleepImpl: async () => {},
    }
  );
  assert.equal(result, rows);
  assert.deepEqual(seen, [[{ probe: 'client' }, options]]);
});

test('censusFailureReceipt defers only on an active cooldown and names other causes', () => {
  const deferred = censusFailureReceipt(cooldownError(NOW_MS + 60_000), NOW_MS);
  assert.equal(deferred.failed, 0);
  assert.equal(deferred.census.status, 'deferred');
  assert.equal(deferred.results[0].disposition, 'census-deferred');
  const failed = censusFailureReceipt(transportError('AUTH'), NOW_MS);
  assert.equal(failed.failed, 1);
  assert.equal(failed.census, undefined);
  const failedRow = /** @type {any} */ (failed.results[0]);
  assert.equal(failedRow.disposition, 'assessment-failed');
  assert.match(String(failedRow.error), /auth/);
  // An expired cooldown is not an active one: it fails like any other miss.
  const expired = censusFailureReceipt(cooldownError(NOW_MS - 60_000), NOW_MS);
  assert.equal(expired.failed, 1);
  assert.equal(expired.census, undefined);
});
