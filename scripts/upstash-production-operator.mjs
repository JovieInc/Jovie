#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

export const JOVIE_PRODUCTION_REDIS = Object.freeze({
  databaseId: '11d5c151-1fe9-4b37-af35-842dfe495090',
  databaseName: 'Jovie-1',
  endpoint: 'real-kiwi-157253.upstash.io',
  vercelProjectId: 'prj_HPZm5iGtARQ2qef6g2xtjgFIGDVY',
});

const API_ORIGIN = 'https://api.upstash.com';
const OPERATIONS = Object.freeze({
  database: Object.freeze({
    method: 'GET',
    path: `/v2/redis/database/${JOVIE_PRODUCTION_REDIS.databaseId}`,
  }),
  stats: Object.freeze({
    method: 'GET',
    path: `/v2/redis/stats/${JOVIE_PRODUCTION_REDIS.databaseId}`,
  }),
  resetPassword: Object.freeze({
    method: 'POST',
    path: `/v2/redis/reset-password/${JOVIE_PRODUCTION_REDIS.databaseId}`,
  }),
});

function readDatabaseField(database, snakeName, camelName) {
  return database?.[snakeName] ?? database?.[camelName];
}

export function verifyJovieProductionDatabase(database) {
  const actual = {
    databaseId: readDatabaseField(database, 'database_id', 'databaseId'),
    databaseName: readDatabaseField(database, 'database_name', 'databaseName'),
    endpoint: database?.endpoint,
  };

  for (const field of ['databaseId', 'databaseName', 'endpoint']) {
    if (actual[field] !== JOVIE_PRODUCTION_REDIS[field]) {
      throw new Error(`Upstash production database ${field} mismatch`);
    }
  }
  return actual;
}

export function createUpstashProductionOperator({
  email,
  apiKey,
  fetchImpl = fetch,
}) {
  if (!email || !apiKey) {
    throw new Error('UPSTASH_EMAIL and UPSTASH_API_KEY are required');
  }
  const authorization = `Basic ${Buffer.from(`${email}:${apiKey}`).toString('base64')}`;

  async function request(operationName) {
    const operation = OPERATIONS[operationName];
    if (!operation) throw new Error('Upstash operation is not allowlisted');

    const response = await fetchImpl(`${API_ORIGIN}${operation.path}`, {
      method: operation.method,
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(
        `Upstash ${operationName} request failed with HTTP ${response.status}`
      );
    }
    return response.json();
  }

  return Object.freeze({
    async status() {
      const database = await request('database');
      const identity = verifyJovieProductionDatabase(database);
      const stats = await request('stats');
      return { identity, stats };
    },

    async resetPassword(confirmation) {
      const requiredConfirmation = `${JOVIE_PRODUCTION_REDIS.databaseId}:${JOVIE_PRODUCTION_REDIS.endpoint}`;
      if (confirmation !== requiredConfirmation) {
        throw new Error('Exact Upstash database confirmation is required');
      }
      const database = await request('database');
      verifyJovieProductionDatabase(database);
      return request('resetPassword');
    },
  });
}

function safeStatus(result) {
  return {
    database: result.identity,
    statsReceived: Boolean(result.stats && typeof result.stats === 'object'),
  };
}

async function main() {
  const command = process.argv[2] ?? 'status';
  const operator = createUpstashProductionOperator({
    email: process.env.UPSTASH_EMAIL,
    apiKey: process.env.UPSTASH_API_KEY,
  });

  if (command === 'status') {
    console.log(JSON.stringify(safeStatus(await operator.status())));
    return;
  }

  if (command === 'reset-password') {
    if (process.env.UPSTASH_ROTATION_EXECUTE !== 'true') {
      throw new Error('UPSTASH_ROTATION_EXECUTE=true is required');
    }
    // The returned credential is intentionally never printed. Callers must
    // consume it in-process and immediately update the production secret.
    await operator.resetPassword(process.env.UPSTASH_DATABASE_CONFIRMATION);
    console.log(JSON.stringify({ status: 'rotated', credential: 'redacted' }));
    return;
  }

  throw new Error('Command must be status or reset-password');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(
      error instanceof Error ? error.message : 'Upstash operator failed'
    );
    process.exitCode = 1;
  });
}
