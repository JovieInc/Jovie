#!/usr/bin/env tsx

/**
 * Apply Onboarding Migration
 * Ensures the create_profile_with_user function exists
 */

import { neon } from '@neondatabase/serverless';
import { config as dotenvConfig } from 'dotenv';
import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load environment variables
dotenvConfig({ path: '.env.local', override: true });
dotenvConfig();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured');
  process.exit(1);
}

async function main() {
  console.log('🔧 Applying onboarding migration...\n');

  const sql = neon(DATABASE_URL!);
  const db = drizzle(sql);

  try {
    // Read the onboarding function migration
    const migrationPath = join(
      process.cwd(),
      'drizzle',
      'migrations',
      '20250827195510_onboarding_function.sql'
    );
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    console.log('📄 Applying create_profile_with_user function...');
    await db.execute(drizzleSql.raw(migrationSQL));

    console.log('✅ Migration applied successfully!');

    // Test the function exists
    console.log('🧪 Testing function existence...');
    const result = await db.execute(drizzleSql`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_name = 'create_profile_with_user'
        AND routine_type = 'FUNCTION'
    `);

    if (result.rows && result.rows.length > 0) {
      console.log('✅ create_profile_with_user function exists!');
    } else {
      console.log('❌ Function not found after migration');
    }
  } catch (error) {
    console.error('❌ Error applying migration:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}
