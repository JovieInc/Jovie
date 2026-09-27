#!/usr/bin/env node
/* eslint-disable @jovie/no-manual-db-pooling -- standalone migration script */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neonConfig, Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';
import ws from 'ws';

config({ path: '.env.local', override: false });
config({ override: false });
neonConfig.webSocketConstructor = ws;

const LOCK_NAMESPACE = 'jovie';
const LOCK_RESOURCE = 'drizzle:migrate';
const LOCK_TIMEOUT = '5s';
const STATEMENT_TIMEOUT = '10min';
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const NEON_URL_PATTERN = /(postgres)(|ql)(\+neon)(.*)/;

export type OnlineIndexArtifact = {
  id: string;
  approvalIssue: string;
  schema: string;
  index: string;
  expectedDefinition: string;
};

export type QueryClient = {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: T[] }>;
};

type IndexState = { definition: string; valid: boolean };

function canonicalDefinition(value: string) {
  return value.trim().replace(/;$/, '').replaceAll(/\s+/g, ' ');
}

function validateArtifact(
  value: unknown,
  filename?: string
): OnlineIndexArtifact {
  if (!value || typeof value !== 'object')
    throw new Error('Artifact must be an object.');
  const artifact = value as Record<string, unknown>;
  for (const field of [
    'id',
    'approvalIssue',
    'schema',
    'index',
    'expectedDefinition',
  ]) {
    if (typeof artifact[field] !== 'string' || artifact[field].length === 0) {
      throw new Error(`Artifact field "${field}" must be a non-empty string.`);
    }
  }

  const result = artifact as OnlineIndexArtifact;
  if (filename && `${result.id}.json` !== filename) {
    throw new Error(`${filename}: id must match the artifact filename.`);
  }
  if (!/^JOV-\d+$/.test(result.approvalIssue)) {
    throw new Error(`${result.id}: approvalIssue must be a JOV issue.`);
  }
  if (!IDENTIFIER.test(result.schema) || !IDENTIFIER.test(result.index)) {
    throw new Error(
      `${result.id}: schema and index must be lowercase SQL identifiers.`
    );
  }

  const definition = canonicalDefinition(result.expectedDefinition);
  const prefix = new RegExp(
    `^CREATE (?:UNIQUE )?INDEX ${result.index} ON ${result.schema}\\.`
  );
  if (
    !prefix.test(definition) ||
    definition.includes(';') ||
    /--|\/\*/.test(definition) ||
    /\bCONCURRENTLY\b|\bIF NOT EXISTS\b/i.test(definition)
  ) {
    throw new Error(
      `${result.id}: expectedDefinition is not a certifiable index definition.`
    );
  }
  result.expectedDefinition = definition;
  return result;
}

export function loadOnlineIndexArtifacts(directory: string) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter(filename => filename.endsWith('.json'))
    .sort()
    .map(filename =>
      validateArtifact(
        JSON.parse(readFileSync(path.join(directory, filename), 'utf8')),
        filename
      )
    );
}

function checksum(artifact: OnlineIndexArtifact) {
  return createHash('sha256').update(JSON.stringify(artifact)).digest('hex');
}

function concurrentDefinition(artifact: OnlineIndexArtifact) {
  return artifact.expectedDefinition.replace(
    /^CREATE (UNIQUE )?INDEX /,
    'CREATE $1INDEX CONCURRENTLY '
  );
}

function qualifiedIndex(artifact: OnlineIndexArtifact) {
  return `"${artifact.schema}"."${artifact.index}"`;
}

async function inspectIndex(
  client: QueryClient,
  artifact: OnlineIndexArtifact
) {
  const result = await client.query<IndexState>(
    `SELECT i.indisvalid AS valid, pg_get_indexdef(c.oid) AS definition
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_index i ON i.indexrelid = c.oid
      WHERE n.nspname = $1 AND c.relname = $2`,
    [artifact.schema, artifact.index]
  );
  return result.rows[0] ?? null;
}

