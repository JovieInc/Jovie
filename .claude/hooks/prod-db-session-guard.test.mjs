// Run: node --test .claude/hooks/prod-db-session-guard.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  buildPsqlArgs,
  READ_ONLY_PGOPTIONS,
} from '../../scripts/db/prod-read.mjs';
import {
  directNeonUrl,
  sessionScopeViolation,
} from '../../scripts/lib/pg-session-scope.mjs';

const HOOK = resolve(import.meta.dirname, 'prod-db-session-guard.mjs');
// Built from parts so the fixture is not a connection-string literal.
const POOLER_HOST = 'ep-fixture-endpoint-pooler.c-0.us-east-1.aws.neon.tech';
const POOLER = `${['postgresql', '//fixture'].join(':')}@${POOLER_HOST}/db?sslmode=require`;

function runHook(command) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
  });
}

// The exact shape that made production writes read-only on 2026-09-27.
const INCIDENT =
  'DB=$(doppler secrets get DATABASE_URL --project jovie-web --config prd --plain); psql "$DB" -X -A -c "set default_transaction_read_only=on; select count(*) from leads;"';

test('blocks the incident command and other session-scoped settings', () => {
  for (const command of [
    INCIDENT,
    `psql "$DATABASE_URL" -c "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY"`,
    `psql "$DATABASE_URL" -c "select 1; SET statement_timeout TO 0"`,
    `psql "$DATABASE_URL" -c "SET ROLE readonly"`,
    `psql "$DATABASE_URL" -c "select set_config('default_transaction_read_only', 'on', false)"`,
    `psql "$DATABASE_URL" -c "ALTER ROLE neondb_owner SET default_transaction_read_only = on"`,
    `psql "$DATABASE_URL" <<'SQL'\nset search_path to public;\nselect 1;\nSQL`,
    `psql "$DATABASE_URL" -c "SET /* read only */ default_transaction_read_only=on"`,
    `psql "$DATABASE_URL" -c $'SET--comment\\ndefault_transaction_read_only=on'`,
    `psql "$DATABASE_URL" -c "SET TIME ZONE 'UTC'"`,
    `psql "$DATABASE_URL" -c "select '--'; set default_transaction_read_only = on"`,
    `psql "$DATABASE_URL" -c "select pg_catalog.set_config('default_transaction_read_only', concat('o','n'), false)"`,
    `psql "$DATABASE_URL" -c "select set_config('default_transaction_read_only', 'on', false::boolean)"`,
    `psql "$DATABASE_URL" -c "set schema 'public'"`,
    `psql "$DATABASE_URL" -c "update t set x = 1" -c "set default_transaction_read_only = on"`,
    `psql "$DATABASE_URL" -c "select 1; -- note\nSET statement_timeout = 0"`,
  ]) {
    assert.ok(sessionScopeViolation(command), command);
    const result = runHook(command);
    assert.equal(result.status, 2, command);
    assert.match(result.stderr, /BLOCKED: session-scoped Postgres setting/);
    assert.match(result.stderr, /BEGIN READ ONLY/);
  }
});

test('allows transaction-scoped and unrelated commands', () => {
  for (const command of [
    `psql "$DB" -X -c "BEGIN READ ONLY" -c "select count(*) from leads" -c "COMMIT"`,
    `psql "$DB" -c "BEGIN; SET LOCAL statement_timeout = '5s'; select 1; COMMIT;"`,
    `psql "$DB" -c "BEGIN; SET TRANSACTION READ ONLY; select 1; COMMIT;"`,
    `psql "$DB" -c "update creator_profiles set is_public = true where id = 'x'"`,
    `psql "$DB" -c "select current_setting('default_transaction_read_only')"`,
    `psql "$DB" -c "select set_config('app.clerk_user_id', 'u', true)"`,
    'set -euo pipefail; pnpm test',
    `set -e\npsql "$DB" -c "select 1"`,
    'git config --global user.name x',
    `psql --no-psqlrc "$DB" -c "select 1"`,
    `psql "$DB" -c "UPDATE leads\nSET status = 'x'\nWHERE id = 'y'"`,
    `psql "$DB" -c "insert into t values (1) on conflict (id) do update\n  set v = 2"`,
  ]) {
    assert.equal(sessionScopeViolation(command), null, command);
    assert.equal(runHook(command).status, 0, command);
  }
});

test('scans existing SQL files passed with -f or stdin redirection', () => {
  const files = {
    '/tmp/bad.sql': 'select 1;\nset default_transaction_read_only = on;\n',
    '/tmp/ok.sql': 'begin read only;\nselect 1;\ncommit;\n',
  };
  const read = path => files[path] ?? null;
  assert.match(
    sessionScopeViolation('psql "$DATABASE_URL" -f /tmp/bad.sql', read),
    /in \/tmp\/bad\.sql/
  );
  assert.ok(sessionScopeViolation('psql "$DATABASE_URL" < /tmp/bad.sql', read));
  assert.ok(
    sessionScopeViolation(`psql "$DATABASE_URL" --file='/tmp/bad.sql'`, read)
  );
  assert.equal(sessionScopeViolation('psql "$DATABASE_URL" -f /tmp/ok.sql', read), null);
  assert.equal(sessionScopeViolation('psql "$DATABASE_URL" -f /tmp/missing.sql', read), null);
});

test('hook ignores malformed input', () => {
  const result = spawnSync(process.execPath, [HOOK], {
    input: 'not json',
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
});

test('prod-read targets the direct endpoint inside a read-only transaction', () => {
  assert.equal(
    new URL(directNeonUrl(POOLER)).hostname,
    'ep-fixture-endpoint.c-0.us-east-1.aws.neon.tech'
  );
  assert.equal(directNeonUrl(POOLER).includes('sslmode=require'), true);
  for (const query of [
    'select 1',
    '  -- why\nwith x as (select 1) select * from x;',
    '/* note */ explain select 1',
  ]) {
    assert.ok(buildPsqlArgs(POOLER, query), query);
  }
  const args = buildPsqlArgs(POOLER, 'select 1');
  assert.doesNotMatch(args[0], /-pooler\./);
  assert.deepEqual(args.slice(-6), [
    '-c',
    'BEGIN READ ONLY',
    '-c',
    'select 1',
    '-c',
    'COMMIT',
  ]);
  assert.throws(
    () => buildPsqlArgs(POOLER, 'set default_transaction_read_only=on; select 1'),
    /Refusing session-scoped SQL/
  );
  for (const query of [
    'COMMIT; DELETE FROM creator_profiles',
    'select 1; begin read write; delete from leads',
    'rollback; /* x */ delete from leads',
    'SET TRANSACTION READ WRITE; DELETE FROM creator_profiles',
    "SELECT '--'; COMMIT; SET default_transaction_read_only=off; DELETE FROM leads",
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity',
    "select pg_advisory_lock(1)",
    'DELETE FROM leads',
    '\\! echo hi',
  ]) {
    assert.throws(() => buildPsqlArgs(POOLER, query), /Refusing/, query);
  }
  assert.equal(READ_ONLY_PGOPTIONS, '-c default_transaction_read_only=on');
});
