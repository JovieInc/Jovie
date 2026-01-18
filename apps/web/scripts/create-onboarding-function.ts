#!/usr/bin/env tsx

/**
 * Create Onboarding Function
 * Creates the onboarding function and required enum
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
  console.log('🔧 Creating onboarding function and enum...\n');

  const sql = neon(DATABASE_URL!);
  const db = drizzle(sql);

  try {
    // Create creator_type enum if it doesn't exist
    console.log('📄 Creating creator_type enum...');
    await db.execute(drizzleSql`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'creator_type') THEN
          CREATE TYPE creator_type AS ENUM ('artist', 'band', 'producer', 'label');
        END IF;
      END $$;
    `);
    console.log('✅ creator_type enum ready');

    // Create the onboarding function
    console.log('📄 Creating create_profile_with_user function...');
    await db.execute(drizzleSql`
      CREATE OR REPLACE FUNCTION create_profile_with_user(
        p_clerk_user_id text,
        p_email text,
        p_username text,
        p_display_name text DEFAULT NULL,
        p_creator_type creator_type DEFAULT 'artist'
      ) RETURNS uuid AS $$
      DECLARE
        v_user_id uuid;
        v_profile_id uuid;
        v_display_name text;
      BEGIN
        -- Set session variable for RLS in current transaction scope
        PERFORM set_config('app.clerk_user_id', p_clerk_user_id, true);

        -- Upsert user (by clerk_id)
        -- Include user_status since it's NOT NULL with no default
        INSERT INTO users (clerk_id, email, user_status)
        VALUES (p_clerk_user_id, p_email, 'active')
        ON CONFLICT (clerk_id)
        DO UPDATE SET
          email = EXCLUDED.email,
          user_status = CASE
            WHEN users.user_status IN ('waitlist_pending', 'waitlist_approved', 'onboarding_incomplete', 'profile_claimed')
            THEN 'active'
            ELSE users.user_status
          END,
          updated_at = now()
        RETURNING id INTO v_user_id;

        -- If user already has a profile, return the existing one (idempotent)
        SELECT id INTO v_profile_id
        FROM creator_profiles
        WHERE user_id = v_user_id
        LIMIT 1;

        IF v_profile_id IS NOT NULL THEN
          RETURN v_profile_id;
        END IF;

        -- Normalize/compute display name fallback
        v_display_name := COALESCE(NULLIF(TRIM(p_display_name), ''), p_username);

        -- Create the creator profile
        INSERT INTO creator_profiles (
          user_id,
          creator_type,
          username,
          username_normalized,
          display_name,
          is_public,
          onboarding_completed_at
        ) VALUES (
          v_user_id,
          p_creator_type,
          p_username,
          lower(p_username),
          v_display_name,
          true,
          now()
        ) RETURNING id INTO v_profile_id;

        RETURN v_profile_id;
      EXCEPTION
        WHEN OTHERS THEN
          -- Let the caller map specific errors (e.g., unique violations) appropriately
          RAISE;
      END;
      $$ LANGUAGE plpgsql SECURITY INVOKER;
    `);
    console.log('✅ create_profile_with_user function created');

    // Add comment
    console.log('📝 Adding function comment...');
    await db.execute(drizzleSql`
      COMMENT ON FUNCTION create_profile_with_user(text, text, text, text, creator_type)
        IS 'Creates or updates user by clerk_id and creates a creator profile atomically with RLS session set.';
    `);
    console.log('✅ Function comment added');

    // Test the function exists
    console.log('\n🧪 Testing function existence...');
    const result = await db.execute(drizzleSql`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_name = 'create_profile_with_user'
        AND routine_type = 'FUNCTION'
    `);

    if (result.rows && result.rows.length > 0) {
      console.log('✅ create_profile_with_user function verified!');
    } else {
      console.log('❌ Function verification failed');
    }

    console.log('\n🎉 Onboarding function setup completed!');
  } catch (error) {
    console.error('❌ Error creating onboarding function:', error);
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
