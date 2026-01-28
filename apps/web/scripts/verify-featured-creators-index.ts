#!/usr/bin/env npx tsx
/**
 * Verify Featured Creators Index
 *
 * This script verifies that the featured creators query index exists
 * and is being used by PostgreSQL. It also provides recommendations
 * if the index is missing or not being utilized.
 *
 * Usage:
 *   pnpm tsx scripts/verify-featured-creators-index.ts
 */

import { neonConfig, Pool } from '@neondatabase/serverless';
import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';

// Configure WebSocket for Node.js
neonConfig.webSocketConstructor = ws;

const INDEX_NAME = 'idx_creator_profiles_featured_query';
const TABLE_NAME = 'creator_profiles';

interface IndexInfo {
  exists: boolean;
  indexname?: string;
  indexdef?: string;
  idx_scan?: number;
  idx_tup_read?: number;
  idx_tup_fetch?: number;
}

async function checkIndexExists(
  db: ReturnType<typeof drizzle>
): Promise<IndexInfo> {
  // Check if index exists
  const indexCheck = await db.execute<{ exists: boolean }>(drizzleSql`
    SELECT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = ${TABLE_NAME}
        AND indexname = ${INDEX_NAME}
    ) AS exists
  `);

  const exists = Boolean(indexCheck.rows[0]?.exists);

  if (!exists) {
    return { exists: false };
  }

  // Get index definition
  const indexDef = await db.execute<{ indexdef: string }>(drizzleSql`
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = ${TABLE_NAME}
      AND indexname = ${INDEX_NAME}
  `);

  // Get index usage statistics
  const stats = await db.execute<{
    idx_scan: number;
    idx_tup_read: number;
    idx_tup_fetch: number;
  }>(drizzleSql`
    SELECT 
      COALESCE(idx_scan, 0)::bigint AS idx_scan,
      COALESCE(idx_tup_read, 0)::bigint AS idx_tup_read,
      COALESCE(idx_tup_fetch, 0)::bigint AS idx_tup_fetch
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
      AND relname = ${TABLE_NAME}
      AND indexrelname = ${INDEX_NAME}
  `);

  return {
    exists: true,
    indexname: INDEX_NAME,
    indexdef: indexDef.rows[0]?.indexdef,
    idx_scan: Number(stats.rows[0]?.idx_scan || 0),
    idx_tup_read: Number(stats.rows[0]?.idx_tup_read || 0),
    idx_tup_fetch: Number(stats.rows[0]?.idx_tup_fetch || 0),
  };
}

async function getTableStats(db: ReturnType<typeof drizzle>) {
  const stats = await db.execute<{
    n_live_tup: number;
    n_dead_tup: number;
    last_vacuum: string | null;
    last_autovacuum: string | null;
    last_analyze: string | null;
    last_autoanalyze: string | null;
  }>(drizzleSql`
    SELECT 
      n_live_tup::bigint AS n_live_tup,
      n_dead_tup::bigint AS n_dead_tup,
      last_vacuum,
      last_autovacuum,
      last_analyze,
      last_autoanalyze
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
      AND relname = ${TABLE_NAME}
  `);

  return stats.rows[0];
}

