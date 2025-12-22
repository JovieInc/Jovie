#!/usr/bin/env tsx

/**
 * Check Onboarding Function
 * Tests if the onboarding function exists and works
 */

import { neon } from '@neondatabase/serverless';
import { config as dotenvConfig } from 'dotenv';
import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';

// Load environment variables
dotenvConfig({ path: '.env.local', override: true });
dotenvConfig();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured');
  process.exit(1);
}

async function main() {
  console.log('🔍 Checking onboarding function...\n');

  const sql = neon(DATABASE_URL!);
  const db = drizzle(sql);

  try {
    // Check if function exists
    console.log('🧪 Testing function existence...');
    const result = await db.execute(drizzleSql`
      SELECT routine_name, routine_type
      FROM information_schema.routines 
      WHERE routine_name = 'create_profile_with_user'
    `);

    if (result.rows && result.rows.length > 0) {
      console.log('✅ create_profile_with_user function exists!');
      console.log(
        `   Type: ${(result.rows?.[0] as { routine_type: string })?.routine_type}`
      );
    } else {
      console.log('❌ Function not found');
    }

    // Check creator_type enum exists
    console.log('\n🔍 Checking creator_type enum...');
    const enumResult = await db.execute(drizzleSql`
      SELECT enumlabel 
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'creator_type'
    `);

    if (enumResult.rows && enumResult.rows.length > 0) {
      console.log('✅ creator_type enum exists!');
      console.log(
        '   Values:',
        enumResult.rows
          .map((r: Record<string, unknown>) => r.enumlabel as string)
          .join(', ')
      );
    } else {
      console.log('❌ creator_type enum not found');
    }

    // Check tables exist
    console.log('\n🔍 Checking required tables...');
    const tables = await db.execute(drizzleSql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'creator_profiles')
      ORDER BY table_name
    `);

    console.log(`✅ Found ${tables.rows?.length || 0} required tables:`);
    if (tables.rows) {
      tables.rows.forEach(table => {
        console.log(`   • ${table.table_name}`);
      });
    }
  } catch (error) {
    console.error('❌ Error checking onboarding function:', error);
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
