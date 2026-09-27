import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createUpstashProductionOperator,
  evaluateQuotaHeadroom,
  JOVIE_PRODUCTION_REDIS,
  QUOTA_ALERT_THRESHOLDS,
  verifyJovieProductionDatabase,
} from './upstash-production-operator.mjs';

const database = {
  database_id: JOVIE_PRODUCTION_REDIS.databaseId,
  database_name: JOVIE_PRODUCTION_REDIS.databaseName,
  endpoint: JOVIE_PRODUCTION_REDIS.endpoint,
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('status only calls the exact database and stats endpoints', async () => {
  const calls = [];
  const operator = createUpstashProductionOperator({
    email: 'operator@example.com',
    apiKey: 'secret',
    async fetchImpl(url, init) {
      calls.push({ url, method: init.method });
      return jsonResponse(
        String(url).includes('/stats/') ? { daily: [] } : database
      );
    },
  });

  const result = await operator.status();
  assert.deepEqual(result.identity, {
    databaseId: JOVIE_PRODUCTION_REDIS.databaseId,
    databaseName: JOVIE_PRODUCTION_REDIS.databaseName,
    endpoint: JOVIE_PRODUCTION_REDIS.endpoint,
  });
  assert.deepEqual(calls, [
    {
      method: 'GET',
      url: `https://api.upstash.com/v2/redis/database/${JOVIE_PRODUCTION_REDIS.databaseId}`,
    },
    {
      method: 'GET',
      url: `https://api.upstash.com/v2/redis/stats/${JOVIE_PRODUCTION_REDIS.databaseId}`,
    },
  ]);
});

test('identity mismatch fails before stats or mutation', async () => {
  assert.throws(
    () =>
      verifyJovieProductionDatabase({
        ...database,
        endpoint: 'other.upstash.io',
      }),
    /endpoint mismatch/
  );

  let calls = 0;
  const operator = createUpstashProductionOperator({
    email: 'operator@example.com',
    apiKey: 'secret',
    async fetchImpl() {
      calls += 1;
      return jsonResponse({ ...database, database_id: 'wrong' });
    },
  });
  await assert.rejects(operator.status(), /databaseId mismatch/);
  assert.equal(calls, 1);
});

test('reset-password requires exact confirmation and re-verifies identity', async () => {
  const calls = [];
  const operator = createUpstashProductionOperator({
    email: 'operator@example.com',
    apiKey: 'secret',
    async fetchImpl(url, init) {
      calls.push({ url, method: init.method });
      return jsonResponse(
        String(url).includes('/reset-password/')
          ? { password: 'new' }
          : database
      );
    },
  });

  await assert.rejects(
    operator.resetPassword('wrong'),
    /Exact Upstash database/
  );
  assert.equal(calls.length, 0);

  await operator.resetPassword(
    `${JOVIE_PRODUCTION_REDIS.databaseId}:${JOVIE_PRODUCTION_REDIS.endpoint}`
  );
  assert.deepEqual(
    calls.map(call => call.method),
    ['GET', 'POST']
  );
  assert.match(calls[1].url, /\/v2\/redis\/reset-password\/11d5c151-/);
});

test('no arbitrary management operation is exposed', () => {
  const operator = createUpstashProductionOperator({
    email: 'operator@example.com',
    apiKey: 'secret',
    fetchImpl: async () => jsonResponse({}),
  });
  assert.deepEqual(Object.keys(operator).sort(), [
    'quota',
    'resetPassword',
    'status',
  ]);
  assert.equal('changePlan' in operator, false);
  assert.equal('deleteDatabase' in operator, false);
});

test('evaluateQuotaHeadroom reports 70/85/95 thresholds in order', () => {
  const limit = JOVIE_PRODUCTION_REDIS.monthlyRequestLimit;
  assert.equal(limit, 500_000);
  assert.deepEqual(QUOTA_ALERT_THRESHOLDS, [70, 85, 95]);

  const ok = evaluateQuotaHeadroom(Math.floor(limit * 0.6999));
  assert.equal(ok.status, 'ok');
  assert.equal(ok.breachedThreshold, null);

  for (const [used, expected] of [
    [limit * 0.7, 70],
    [limit * 0.85, 85],
    [limit * 0.95, 95],
    [limit, 95],
  ]) {
    const result = evaluateQuotaHeadroom(used);
    assert.equal(result.status, 'alert');
    assert.equal(result.breachedThreshold, expected);
    assert.equal(result.monthlyRequests, used);
    assert.equal(result.limit, limit);
  }
});

test('evaluateQuotaHeadroom fails closed on malformed usage', () => {
  assert.throws(() => evaluateQuotaHeadroom(undefined), /Quota headroom/);
  assert.throws(() => evaluateQuotaHeadroom(-1), /Quota headroom/);
  assert.throws(() => evaluateQuotaHeadroom(1.5), /Quota headroom/);
  assert.throws(() => evaluateQuotaHeadroom(10, 0), /Quota headroom/);
});

test('quota verifies identity then evaluates monthly usage', async () => {
  const calls = [];
  const operator = createUpstashProductionOperator({
    email: 'operator@example.com',
    apiKey: 'secret',
    async fetchImpl(url, init) {
      calls.push({ url, method: init.method });
      return jsonResponse(
        String(url).includes('/stats/')
          ? { total_monthly_requests: 450_000 }
          : database
      );
    },
  });

  const result = await operator.quota();
  assert.equal(result.identity.databaseId, JOVIE_PRODUCTION_REDIS.databaseId);
  assert.deepEqual(result.headroom, {
    monthlyRequests: 450_000,
    limit: 500_000,
    percentUsed: 90,
    breachedThreshold: 85,
    status: 'alert',
  });
  assert.equal(calls.length, 2);
});

test('quota fails closed when stats omit monthly requests', async () => {
  const operator = createUpstashProductionOperator({
    email: 'operator@example.com',
    apiKey: 'secret',
    fetchImpl: async url =>
      jsonResponse(String(url).includes('/stats/') ? {} : database),
  });
  await assert.rejects(operator.quota(), /Quota headroom/);
});
