#!/usr/bin/env node
/* eslint-disable @jovie/no-manual-db-pooling -- standalone script */
/**
 * Manually approve a waitlist entry for testing
 * This simulates what the admin approval endpoint will do in PR #3
 */

import { neonConfig, Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';
import ws from 'ws';

config({ path: '.env.local', override: false });
config({ override: false });
neonConfig.webSocketConstructor = ws;

const NEON_URL_PATTERN = /(postgres)(|ql)(\+neon)(.*)/;

async function approveWaitlistEntry() {
  const rawUrl = process.env.DATABASE_URL;
  const databaseUrl = rawUrl.replace(NEON_URL_PATTERN, 'postgres$2$4');
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });

  try {
    const client = await pool.connect();

    // Get the most recent waitlist entry
    const entryResult = await client.query(`
      SELECT id, email, full_name, status
      FROM waitlist_entries
      WHERE status = 'new'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (entryResult.rows.length === 0) {
      console.log('No pending waitlist entries found');
      client.release();
      await pool.end();
      process.exit(0);
    }

    const entry = entryResult.rows[0];
    console.log('Approving waitlist entry:');
    console.log(`  Email: ${entry.email}`);
    console.log(`  Name: ${entry.full_name}`);
    console.log(`  Entry ID: ${entry.id}\n`);

    // Start transaction
    await client.query('BEGIN');

    // 1. Get the auto-created profile
    const profileResult = await client.query(
      `
      SELECT id, username, display_name
      FROM creator_profiles
      WHERE waitlist_entry_id = $1
    `,
      [entry.id]
    );

    if (profileResult.rows.length === 0) {
      throw new Error('No profile found for this waitlist entry');
    }

    const profile = profileResult.rows[0];
    console.log('Found profile:');
    console.log(`  Profile ID: ${profile.id}`);
    console.log(`  Username: ${profile.username}\n`);

    // 2. Get the user by email
    const userResult = await client.query(
      `
      SELECT id, clerk_id
      FROM users
      WHERE email ILIKE $1
    `,
      [entry.email]
    );

    if (userResult.rows.length === 0) {
      throw new Error('No user found for this email');
    }

    const user = userResult.rows[0];
    console.log('Found user:');
    console.log(`  User ID: ${user.id}`);
    console.log(`  Clerk ID: ${user.clerk_id}\n`);

    // 3. Link profile to user and mark as claimed + public
    await client.query(
      `
      UPDATE creator_profiles
      SET
        user_id = $1,
        is_claimed = true,
        is_public = true,
        onboarding_completed_at = NOW(),
        updated_at = NOW()
      WHERE id = $2
    `,
      [user.id, profile.id]
    );

    console.log('✓ Profile updated (claimed, public, linked to user)');

    // 4. Update waitlist entry status to 'claimed' (skip 'invited' state)
    await client.query(
      `
      UPDATE waitlist_entries
      SET status = 'claimed', updated_at = NOW()
      WHERE id = $1
    `,
      [entry.id]
    );

    console.log('✓ Waitlist entry marked as claimed');

    // 5. Update user status to 'active'
    await client.query(
      `
      UPDATE users
      SET user_status = 'active', updated_at = NOW()
      WHERE id = $1
    `,
      [user.id]
    );

    console.log('✓ User status updated to active');

    // Commit transaction
    await client.query('COMMIT');

    console.log('\n🎉 Approval complete!');
    console.log('The user can now sign in and access the dashboard.\n');

    client.release();
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('ERROR:', error.message);
    await pool.end();
    process.exit(1);
  }
}

approveWaitlistEntry();
