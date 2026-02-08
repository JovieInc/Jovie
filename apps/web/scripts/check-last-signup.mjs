#!/usr/bin/env node
/* eslint-disable @jovie/no-manual-db-pooling -- standalone script */
import { neonConfig, Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';
import ws from 'ws';

// Load environment
config({ path: '.env.local', override: false });
config({ override: false });

// Configure WebSocket
neonConfig.webSocketConstructor = ws;

const NEON_URL_PATTERN = /(postgres)(|ql)(\+neon)(.*)/;

async function checkLastSignup() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    console.error('ERROR: DATABASE_URL not set');
    process.exit(1);
  }

  const databaseUrl = rawUrl.replace(NEON_URL_PATTERN, 'postgres$2$4');
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });

  try {
    const client = await pool.connect();

    console.log('Checking last waitlist signup...\n');

    // Get most recent waitlist entry
    const waitlistCheck = await client.query(`
      SELECT id, email, full_name, status, created_at
      FROM waitlist_entries
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (waitlistCheck.rows.length > 0) {
      const entry = waitlistCheck.rows[0];
      console.log('✓ Most recent waitlist entry:');
      console.log('  Email:', entry.email);
      console.log('  Name:', entry.full_name);
      console.log('  Status:', entry.status);
      console.log('  Created:', entry.created_at);
      console.log('  Entry ID:', entry.id);
      console.log('');

      // Check if profile was created
      const profileCheck = await client.query(
        `
        SELECT id, username, display_name, is_claimed, is_public, user_id
        FROM creator_profiles
        WHERE waitlist_entry_id = $1
      `,
        [entry.id]
      );

      if (profileCheck.rows.length > 0) {
        const profile = profileCheck.rows[0];
        console.log('✓ Auto-created profile found:');
        console.log('  Profile ID:', profile.id);
        console.log('  Username:', profile.username);
        console.log('  Display Name:', profile.display_name);
        console.log('  Is Claimed:', profile.is_claimed);
        console.log('  Is Public:', profile.is_public);
        console.log('  Linked to User ID:', profile.user_id || '(not yet)');
      } else {
        console.log('✗ NO PROFILE found for this waitlist entry!');
        console.log('  This means the signup failed during profile creation.');
      }

      // Check if user record was created
      const userCheck = await client.query(
        `
        SELECT id, email, user_status
        FROM users
        WHERE email ILIKE $1
      `,
        [entry.email]
      );

      console.log('');
      if (userCheck.rows.length > 0) {
        const user = userCheck.rows[0];
        console.log('✓ User record found:');
        console.log('  User ID:', user.id);
        console.log('  Status:', user.user_status);
      } else {
        console.log('✗ NO USER record found for this email!');
      }
    } else {
      console.log('No waitlist entries found in database.');
    }

    client.release();
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('ERROR:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkLastSignup();
