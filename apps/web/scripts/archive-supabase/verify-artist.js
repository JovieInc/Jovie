const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Supabase credentials
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Verify an artist
async function verifyArtist(handle) {
  try {
    const { data, error } = await supabase
      .from('artists')
      .update({ is_verified: true })
      .eq('handle', handle)
      .select('name, handle, is_verified');

    if (error) {
      console.error(`❌ Error verifying ${handle}:`, error);
      return false;
    }

    if (data && data.length > 0) {
      console.log(`✅ Verified ${data[0].name} (${data[0].handle})`);
      return true;
    } else {
      console.error(`❌ Artist with handle '${handle}' not found`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error verifying ${handle}:`, error);
    return false;
  }
}

// Unverify an artist
async function unverifyArtist(handle) {
  try {
    const { data, error } = await supabase
      .from('artists')
      .update({ is_verified: false })
      .eq('handle', handle)
      .select('name, handle, is_verified');

    if (error) {
      console.error(`❌ Error unverifying ${handle}:`, error);
      return false;
    }

    if (data && data.length > 0) {
      console.log(`✅ Unverified ${data[0].name} (${data[0].handle})`);
      return true;
    } else {
      console.error(`❌ Artist with handle '${handle}' not found`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error unverifying ${handle}:`, error);
    return false;
  }
}

// List all verified artists
async function listVerifiedArtists() {
  try {
    const { data, error } = await supabase
      .from('artists')
      .select('name, handle, is_verified')
      .eq('is_verified', true)
      .order('name');

    if (error) {
      console.error('❌ Error fetching verified artists:', error);
      return;
    }

    console.log('\n📋 Verified Artists:');
    if (data && data.length > 0) {
      data.forEach(artist => {
        console.log(`  ✅ ${artist.name} (${artist.handle})`);
      });
    } else {
      console.log('  No verified artists found');
    }
  } catch (error) {
    console.error('❌ Error listing verified artists:', error);
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const handle = args[1];

  if (!command) {
    console.log('Usage:');
    console.log('  node scripts/verify-artist.js verify <handle>');
    console.log('  node scripts/verify-artist.js unverify <handle>');
    console.log('  node scripts/verify-artist.js list');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/verify-artist.js verify ladygaga');
    console.log('  node scripts/verify-artist.js unverify ladygaga');
    console.log('  node scripts/verify-artist.js list');
    return;
  }

  switch (command) {
    case 'verify':
      if (!handle) {
        console.error('❌ Please provide a handle to verify');
        return;
      }
      await verifyArtist(handle);
      break;

    case 'unverify':
      if (!handle) {
        console.error('❌ Please provide a handle to unverify');
        return;
      }
      await unverifyArtist(handle);
      break;

    case 'list':
      await listVerifiedArtists();
      break;

    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log('Available commands: verify, unverify, list');
      break;
  }
}

// Run the script
main();
