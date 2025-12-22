#!/usr/bin/env node

/**
 * Tim White User Seed Script
 * Creates the specific Clerk user account for Tim White and links it to the existing creator profile
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.development.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error(
    'Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedTimUser() {
  console.log('👤 Creating Tim White user account...\n');

  const sqlPath = path.join(__dirname, '..', 'supabase', 'seed_tim_user.sql');

  try {
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(
        stmt =>
          stmt.length > 0 && !stmt.startsWith('--') && !stmt.includes('SELECT')
      );

    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`📝 Executing: ${statement.substring(0, 50)}...`);
        const { error } = await supabase.rpc('exec_sql', {
          sql_query: statement,
        });
        if (error) {
          console.error(`❌ Error: ${error.message}`);
        } else {
          console.log('✅ Success');
        }
      }
    }

    // Verify the user was created and linked correctly
    console.log('\n🔍 Verifying Tim White user setup...');

    const { data, error } = await supabase
      .from('creator_profiles')
      .select(
        `
        username,
        display_name,
        user_id,
        app_users!inner(email)
      `
      )
      .eq('username', 'tim')
      .single();

    if (error) {
      console.error('❌ Error verifying setup:', error.message);
      return;
    }

    if (data) {
      console.log('✅ Tim White user successfully set up:');
      console.log(`   • Profile: ${data.display_name} (@${data.username})`);
      console.log(`   • Clerk ID: ${data.user_id}`);
      console.log(`   • Email: ${data.app_users.email}`);
      console.log(`   • Profile URL: https://jov.ie/${data.username}`);
    }

    console.log('\n🎉 Tim White user seeding completed!');
    console.log('\nCredentials:');
    console.log('• Email: t@timwhite.co');
    console.log('• Clerk ID: user_31WSX2aM04NNT8bFAQppljnGuGN');
    console.log('• Password: [provided separately]');
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    throw error;
  }
}

if (require.main === module) {
  seedTimUser()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Seeding failed:', error.message);
      process.exit(1);
    });
}

module.exports = { seedTimUser };
