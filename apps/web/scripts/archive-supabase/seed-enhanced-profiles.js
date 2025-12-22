#!/usr/bin/env node

/**
 * Enhanced Profile Seed Script
 * Seeds the database with full profiles for all demo artists including:
 * - Comprehensive biographical information
 * - Multiple social media links
 * - Professional streaming platform URLs
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

async function runSqlFile(filePath) {
  console.log(`📝 Running ${path.basename(filePath)}...`);

  try {
    const sql = fs.readFileSync(filePath, 'utf8');

    // Split SQL into individual statements (basic approach)
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        const { error } = await supabase.rpc('exec_sql', {
          sql_query: statement,
        });
        if (error) {
          console.error(`❌ Error executing statement: ${error.message}`);
          console.error(`Statement: ${statement.substring(0, 100)}...`);
        }
      }
    }

    console.log(`✅ Completed ${path.basename(filePath)}`);
  } catch (error) {
    console.error(`❌ Error reading file ${filePath}:`, error.message);
  }
}

async function seedDatabase() {
  console.log('🌱 Starting enhanced profile seeding...\n');

  const supabaseDir = path.join(__dirname, '..', 'supabase');

  // Run migrations first
  console.log('1️⃣ Running migrations...');
  try {
    await runSqlFile(
      path.join(
        supabaseDir,
        'migrations',
        '20250819000001_add_social_links_table.sql'
      )
    );
  } catch (error) {
    console.log('ℹ️  Migration may already be applied:', error.message);
  }

  // Run enhanced profiles seed
  console.log('\n2️⃣ Seeding enhanced creator profiles...');
  await runSqlFile(path.join(supabaseDir, 'seed_enhanced_profiles.sql'));

  // Run enhanced social links seed
  console.log('\n3️⃣ Seeding enhanced social links...');
  await runSqlFile(path.join(supabaseDir, 'seed_enhanced_social_links.sql'));

  console.log('\n🎉 Enhanced profile seeding completed!');
  console.log('\nSeed data includes:');
  console.log('• 10 demo artists with full biographical information');
  console.log(
    '• Comprehensive social media links (Instagram, Twitter, TikTok, etc.)'
  );
  console.log(
    '• Professional streaming platform URLs (Spotify, Apple Music, YouTube)'
  );
  console.log('• Proper social link ordering and display text');

  // Verify the seeding worked
  console.log('\n🔍 Verifying seed data...');

  try {
    const { data: profiles, error: profilesError } = await supabase
      .from('creator_profiles')
      .select('username, display_name, bio')
      .order('username');

    if (profilesError) {
      console.error('❌ Error fetching profiles:', profilesError.message);
      return;
    }

    console.log(`✅ Found ${profiles.length} creator profiles:`);
    profiles.forEach(profile => {
      console.log(`   • ${profile.display_name} (@${profile.username})`);
      if (profile.bio) {
        console.log(
          `     "${profile.bio.substring(0, 80)}${profile.bio.length > 80 ? '...' : ''}"`
        );
      }
    });

    const { data: links, error: linksError } = await supabase
      .from('social_links')
      .select('platform')
      .eq('creator_profile_id', profiles[0]?.id || '');

    if (!linksError && links) {
      console.log(
        `\n📱 Social platforms available: ${links.map(l => l.platform).join(', ')}`
      );
    }
  } catch (error) {
    console.error('❌ Error verifying seed data:', error.message);
  }
}

// Alternative direct execution approach for Supabase (for future use)
// async function execDirectSql(sql) {
//   try {
//     // For local Supabase, we can execute SQL directly
//     const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
//     if (error) throw error;
//     return data;
//   } catch (error) {
//     // If exec_sql doesn't work, try running individual operations
//     console.log('ℹ️  Falling back to individual operations...');
//     throw error;
//   }
// }

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Seeding failed:', error.message);
      process.exit(1);
    });
}

module.exports = { seedDatabase };
