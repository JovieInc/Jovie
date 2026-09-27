#!/usr/bin/env node
// Read-only production SQL for agents and operators.
//
//   scripts/db/prod-read.mjs "select count(*) from creator_profiles"
//
// Connects to the direct (non-pooler) Neon endpoint and wraps the query in
// BEGIN READ ONLY ... COMMIT with a session-wide read-only default, so it
// cannot write and nothing it sets can leak into pooled app connections.
// DATABASE_URL comes from the environment, else from Doppler jovie-web/prd.
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  directNeonUrl,
  findSessionScopedSql,
  findTransactionControl,
  SAFE_READ_ONLY_GUIDANCE,
} from '../lib/pg-session-scope.mjs';

// Session-wide read-only default on the direct (unpooled) connection: even a
// transaction the query opens itself cannot write. It ends with the session.
export const READ_ONLY_PGOPTIONS = '-c default_transaction_read_only=on';

export function buildPsqlArgs(databaseUrl, query) {
  const match = findSessionScopedSql(query);
  if (match) {
    throw new Error(
      `Refusing session-scoped SQL (${match}).\n${SAFE_READ_ONLY_GUIDANCE}`
    );
  }
  const control = findTransactionControl(query);
  if (control || query.trimStart().startsWith('\\')) {
    throw new Error(
      `Refusing transaction control or psql meta-commands (${control ?? '\\'}); pass one read query.`
    );
  }
  return [
    directNeonUrl(databaseUrl),
    '-X',
    '-A',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    'BEGIN READ ONLY',
    '-c',
    query,
    '-c',
    'COMMIT',
  ];
}

function productionDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return execFileSync(
    'doppler',
    [
      'secrets',
      'get',
      'DATABASE_URL',
      '-p',
      'jovie-web',
      '-c',
      'prd',
      '--plain',
    ],
    { encoding: 'utf8' }
  ).trim();
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const query = process.argv.slice(2).join(' ').trim();
  if (!query) {
    process.stderr.write('Usage: scripts/db/prod-read.mjs "<select ...>"\n');
    process.exit(64);
  }
  let args;
  try {
    args = buildPsqlArgs(productionDatabaseUrl(), query);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  const result = spawnSync('psql', args, {
    stdio: 'inherit',
    env: { ...process.env, PGOPTIONS: READ_ONLY_PGOPTIONS },
  });
  process.exit(result.status ?? 1);
}
