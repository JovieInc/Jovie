import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createUpstashProductionOperator,
  JOVIE_PRODUCTION_REDIS,
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
  assert.deepEqual(Object.keys(operator).sort(), ['resetPassword', 'status']);
  assert.equal('changePlan' in operator, false);
  assert.equal('deleteDatabase' in operator, false);
});