async function testQueryPerformance(db: ReturnType<typeof drizzle>) {
  console.log('\n📊 Testing query performance...');

  // Enable EXPLAIN
  await db.execute(drizzleSql`SET enable_seqscan = on`);

  // Run EXPLAIN ANALYZE on the featured creators query
  const explainResult = await db.execute<{ 'QUERY PLAN': string }>(drizzleSql`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT 
      id,
      username,
      display_name,
      avatar_url,
      creator_type
    FROM creator_profiles
    WHERE is_public = true 
      AND is_featured = true 
      AND marketing_opt_out = false
    ORDER BY display_name
    LIMIT 12
  `);

  // Parse JSON explain output
  const plan = explainResult.rows[0]?.['QUERY PLAN'];
  if (typeof plan === 'string') {
    try {
      const parsed = JSON.parse(plan);
      if (Array.isArray(parsed) && parsed[0]?.Plan) {
        return parsed[0].Plan;
      }
    } catch {
      // If parsing fails, return raw plan
    }
  }

  return null;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🔍 Verifying featured creators index...\n');

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  try {
    // Check if index exists
    const indexInfo = await checkIndexExists(db);
    const tableStats = await getTableStats(db);

    console.log(`📋 Index: ${INDEX_NAME}`);
    console.log(`📊 Table: ${TABLE_NAME}`);
    console.log(
      `📈 Table rows: ${tableStats?.n_live_tup?.toLocaleString() || 'unknown'}\n`
    );

    if (!indexInfo.exists) {
      console.error('❌ Index does NOT exist!\n');
      console.log('💡 To create the index, run:');
      console.log('   pnpm run drizzle:migrate\n');
      console.log('   Or manually create it with:');
      console.log(
        `   CREATE INDEX IF NOT EXISTS "${INDEX_NAME}" ON "${TABLE_NAME}"`
      );
      console.log(
        '   USING btree (is_public, is_featured, marketing_opt_out, display_name)'
      );
      console.log(
        '   WHERE is_public = true AND is_featured = true AND marketing_opt_out = false;\n'
      );
      process.exit(1);
    }

    console.log('✅ Index exists!\n');

    if (indexInfo.indexdef) {
      console.log('📝 Index definition:');
      console.log(`   ${indexInfo.indexdef}\n`);
    }

    // Show usage statistics
    if (indexInfo.idx_scan !== undefined) {
      console.log('📊 Index usage statistics:');
      console.log(`   Scans: ${indexInfo.idx_scan.toLocaleString()}`);
      console.log(
        `   Tuples read: ${(indexInfo.idx_tup_read ?? 0).toLocaleString()}`
      );
      console.log(
        `   Tuples fetched: ${(indexInfo.idx_tup_fetch ?? 0).toLocaleString()}\n`
      );

      if (indexInfo.idx_scan === 0 && (tableStats?.n_live_tup || 0) > 0) {
        console.warn(
          '⚠️  Warning: Index exists but has never been used (idx_scan = 0)'
        );
        console.warn('   This might indicate:');
        console.warn("   1. The query hasn't run since index creation");
        console.warn(
          '   2. PostgreSQL is not using the index (check query plan)'
        );
        console.warn(
          '   3. Table statistics need to be updated (run ANALYZE)\n'
        );
      }
    }

    // Test query performance
    const queryPlan = await testQueryPerformance(db);
    if (queryPlan) {
      console.log('🔍 Query execution plan:');
      const usesIndex = JSON.stringify(queryPlan).includes(INDEX_NAME);

      if (usesIndex) {
        console.log('   ✅ Query is using the index\n');
      } else {
        console.log('   ⚠️  Query is NOT using the index\n');
        console.log('   💡 Recommendations:');
        console.log('      1. Run ANALYZE on the table to update statistics:');
        console.log(`         ANALYZE ${TABLE_NAME};`);
        console.log(
          '      2. Check if the query conditions match the index WHERE clause'
        );
        console.log(
          '      3. Verify the table has data matching the index predicate\n'
        );
      }

      // Show plan details if available
      if (queryPlan['Node Type']) {
        console.log(`   Node Type: ${queryPlan['Node Type']}`);
        if (queryPlan['Total Cost']) {
          console.log(`   Total Cost: ${queryPlan['Total Cost']}`);
        }
        if (queryPlan['Actual Total Time']) {
          console.log(
            `   Actual Time: ${queryPlan['Actual Total Time'].toFixed(2)} ms`
          );
        }
      }
    }

    // Check last analyze time
    if (tableStats?.last_analyze || tableStats?.last_autoanalyze) {
      const lastAnalyze =
        tableStats.last_analyze || tableStats.last_autoanalyze;
      console.log(`\n📅 Last ANALYZE: ${lastAnalyze}`);
    } else {
      console.warn('\n⚠️  Table has never been analyzed');
      console.warn('   Run: ANALYZE creator_profiles; to update statistics\n');
    }

    console.log('\n✅ Verification complete!');
  } catch (error) {
    console.error('❌ Error verifying index:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