function requireEquivalent(artifact: OnlineIndexArtifact, state: IndexState) {
  if (canonicalDefinition(state.definition) !== artifact.expectedDefinition) {
    throw new Error(
      `${artifact.id}: existing index definition does not match the artifact.`
    );
  }
}

async function recordSuccess(
  client: QueryClient,
  artifact: OnlineIndexArtifact
) {
  await client.query(
    `INSERT INTO drizzle.__jovie_online_index_migrations
       (id, approval_issue, checksum, index_name, definition, applied_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (id) DO UPDATE SET applied_at = excluded.applied_at`,
    [
      artifact.id,
      artifact.approvalIssue,
      checksum(artifact),
      qualifiedIndex(artifact),
      artifact.expectedDefinition,
    ]
  );
}

export async function runOnlineIndexMigrations(
  client: QueryClient,
  artifacts: OnlineIndexArtifact[]
) {
  await client.query(`SELECT set_config('lock_timeout', $1, false)`, [
    LOCK_TIMEOUT,
  ]);
  await client.query(`SELECT set_config('statement_timeout', $1, false)`, [
    STATEMENT_TIMEOUT,
  ]);
  const lock = await client.query<{ locked: boolean }>(
    'SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS locked',
    [LOCK_NAMESPACE, LOCK_RESOURCE]
  );
  if (!lock.rows.some(row => row.locked)) {
    throw new Error('Another migration runner owns the DDL advisory lock.');
  }

  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
    await client.query(`CREATE TABLE IF NOT EXISTS drizzle.__jovie_online_index_migrations (
      id text PRIMARY KEY, approval_issue text NOT NULL, checksum text NOT NULL,
      index_name text NOT NULL, definition text NOT NULL, applied_at timestamptz NOT NULL
    )`);

    for (const rawArtifact of artifacts) {
      const artifact = validateArtifact({ ...rawArtifact });
      const recorded = await client.query<{ checksum: string }>(
        'SELECT checksum FROM drizzle.__jovie_online_index_migrations WHERE id = $1',
        [artifact.id]
      );
      if (
        recorded.rows[0] &&
        recorded.rows[0].checksum !== checksum(artifact)
      ) {
        throw new Error(
          `${artifact.id}: applied artifact checksum changed; append a new artifact.`
        );
      }

      let state = await inspectIndex(client, artifact);
      if (state) {
        requireEquivalent(artifact, state);
        if (!state.valid) {
          await client.query(
            `DROP INDEX CONCURRENTLY ${qualifiedIndex(artifact)}`
          );
          state = null;
        }
      }
      if (!state) {
        await client.query(concurrentDefinition(artifact));
        state = await inspectIndex(client, artifact);
      }
      if (!state?.valid)
        throw new Error(
          `${artifact.id}: index is missing or invalid after build.`
        );
      requireEquivalent(artifact, state);
      await recordSuccess(client, artifact);
    }
  } finally {
    await client.query(
      'SELECT pg_advisory_unlock(hashtext($1), hashtext($2))',
      [LOCK_NAMESPACE, LOCK_RESOURCE]
    );
  }
}

async function main() {
  const webRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
  );
  const artifacts = loadOnlineIndexArtifacts(
    path.join(webRoot, 'drizzle', 'online-indexes')
  );
  if (artifacts.length === 0)
    return console.log('No online index artifacts to apply.');
  if (process.env.ALLOW_ONLINE_INDEX_MIGRATIONS !== 'true') {
    throw new Error(
      'Set ALLOW_ONLINE_INDEX_MIGRATIONS=true after approving the artifacts.'
    );
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');

  const connectionString = process.env.DATABASE_URL.replace(
    NEON_URL_PATTERN,
    'postgres$2$4'
  );
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("SET app.allow_schema_changes = 'true'");
    await runOnlineIndexMigrations(client as QueryClient, artifacts);
  } finally {
    client.release();
    await pool.end();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
