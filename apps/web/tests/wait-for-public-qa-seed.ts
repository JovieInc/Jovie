import { neon } from '@neondatabase/serverless';
import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';

const databaseUrl = process.env.DATABASE_URL?.trim();

async function main() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const db = drizzle(neon(databaseUrl));
  const tableCheck = await db.execute<{ has_table: boolean }>(drizzleSql`
    SELECT to_regclass('public.library_asset_approval_statuses') IS NOT NULL AS has_table
  `);

  if (!tableCheck.rows[0]?.has_table) {
    process.exitCode = 2;
    return;
  }

  const seeded = await db.execute<{ count: number }>(drizzleSql`
    SELECT COUNT(*)::int AS count
    FROM library_asset_approval_statuses
    WHERE approval_status = 'approved'
  `);

  if ((seeded.rows[0]?.count ?? 0) > 0) {
    console.log(
      `Shared Neon seed ready (${seeded.rows[0]?.count ?? 0} approved rows)`
    );
    return;
  }

  process.exitCode = 2;
}

void main().catch(error => {
  console.error(error);
  process.exit(1);
});
