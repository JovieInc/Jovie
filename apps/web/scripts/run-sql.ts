#!/usr/bin/env tsx

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import path from 'path';

config({ path: '.env.local', override: true });
config();

const NEON_URL_PATTERN = /(postgres)(|ql)(\+neon)(.*)/;

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: tsx scripts/run-sql.ts <path-to-sql>');
    process.exit(1);
  }

  const absPath = path.isAbsolute(fileArg)
    ? fileArg
    : path.join(process.cwd(), fileArg);

  const sqlText = readFileSync(absPath, 'utf8');
  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL in environment');
    process.exit(1);
  }

  // Clean Neon URL to standard Postgres URL
  const rawUrl = process.env.DATABASE_URL;
  const databaseUrl = rawUrl.replace(NEON_URL_PATTERN, 'postgres$2$4');

  const sql = neon(databaseUrl);

  try {
    console.log(`[SQL] Applying file: ${absPath}`);
    // Execute raw SQL using tagged template literal syntax
    // Cast to TemplateStringsArray for raw SQL text execution
    await sql([sqlText] as unknown as TemplateStringsArray);
    console.log('[SQL] Success');
  } catch (err) {
    console.error('[SQL] Error applying file:', err);
    process.exit(1);
  }
  // Neon HTTP driver has no persistent connection - no cleanup needed
}

main();
