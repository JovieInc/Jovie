#!/usr/bin/env tsx

/**
 * Check migration status
 * Compares which migrations are recorded vs which files exist
 */

import { neonConfig, Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import path from 'path';
import ws from 'ws';

// Load environment
config({ path: '.env.local', override: false });
config({ override: false });

neonConfig.webSocketConstructor = ws;

async function checkMigrationStatus() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // Check if migration table exists
    const tableCheck = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'drizzle' AND tablename = '__drizzle_migrations') as exists"
    );

    if (!tableCheck.rows[0]?.exists) {
      console.log('❌ Migration table does not exist yet');
      console.log('Run: pnpm run db:migrate');
      return;
    }

    // Get recorded migrations
    const recorded = await client.query<{ hash: string; created_at: number }>(
      'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at'
    );

    // Get migrations from journal
    const journalPath = path.join(
      process.cwd(),
      'drizzle',
      'migrations',
      'meta',
      '_journal.json'
    );
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: Array<{ tag: string; when: number }>;
    };

    console.log('\n📊 Migration Status\n');
    console.log(`Recorded in database: ${recorded.rows.length}`);
    console.log(`Available in files: ${journal.entries.length}`);
    console.log('');

    // Find missing migrations
    const recordedTimestamps = new Set(
      recorded.rows.map(r => r.created_at)
    );

    const missing = journal.entries.filter(
      entry => !recordedTimestamps.has(entry.when)
    );

    if (missing.length > 0) {
      console.log(`⚠️  Missing ${missing.length} migrations:\n`);
      missing.forEach(m => console.log(`   - ${m.tag}`));
      console.log('\nRun: pnpm run db:migrate');
    } else {
      console.log('✅ All migrations recorded!');
    }

    // Check for key columns
    console.log('\n🔍 Checking critical columns...\n');
    const columns = await client.query<{
      column_name: string;
      data_type: string;
    }>(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users'
       AND column_name IN ('deleted_at', 'status', 'is_admin', 'is_pro', 'waitlist_entry_id')
       ORDER BY column_name`
    );

    const expected = [
      'deleted_at',
      'status',
      'is_admin',
      'is_pro',
      'waitlist_entry_id',
    ];
    const found = new Set(columns.rows.map(c => c.column_name));

    expected.forEach(col => {
      const exists = found.has(col);
      console.log(`   ${exists ? '✅' : '❌'} users.${col}`);
    });
  } finally {
    client.release();
    await pool.end();
  }
}

checkMigrationStatus().catch(console.error);
