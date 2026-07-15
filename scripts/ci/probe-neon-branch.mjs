#!/usr/bin/env node

import { createRequire } from 'node:module';

const requireFromWeb = createRequire(
  new URL('../../apps/web/package.json', import.meta.url)
);
const { neon } = requireFromWeb('@neondatabase/serverless');

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error('Neon admission probe requires DATABASE_URL.');
  process.exit(1);
}

try {
  const sql = neon(databaseUrl);
  const rows = await sql`SELECT 1 AS ok`;
  if (rows?.[0]?.ok !== 1) {
    throw new Error('SELECT 1 returned an unexpected response.');
  }
  console.log('Neon shared branch admission SELECT 1 passed.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const status = Number(error?.statusCode ?? error?.status);
  const statusDetail = Number.isInteger(status)
    ? ` HTTP status ${status}:`
    : ':';
  console.error(
    `Neon shared branch admission failed${statusDetail} ${message}`
  );
  process.exit(1);
}
