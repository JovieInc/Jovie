#!/usr/bin/env node
/* eslint-disable @jovie/no-manual-db-pooling -- standalone script */
import { neonConfig, Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';
import ws from 'ws';

config({ path: '.env.local', override: false });
config({ override: false });
neonConfig.webSocketConstructor = ws;

const NEON_URL_PATTERN = /(postgres)(|ql)(\+neon)(.*)/;

async function checkTestProfiles() {
  const rawUrl = process.env.DATABASE_URL;
  const databaseUrl = rawUrl.replace(NEON_URL_PATTERN, 'postgres$2$4');
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });

  try {
    const client = await pool.connect();

    const result = await client.query(`
      SELECT username, display_name, is_public, is_claimed, created_at
      FROM creator_profiles
      WHERE username IN ('dualipa', 'taylorswift')
      ORDER BY created_at DESC
    `);

    console.log('Test profiles in database:');
    console.log(JSON.stringify(result.rows, null, 2));
    console.log(`\nTotal found: ${result.rows.length}`);

    client.release();
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('ERROR:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkTestProfiles();
